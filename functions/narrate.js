/**
 * narrate.js — Stage 2 of the uVidNova AI orchestrator.
 *
 * POST /api/narrate
 * Body: { asset } — a classified asset record (from Stage 1 or a stored JSON)
 *
 * Pipeline:
 *  1. Server performs all deterministic lookups (unit cost, multipliers).
 *  2. Server computes {low, central, high} for all three cost paths.
 *  3. Server retrieves financing templates and top precedents.
 *  4. Server assembles the complete structured payload.
 *  5. LLM narrates the payload (temperature 0.4) — no number invention.
 *  6. Validation gate traces every numeric token in the narration to the payload.
 *  7. Returns { payload, narration } or { error, unmatchedTokens, humanReview: true }.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chat } from './lib/groq.js';
import {
  getUnitCost,
  computeCostTriple,
  getFinancingTemplate,
  getTopPrecedents,
  getTechOverlays,
  buildFormulaInputs,
} from './lib/retrieval.js';
import { validateNarrative } from './lib/validation-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let _systemPrompt = null;
function systemPrompt() {
  return _systemPrompt ??= readFileSync(
    join(root, 'functions/_shared/prompts/stage2-narrate.md'), 'utf8'
  );
}

// ── Physical quantity selection (mirrors compute-costs.js logic) ──────────────

function getPhysicalQty(asset, unitCostEntry) {
  const specs = asset.physical_specs ?? {};
  const primary = unitCostEntry.primary_spec_field;
  if (primary && specs[primary]?.value > 0) {
    return { value: specs[primary].value, field: primary };
  }
  for (const [k, s] of Object.entries(specs)) {
    if (typeof s?.value === 'number' && s.value > 0 && s.source !== 'pending_data') {
      return { value: s.value, field: k };
    }
  }
  return null;
}

// ── Build the full retrieval payload ─────────────────────────────────────────

function buildPayload(asset) {
  const assetType     = asset.asset_type;
  const sector        = asset.sector;
  const oblast        = asset.location?.oblast;
  const destruction   = asset.damage?.destruction_level;
  const lifecycle     = asset.wartime_status?.lifecycle;
  const contingency   = lifecycle === 'documented' ? 1.25 : 1.15;

  const uc = getUnitCost(assetType);
  if (!uc) return { error: `No unit-cost entry for asset_type "${assetType}".` };

  const qtyResult = getPhysicalQty(asset, uc);
  if (!qtyResult) {
    return { error: `No usable physical_spec value for "${assetType}" (primary field: ${uc.primary_spec_field}).` };
  }

  const { value: qty } = qtyResult;

  const computePath = (path) => {
    const triple = computeCostTriple(uc, qty, destruction, oblast, path, contingency);
    const existingOverlays = asset.cost_paths?.[path]?.tech_overlays ?? [];
    if (path === 'build_back_better' && existingOverlays.length > 0) {
      triple.tech_overlays = existingOverlays;
    }
    return triple;
  };

  const costPayload = {
    baseline:          computePath('baseline'),
    code_compliant:    computePath('code_compliant'),
    build_back_better: computePath('build_back_better'),
  };

  const financing = {
    baseline:          getFinancingTemplate(sector, 'baseline'),
    code_compliant:    getFinancingTemplate(sector, 'code_compliant'),
    build_back_better: getFinancingTemplate(sector, 'build_back_better'),
  };

  const precedents = getTopPrecedents(sector, 'build_back_better', 3);

  // Resolve tech overlay metadata for any overlays on the BBB path
  const bbbOverlays = costPayload.build_back_better?.tech_overlays ?? [];
  const overlayDetails = getTechOverlays(bbbOverlays);

  const formulaInputs = buildFormulaInputs(uc, qty, destruction, oblast);
  formulaInputs.contingency = contingency;

  return {
    asset,
    cost_payload: costPayload,
    financing,
    precedents,
    overlay_details: overlayDetails,
    formula_inputs: formulaInputs,
  };
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJSON(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(stripped);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const asset = body.asset;
  if (!asset || typeof asset !== 'object' || !asset.asset_type) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Body must include an "asset" object with at least asset_type.' }),
    };
  }

  // Step 1–4: deterministic retrieval
  const payload = buildPayload(asset);
  if (payload.error) {
    return { statusCode: 422, body: JSON.stringify({ error: payload.error }) };
  }

  // Step 5: LLM narration
  let rawResponse;
  try {
    rawResponse = await chat(
      [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      { system: systemPrompt(), temperature: 0.4, max_tokens: 2048 },
    );
  } catch (err) {
    console.error('Groq API error (narrate):', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream API error. Please retry.' }),
    };
  }

  let narration;
  try {
    narration = extractJSON(rawResponse);
  } catch {
    console.error('narrate: failed to parse model JSON:', rawResponse.slice(0, 500));
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: 'Model returned non-JSON output.',
        raw: rawResponse.slice(0, 500),
      }),
    };
  }

  // Step 6: validation gate — traces every numeric token against the payload
  const fullText = Object.values(narration).filter(v => typeof v === 'string').join('\n');
  const validation = validateNarrative(fullText, payload);

  if (!validation.valid) {
    console.error('narrate: validation gate rejected narration. Unmatched tokens:', validation.unmatchedTokens);
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Narration contains numbers not traceable to retrieval payload. Routed to human review.',
        unmatchedTokens: validation.unmatchedTokens,
        humanReview: true,
        payload,
        rawNarration: narration,
      }),
    };
  }

  // Step 7: return clean result
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, narration }),
  };
};

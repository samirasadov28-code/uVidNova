/**
 * narrate.js — Stage 2 of the uVidNova AI orchestrator.
 *
 * POST /api/narrate
 * Body: { asset_id: string, path?: 'baseline'|'code_compliant'|'build_back_better' }
 *
 * Flow:
 *  1. Load the stored asset record from data/assets/<asset_id>.json.
 *  2. Build the retrieval payload from stored data (cost_paths already computed
 *     and stored by scripts/compute-costs.js — no recomputation here).
 *  3. Look up financing template, comparable precedents, and tech overlay details.
 *  4. Read the system prompt from functions/_shared/prompts/narrate_system.md.
 *  5. Call Claude (temperature 0.4) with the structured payload.
 *  6. Run validation-gate — every numeric token in the narrative must trace to the payload.
 *  7. Return { narrative, payload, validation } or HTTP 422 if the gate rejects.
 *
 * The LLM is a narrator only. Numbers come from deterministic lookups; the LLM
 * never computes, estimates, or adjusts a figure. See CLAUDE.md §7.
 */

import { readFileSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callClaude } from './lib/anthropic.js';
import { validateNarrative } from './lib/validation-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const dataRoot  = join(root, 'data');

// ── Static data caches ────────────────────────────────────────────────────────

let _financingTemplates = null;
let _precedents         = null;
let _techOverlays       = null;
let _systemPrompt       = null;

function loadJSON(absPath) {
  return JSON.parse(readFileSync(absPath, 'utf8'));
}

function financingTemplates() {
  return _financingTemplates ??= loadJSON(join(dataRoot, 'financing_templates.json'));
}

function allPrecedents() {
  return _precedents ??= loadJSON(join(dataRoot, 'precedents.json'));
}

function allTechOverlays() {
  return _techOverlays ??= loadJSON(join(dataRoot, 'tech_overlays.json'));
}

function systemPrompt() {
  return _systemPrompt ??= readFileSync(
    join(root, 'functions/_shared/prompts/narrate_system.md'), 'utf8'
  );
}

// ── Retrieval helpers ─────────────────────────────────────────────────────────

/**
 * Return the financing template for a given sector and path, falling back to
 * null if no template is found. The template's central tranche values are used.
 */
function lookupFinancingTemplate(sector, path) {
  const templates = financingTemplates();

  // financing_templates.json uses either .sector or .sector_group as the key
  const match = templates.find(t =>
    (t.sector === sector || t.sector_group === sector) && t.path === path
  );
  if (!match) return null;

  // Extract central values from tranches for the payload
  if (match.tranches) {
    const flat = {};
    for (const [key, val] of Object.entries(match.tranches)) {
      flat[key] = typeof val === 'object' ? val.central : val;
    }
    return { template_id: match.template_id, path, ...flat, rationale: match.rationale ?? null };
  }

  return match;
}

/**
 * Return up to n comparable precedents for the given sector.
 * Filters by sector match; path filter is optional (some precedents omit it).
 */
function lookupPrecedents(sector, n = 3) {
  return allPrecedents()
    .filter(p => p.sector === sector)
    .slice(0, n);
}

/**
 * Return tech overlay details for the given array of overlay IDs.
 */
function lookupTechOverlays(overlayIds) {
  if (!overlayIds || overlayIds.length === 0) return [];
  const all = allTechOverlays();
  return overlayIds
    .map(id => all.find(o => o.overlay_id === id))
    .filter(Boolean);
}

// ── Disclaimer ────────────────────────────────────────────────────────────────

const ASSET_DISCLAIMER =
  'Cost and financing-structure figures are estimates derived from published ' +
  'unit-cost benchmarks (RDNA3, KSE Institute) and named comparable Ukrainian ' +
  'precedents. They are not guarantees, not procurement quotes, and not a ' +
  'substitute for transaction-level due diligence.';

// ── Payload builder ───────────────────────────────────────────────────────────

/**
 * Build the complete structured payload that is passed to the LLM.
 * Cost paths are read directly from the stored asset JSON (computed at entry
 * time by scripts/compute-costs.js — the LLM never recomputes them).
 *
 * @param {object} asset  — the full stored asset record
 * @param {string} path   — 'baseline' | 'code_compliant' | 'build_back_better'
 * @returns {object} payload
 */
function buildPayload(asset, path) {
  const sector = asset.sector;

  // Cost paths — read from stored asset JSON as-is
  const cost_paths = asset.cost_paths ?? null;

  // Financing structure — prefer the asset's own financing_structures entry;
  // fall back to the template from financing_templates.json.
  let financing_structure = null;
  if (asset.financing_structures?.[path]) {
    financing_structure = { path, ...asset.financing_structures[path] };
  } else {
    financing_structure = lookupFinancingTemplate(sector, path);
  }

  // Comparable precedents — up to 3 for this sector
  const comparable_precedents = lookupPrecedents(sector, 3);

  // Tech overlays — only for build_back_better path
  const bbbOverlayIds = asset.cost_paths?.build_back_better?.tech_overlays ?? [];
  const tech_overlays = path === 'build_back_better'
    ? lookupTechOverlays(bbbOverlayIds)
    : [];

  return {
    asset_id:             asset.asset_id,
    asset_type:           asset.asset_type,
    name:                 asset.name,
    location:             asset.location,
    damage:               asset.damage,
    wartime_status:       asset.wartime_status,
    physical_specs:       asset.physical_specs ?? null,
    cost_paths,
    financing_structure,
    comparable_precedents,
    tech_overlays,
    requested_path:       path,
    disclaimer:           ASSET_DISCLAIMER,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const { asset_id, path: requestedPath = 'build_back_better' } = body;

  if (!asset_id || typeof asset_id !== 'string') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Body must include a string "asset_id".' }),
    };
  }

  const validPaths = ['baseline', 'code_compliant', 'build_back_better'];
  if (!validPaths.includes(requestedPath)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `"path" must be one of: ${validPaths.join(', ')}.` }),
    };
  }

  // Step 1 — load the stored asset record
  let asset;
  try {
    const assetPath = join(dataRoot, 'assets', `${asset_id}.json`);
    const raw = await fsPromises.readFile(assetPath, 'utf8');
    asset = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: `Asset "${asset_id}" not found in data/assets/.` }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to read asset record.', detail: err.message }),
    };
  }

  // Step 2–4 — build the retrieval payload (deterministic lookups only)
  const payload = buildPayload(asset, requestedPath);

  // Step 5 — build the user message and call Claude
  const userMessage =
    'Narrate the following asset record. Every number you use must appear in this payload.\n\n' +
    JSON.stringify(payload, null, 2);

  let claudeResponse;
  try {
    claudeResponse = await callClaude({
      systemPrompt: systemPrompt(),
      userMessage,
      temperature: 0.4,
      maxTokens: 1500,
    });
  } catch (err) {
    console.error('narrate: Claude API error:', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream API error. Please retry.' }),
    };
  }

  const narrative = claudeResponse.content;

  // Step 6 — validation gate: every numeric token in the narrative must trace to the payload
  const validation = validateNarrative(narrative, payload);

  if (!validation.valid) {
    // Do NOT return the narrative. Log for human review.
    console.error(
      'narrate: validation gate REJECTED narration for asset:', asset_id,
      '\nUnmatched tokens:', validation.unmatched,
      '\n--- Full narrative (not returned to client) ---\n', narrative
    );
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Validation gate: narrative contains unmatched numeric tokens.',
        unmatched: validation.unmatched,
        payload_summary: { asset_id, path: requestedPath },
      }),
    };
  }

  // Step 7 — return clean result
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ narrative, payload, validation }),
  };
};

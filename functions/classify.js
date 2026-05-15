/**
 * classify.js — Stage 1 of the uVidNova AI orchestrator.
 *
 * POST /api/classify
 * Body: { description: string, sources: [{title, url}], lat?: number, lon?: number, oblast?: string }
 *
 * Calls Claude at temperature 0.2 to classify an asset from OSINT input.
 * Validates that asset_type is in the taxonomy before returning.
 * Computes deterministic cost_paths server-side — the LLM never touches numbers.
 * Never produces financing output — that is Stage 2 (narrate.js).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { callClaude } from './lib/anthropic.js';
import {
  loadStaticData,
  computeCostPaths,
  validateAssetType,
} from './lib/retrieval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Module-level cache (warm instances reuse these) ───────────────────────────

let _systemPrompt = null;
let _staticData   = null;

function systemPrompt() {
  if (_systemPrompt) return _systemPrompt;
  const promptPath = new URL('./_shared/prompts/classify_system.md', import.meta.url);
  _systemPrompt = readFileSync(fileURLToPath(promptPath), 'utf8');
  return _systemPrompt;
}

async function staticData() {
  if (_staticData) return _staticData;
  _staticData = await loadStaticData();
  return _staticData;
}

// ── Input validation ──────────────────────────────────────────────────────────

function validateInput(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object.';
  if (!body.description || typeof body.description !== 'string' || body.description.trim().length < 20) {
    return 'Field "description" is required and must be at least 20 characters.';
  }
  if (!Array.isArray(body.sources) || body.sources.length === 0) {
    return 'Field "sources" must be a non-empty array of source citations or URLs.';
  }
  return null;
}

// ── Taxonomy list builder ─────────────────────────────────────────────────────

/**
 * Flatten the taxonomy into a list of { asset_type, sector, label_en } objects
 * so the LLM receives a complete, unambiguous menu to pick from.
 */
function buildTaxonomyList(sd) {
  const list = [];
  for (const [sectorKey, sectorDef] of Object.entries(sd.taxonomy.sectors ?? {})) {
    for (const [typeKey, typeDef] of Object.entries(sectorDef.subtypes ?? {})) {
      // The sector prefix is the first segment of the asset_type key
      const sectorPrefix = typeKey.split('.')[0];
      list.push({
        asset_type: typeKey,
        sector: sectorPrefix,
        label_en: typeDef.label_en,
        physical_unit: typeDef.physical_unit,
      });
    }
  }
  return list;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJSON(text) {
  // Strip markdown fences if the model added them despite the instruction
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(stripped);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  // Method guard
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed.' }),
    };
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body.' }),
    };
  }

  // Validate input fields before making any external calls
  const inputError = validateInput(body);
  if (inputError) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: inputError }),
    };
  }

  // API key guard — checked after input validation so 400s surface cleanly
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('classify: ANTHROPIC_API_KEY not configured.');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured.' }),
    };
  }

  // Load static data (cached after first call)
  let sd;
  try {
    sd = await staticData();
  } catch (err) {
    console.error('classify: failed to load static data:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to load static data.' }),
    };
  }

  // Build user message: description + sources + coordinates + full taxonomy list
  const userMessage = JSON.stringify({
    description:    body.description.trim(),
    sources:        body.sources,
    lat:            body.lat    ?? null,
    lon:            body.lon    ?? null,
    oblast:         body.oblast ?? null,
    taxonomy:       buildTaxonomyList(sd),
  }, null, 2);

  // Call Claude
  let claudeResult;
  try {
    claudeResult = await callClaude({
      systemPrompt: systemPrompt(),
      userMessage,
      temperature: 0.2,
      maxTokens: 2000,
    });
  } catch (err) {
    console.error('classify: Anthropic API error:', err.message);
    // Distinguish missing-key (already caught above) from API-level failure
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Upstream API error: ${err.message}` }),
    };
  }

  const { content, usage } = claudeResult;

  // Parse the model's JSON output
  let asset;
  try {
    asset = extractJSON(content);
  } catch (err) {
    console.error('classify: failed to parse model JSON. Raw output (first 500 chars):', content.slice(0, 500));
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Classification output was not valid JSON.',
        raw: content.slice(0, 500),
      }),
    };
  }

  // Validate asset_type against taxonomy
  const warnings = [];
  const typeCheck = validateAssetType(asset.asset_type, sd);
  if (!typeCheck.valid) {
    const msg = `asset_type "${asset.asset_type}" is not in the taxonomy.`;
    if (typeCheck.suggestion) {
      warnings.push(`${msg} Nearest match: "${typeCheck.suggestion}". Substituted automatically.`);
      asset.asset_type = typeCheck.suggestion;
      // Realign sector to the corrected asset_type prefix
      asset.sector = typeCheck.suggestion.split('.')[0];
    } else {
      warnings.push(`${msg} No close match found — cost computation skipped.`);
    }
  }

  // Compute deterministic cost_paths (server-side — LLM never touches these numbers)
  const costPaths = computeCostPaths(
    asset.asset_type,
    asset.physical_specs ?? {},
    asset.damage?.destruction_level,
    asset.location?.oblast,
    sd,
  );

  // Return structured result
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset,
      cost_paths: costPaths,
      warnings,
      _meta: {
        model: 'claude-sonnet-4-6',
        temperature: 0.2,
        usage,
      },
    }),
  };
};

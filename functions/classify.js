/**
 * classify.js — Stage 1 of the uVidNova AI orchestrator.
 *
 * POST /api/classify
 * Body: { description, sources, location_hint, photo_description? }
 *
 * Calls Claude at temperature 0.2 to classify an asset from OSINT input.
 * Validates that asset_type is in the taxonomy before returning.
 * Never produces cost or financing output — that is Stage 2 (narrate.js).
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getClient } from './lib/anthropic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadText(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function loadJSON(relPath) {
  return JSON.parse(loadText(relPath));
}

// Cache prompt and taxonomy in module scope (warm starts reuse them)
let _systemPrompt = null;
let _taxonomyTypes = null;

function systemPrompt() {
  return _systemPrompt ??= loadText('functions/_shared/prompts/stage1-classify.md');
}

function taxonomyTypes() {
  if (_taxonomyTypes) return _taxonomyTypes;
  const tax = loadJSON('data/taxonomy.json');
  const types = new Set();
  for (const sector of Object.values(tax.sectors ?? {})) {
    for (const key of Object.keys(sector.subtypes ?? {})) {
      types.add(key);
    }
  }
  _taxonomyTypes = types;
  return types;
}

// ── Input validation ──────────────────────────────────────────────────────────

function validateInput(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object.';
  if (!body.description || typeof body.description !== 'string' || body.description.trim().length < 20) {
    return 'Field "description" is required and must be at least 20 characters.';
  }
  if (!Array.isArray(body.sources) || body.sources.length === 0) {
    return 'Field "sources" must be a non-empty array of source URLs or citations.';
  }
  return null;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJSON(text) {
  // Strip markdown fences if present
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

  const inputError = validateInput(body);
  if (inputError) {
    return { statusCode: 400, body: JSON.stringify({ error: inputError }) };
  }

  // Build user message
  const userMessage = JSON.stringify({
    description: body.description.trim(),
    sources: body.sources,
    location_hint: body.location_hint ?? null,
    photo_description: body.photo_description ?? null,
  }, null, 2);

  let rawResponse;
  try {
    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      temperature: 0.2,
      system: systemPrompt(),
      messages: [{ role: 'user', content: userMessage }],
    });
    rawResponse = message.content[0]?.text ?? '';
  } catch (err) {
    console.error('Anthropic API error (classify):', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream API error. Please retry.' }),
    };
  }

  let classification;
  try {
    classification = extractJSON(rawResponse);
  } catch (err) {
    console.error('classify: failed to parse model JSON:', rawResponse.slice(0, 500));
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: 'Model returned non-JSON output.',
        raw: rawResponse.slice(0, 500),
      }),
    };
  }

  // Validate asset_type is in taxonomy
  if (!classification.asset_type || !taxonomyTypes().has(classification.asset_type)) {
    return {
      statusCode: 422,
      body: JSON.stringify({
        error: `asset_type "${classification.asset_type}" is not in the taxonomy. Add it via a separate PR.`,
        classification,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classification }),
  };
};

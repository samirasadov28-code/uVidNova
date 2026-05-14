/**
 * validation-gate.js
 *
 * Validates every numeric token in a generated narrative against the
 * structured retrieval payload before any narration is returned to the client.
 *
 * Rule: if a numeric token in the narrative cannot be traced to the payload
 * within ±1% tolerance, the narration is REJECTED and routed to human review.
 *
 * See CLAUDE.md §7.2 for the full specification.
 */

// ── Token extraction ──────────────────────────────────────────────────────────

/**
 * Extracts numeric tokens that look like financial/physical quantities.
 * The optional suffix captures a unit that may follow the number, ensuring
 * scale context is preserved for canonicalisation.
 */
const NUMERIC_TOKEN_RE = /[-+]?\d[\d,.]*(?:\s*(?:billion|bn|million|m|%|USD|EUR|UAH|km|MW|MVA|m²|km²|ha|beds?|units?|tonnes?|years?|seats?))?/gi;

/**
 * Year whitelist: any token whose digit-only form looks like a calendar year
 * (1900–2099). This avoids whitelisting arbitrary 4-digit financial figures
 * like "8,000" or "1,032" which strip commas to also become 4 digits.
 */
const YEAR_PATTERN = /^(19|20)\d{2}$/;

function isLikelyYear(tok) {
  // Keep only digits, then check if it looks like a year
  const digitsOnly = tok.trim().replace(/[^0-9]/g, '');
  return YEAR_PATTERN.test(digitsOnly);
}

/** Single-digit tokens — almost always ordinal/count context, not financial. */
const SINGLE_DIGIT_RE = /^\d$/;

function normaliseToken(tok) {
  return tok.replace(/\s+/g, '').toLowerCase();
}

export function extractNumericTokens(text) {
  const raw = text.match(NUMERIC_TOKEN_RE) ?? [];
  return raw.filter(tok => {
    if (isLikelyYear(tok)) return false;
    if (SINGLE_DIGIT_RE.test(normaliseToken(tok))) return false;
    return true;
  });
}

// ── Token → canonical number ──────────────────────────────────────────────────

/**
 * Parses a token to its canonical numeric value and whether it is a percentage.
 * Returns null if the token is unparseable.
 *
 * Scale handling (all payload USD values are in millions):
 *   "1.5 billion" → 1500   (billion × 1000)
 *   "USD 52M"     → 52     (million suffix → as-is in USD M context)
 *   "55%"         → 55     (percentage — matched in pct bucket)
 *   "1,032"       → 1032   (comma-separated integer)
 */
export function tokenToCanonical(tok) {
  if (!tok) return null;
  const n = normaliseToken(tok);
  const isPct = n.includes('%');

  const stripped = n
    .replace(/usd|eur|uah/g, '')
    .replace(/m²|km²|km|mva|mw|ha|beds?|units?|tonnes?|years?|seats?|%/g, '')
    .replace(/billion|bn/g, '__BN__')
    .replace(/million|(?<![a-z])m(?![a-z²])/g, '__M__') // 'm' suffix for millions
    .replace(/,/g, '')
    .trim();

  let base = parseFloat(stripped.replace(/__BN__|__M__/g, ''));
  if (isNaN(base)) return null;

  if (stripped.includes('__BN__')) {
    base *= 1000; // convert billion to millions for payload comparison
  }
  // '__M__' suffix means the value is already in millions — leave as-is

  return { value: base, isPct };
}

// ── Payload flattening ────────────────────────────────────────────────────────

function flattenPayload(obj, pcts, nums, depth = 0) {
  if (depth > 8 || obj === null || obj === undefined) return;
  if (typeof obj === 'number') {
    nums.add(obj);
    // Integers 0–100 are also put in the percentage bucket for stack matching
    if (Number.isInteger(obj) && obj >= 0 && obj <= 100) pcts.add(obj);
    return;
  }
  if (typeof obj === 'object') {
    for (const val of Object.values(obj)) {
      flattenPayload(val, pcts, nums, depth + 1);
    }
  }
}

function buildPayloadSets(payload) {
  const nums = new Set();
  const pcts = new Set();
  flattenPayload(payload, pcts, nums);
  return { nums, pcts };
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * ±1% tolerance. Tight enough to catch single-digit-percent hallucinations
 * (e.g. 58M vs 57M = 1.75% — caught) while accepting genuine rounding
 * (exact integers always match themselves).
 *
 * No ±absolute fallback — it caused false passes for small multiplier values
 * (e.g. 1.5 matched 1.15 via ±0.5 absolute).
 */
function isCloseEnough(a, b) {
  if (a === b) return true;
  const denom = Math.abs(b);
  if (denom < 0.001) return Math.abs(a) < 0.001;
  return Math.abs(a - b) / denom <= 0.01;
}

function tokenMatchesPayload(canonical, payloadNums, payloadPcts) {
  const { value, isPct } = canonical;
  // Check the primary bucket (pct → pcts, non-pct → nums)
  const primary   = isPct ? payloadPcts : payloadNums;
  const secondary = isPct ? payloadNums : payloadPcts;
  for (const p of primary)   { if (isCloseEnough(value, p)) return true; }
  for (const p of secondary) { if (isCloseEnough(value, p)) return true; }
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates a narrative string against its retrieval payload.
 *
 * @param {string} narrative
 * @param {object} retrievalPayload — the full structured payload passed to the LLM
 * @returns {{ valid: true } | { valid: false, unmatchedTokens: string[] }}
 */
export function validateNarrative(narrative, retrievalPayload) {
  const tokens = extractNumericTokens(narrative);
  const { nums, pcts } = buildPayloadSets(retrievalPayload);

  const unmatched = [];
  for (const tok of tokens) {
    const canonical = tokenToCanonical(tok);
    if (canonical === null) continue;
    if (!tokenMatchesPayload(canonical, nums, pcts)) {
      unmatched.push(tok.trim());
    }
  }

  return unmatched.length > 0
    ? { valid: false, unmatchedTokens: unmatched }
    : { valid: true };
}

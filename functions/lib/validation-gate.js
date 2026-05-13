/**
 * validation-gate.js
 *
 * Validates every numeric token in a generated narrative against
 * the structured retrieval payload before any narration is returned to the client.
 *
 * Rule: if a numeric token in the narrative cannot be traced to the payload,
 * the narration is REJECTED and routed to human review.
 *
 * See CLAUDE.md §7.2 for the full specification.
 */

// Regex: extracts numeric tokens that look like financial/physical quantities.
// Dates (bare 4-digit years like 2024) are whitelisted.
const NUMERIC_TOKEN_RE = /[-+]?\d[\d,]*\.?\d*\s*(?:%|m(?:illion)?|bn|billion|USD|EUR|UAH|km|MW|MVA|m²|km²|bed[s]?|unit[s]?|t(?:onne)?[s]?|year[s]?)?/gi;

const BARE_YEAR_RE = /^\d{4}$/;

function extractNumericTokens(text) {
  const matches = text.match(NUMERIC_TOKEN_RE) ?? [];
  return matches.filter(tok => {
    const bare = tok.trim().replace(/,/g, '');
    if (BARE_YEAR_RE.test(bare)) return false; // whitelist bare years
    return true;
  });
}

function flattenPayload(obj, depth = 0) {
  if (depth > 6) return [];
  const nums = [];
  for (const val of Object.values(obj ?? {})) {
    if (typeof val === 'number') {
      nums.push(val);
    } else if (typeof val === 'object' && val !== null) {
      nums.push(...flattenPayload(val, depth + 1));
    }
  }
  return nums;
}

function tokenToNumber(tok) {
  const normalised = tok
    .replace(/,/g, '')
    .replace(/USD|EUR|UAH|km|MW|MVA|m²|km²|beds?|units?|tonnes?|years?|billion|million|bn|m/gi, '')
    .trim();
  const n = parseFloat(normalised);
  return isNaN(n) ? null : n;
}

function isApproximatelyInPayload(n, payloadNums, tolerancePct = 0.02) {
  for (const p of payloadNums) {
    if (p === 0 && n === 0) return true;
    if (p === 0) continue;
    if (Math.abs(n - p) / Math.abs(p) <= tolerancePct) return true;
    // Also allow for M suffix (millions): token "52" matches payload 52
    if (Math.abs(n - p) <= 0.5) return true;
  }
  return false;
}

/**
 * Validates a narrative string against its retrieval payload.
 * Returns { valid: true } or { valid: false, unmatchedTokens: string[] }
 */
export function validateNarrative(narrative, retrievalPayload) {
  const tokens = extractNumericTokens(narrative);
  const payloadNums = flattenPayload(retrievalPayload);

  const unmatched = [];
  for (const tok of tokens) {
    const n = tokenToNumber(tok);
    if (n === null) continue;
    if (!isApproximatelyInPayload(n, payloadNums)) {
      unmatched.push(tok);
    }
  }

  if (unmatched.length > 0) {
    return { valid: false, unmatchedTokens: unmatched };
  }
  return { valid: true };
}

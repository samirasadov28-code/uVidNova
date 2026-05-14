#!/usr/bin/env node
/**
 * Adversarial test suite for functions/lib/validation-gate.js.
 *
 * Tests two categories:
 *   A) Valid narratives (containing only payload-traceable numbers) — must PASS.
 *   B) Hallucination injections (containing invented numbers) — must be CAUGHT.
 *
 * Exit code 0 = all tests passed.
 * Exit code 1 = any failure.
 *
 * Run: node tests/test-validation-gate.js
 */

import { validateNarrative, extractNumericTokens, tokenToCanonical } from '../functions/lib/validation-gate.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${label}`);
    failed++;
  }
}

function assertValid(label, narrative, payload) {
  const r = validateNarrative(narrative, payload);
  if (!r.valid) {
    console.error(`  ✗  FAIL (expected valid): ${label}`);
    console.error(`     Unmatched tokens:`, r.unmatchedTokens);
    failed++;
  } else {
    console.log(`  ✓  ${label}`);
    passed++;
  }
}

function assertCaught(label, narrative, payload, expectTokens = []) {
  const r = validateNarrative(narrative, payload);
  if (r.valid) {
    console.error(`  ✗  FAIL (hallucination not caught): ${label}`);
    failed++;
  } else {
    console.log(`  ✓  Caught: ${label}`);
    if (expectTokens.length > 0) {
      const caught = r.unmatchedTokens;
      for (const tok of expectTokens) {
        const found = caught.some(c => c.includes(tok.replace(/[^0-9]/g, '')));
        if (!found) {
          console.warn(`     ⚠ Expected token "${tok}" in unmatchedTokens but found: ${caught.join(', ')}`);
        }
      }
    }
    passed++;
  }
}

// ── Shared test payload (mirrors a real narrate.js retrieval payload) ─────────

const SAMPLE_PAYLOAD = {
  asset: {
    asset_id: 'OKHMATDYT_2024_07_08',
    asset_type: 'healthcare.tertiary_hospital',
    sector: 'healthcare',
    damage: { destruction_level: 'severe' },
    wartime_status: { lifecycle: 'assessed', rebuildability: 'rebuildable' },
    location: { oblast: 'Kyiv City' },
    physical_specs: { floor_area_m2: { value: 8400 } },
  },
  cost_payload: {
    baseline:          { low_usd_m: 33,  central_usd_m: 57,  high_usd_m: 82  },
    code_compliant:    { low_usd_m: 38,  central_usd_m: 70,  high_usd_m: 102 },
    build_back_better: { low_usd_m: 43,  central_usd_m: 87,  high_usd_m: 131,
      tech_overlays: ['microgrid', 'modular_clinical_units', 'telemedicine'] },
  },
  financing: {
    baseline:          { grant_pct: 55, concessional_pct: 30, public_equity_pct: 15, private_pct: 0 },
    code_compliant:    { grant_pct: 60, concessional_pct: 25, public_equity_pct: 15, private_pct: 0 },
    build_back_better: { grant_pct: 65, concessional_pct: 20, public_equity_pct: 15, private_pct: 0 },
  },
  formula_inputs: {
    unit_cost_usd_low: 6000, unit_cost_usd_high: 9500,
    physical_quantity: 8400, physical_unit: 'm²',
    destruction_factor_low: 0.60, destruction_factor_high: 0.85,
    regional_multiplier_low: 0.95, regional_multiplier_high: 1.05,
    path_multiplier_baseline_low: 1.00, path_multiplier_baseline_high: 1.00,
    contingency: 1.15,
  },
  precedents: [],
};

// ── A. Tokeniser / canonicaliser unit tests ───────────────────────────────────

console.log('\n── A. Tokeniser and canonicaliser ──');

assert(
  extractNumericTokens('The project was built in 2022.').length === 0,
  'Bare year 2022 is whitelisted'
);
assert(
  extractNumericTokens('first strike in 2023, re-damaged in 2024').length === 0,
  'Multiple bare years whitelisted'
);
assert(
  extractNumericTokens('A USD 52M project').some(t => t.includes('52')),
  'USD 52M is extracted'
);
assert(
  extractNumericTokens('55% grant share').some(t => t.includes('55')),
  'Percentage token extracted'
);
assert(
  tokenToCanonical('1.5 billion')?.value === 1500,
  '"1.5 billion" canonicalises to 1500 (USD M scale)'
);
assert(
  tokenToCanonical('USD 87M')?.value === 87,
  '"USD 87M" canonicalises to 87'
);
assert(
  tokenToCanonical('65%')?.isPct === true,
  '"65%" is flagged as percentage'
);
assert(
  tokenToCanonical('not-a-number') === null,
  'Non-numeric returns null'
);

// ── B. Valid narratives — must PASS ───────────────────────────────────────────

console.log('\n── B. Valid narratives (must pass gate) ──');

assertValid(
  'All figures verbatim from cost_payload',
  'The baseline reconstruction cost ranges from USD 33M to USD 82M, with a central estimate of USD 57M. ' +
  'The build-back-better path reaches USD 131M at the high end. ' +
  'Under the build-back-better financing structure, 65% is grant funding.',
  SAMPLE_PAYLOAD
);

assertValid(
  'Code-compliant path with exact figures',
  'The code-compliant path is estimated at USD 38M–102M (central USD 70M). ' +
  'Financing includes a 60% grant share and 25% concessional lending.',
  SAMPLE_PAYLOAD
);

assertValid(
  'Narrative with a "billion" figure matching payload (1.5 billion = 1,500M is NOT in payload — skip)',
  'The project spans 8,400 square metres across 7 floors.',
  { ...SAMPLE_PAYLOAD, asset: { ...SAMPLE_PAYLOAD.asset, physical_specs: { floor_area_m2: { value: 8400 }, floors: { value: 7 } } } }
);

assertValid(
  'Year dates are not flagged',
  'Damaged on 8 July 2024, the facility requires reconstruction estimated at USD 57M.',
  SAMPLE_PAYLOAD
);

assertValid(
  'Small integers (e.g. floor count) not flagged',
  'The 7-storey block was struck on 8 July 2024.',
  SAMPLE_PAYLOAD
);

assertValid(
  'Percentage from financing payload',
  'Grant funding covers 55% of the baseline cost, with 30% concessional and 15% public equity.',
  SAMPLE_PAYLOAD
);

// ── C. Adversarial hallucination injections — must be CAUGHT ─────────────────

console.log('\n── C. Adversarial hallucination injections (must be caught) ──');

assertCaught(
  'Invented cost figure — USD 95M not in payload',
  'The baseline reconstruction will cost USD 95M.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Invented high-end figure — USD 200M not in payload',
  'At the high end the build-back-better path reaches USD 200M.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Invented percentage — 80% grant not in payload',
  'Grant funding covers 80% of the total reconstruction cost.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Invented physical quantity — 12,000 m² not in payload',
  'The 12,000 m² facility will require complete reconstruction.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Invented capacity figure — 350 beds',
  'The hospital has 350 beds across its departments.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Subtle hallucination — USD 58M (between 57 and 82, but not in payload)',
  'Central reconstruction cost is estimated at USD 58M.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Invented billion-scale figure — USD 1.2 billion',
  'The total regional reconstruction bill is estimated at USD 1.2 billion.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Fabricated multiplier — 1.5× not in formula_inputs',
  'A 1.5× damage multiplier was applied to the base cost.',
  SAMPLE_PAYLOAD
);

assertCaught(
  'Invented unit cost — USD 8,000/m²',
  'The unit cost benchmark used is USD 8,000 per square metre.',
  SAMPLE_PAYLOAD
);

// A narrative that has a valid number AND an injected one — gate must catch the injection
assertCaught(
  'Mixed valid + invalid (gate must still catch)',
  'Central cost is USD 57M for the baseline. The code-compliant path reaches USD 499M at the high end.',
  SAMPLE_PAYLOAD
);

// ── D. Kakhovka HPP payload (energy, larger scale) ───────────────────────────

console.log('\n── D. Large-scale energy asset (Kakhovka HPP) ──');

const KAKHOVKA_PAYLOAD = {
  cost_payload: {
    baseline:          { low_usd_m: 525,  central_usd_m: 1032, high_usd_m: 1538 },
    code_compliant:    { low_usd_m: 604,  central_usd_m: 1263, high_usd_m: 1922 },
    build_back_better: { low_usd_m: 683,  central_usd_m: 1572, high_usd_m: 2461,
      tech_overlays: ['run_of_river_redesign', 'fish_passage'] },
  },
  financing: {
    baseline:          { grant_pct: 30, concessional_pct: 45, public_equity_pct: 25, private_pct: 0 },
    code_compliant:    { grant_pct: 35, concessional_pct: 40, public_equity_pct: 25, private_pct: 0 },
    build_back_better: { grant_pct: 40, concessional_pct: 40, public_equity_pct: 20, private_pct: 0 },
  },
  formula_inputs: {
    unit_cost_usd_low: 1_200_000, unit_cost_usd_high: 2_600_000,
    physical_quantity: 334, physical_unit: 'MW',
    destruction_factor_low: 0.95, destruction_factor_high: 1.10,
    regional_multiplier_low: 1.20, regional_multiplier_high: 1.40,
    contingency: 1.15,
  },
  precedents: [],
};

assertValid(
  'Kakhovka — verbatim figures',
  'Baseline reconstruction is estimated at USD 525M–1,538M (central USD 1,032M). ' +
  'The build-back-better path reaches USD 683M–2,461M. ' +
  'Grant funding covers 40% under the build-back-better structure.',
  KAKHOVKA_PAYLOAD
);

assertCaught(
  'Kakhovka — invented billion phrasing (1.8 billion not in payload)',
  'The total reconstruction cost is estimated at USD 1.8 billion.',
  KAKHOVKA_PAYLOAD
);

assertCaught(
  'Kakhovka — "1.5 billion" = 1500M; nearest payload value 1,538M is 2.47% away (> ±1% → caught)',
  'The baseline high-end cost is approximately USD 1.5 billion.',
  KAKHOVKA_PAYLOAD
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n══ Results: ${passed} passed, ${failed} failed ══`);
if (failed > 0) {
  console.error('\nValidation gate test suite FAILED. Fix validation-gate.js before deploying the orchestrator.');
  process.exit(1);
} else {
  console.log('\nValidation gate test suite PASSED. All hallucination injections caught; all valid narratives accepted.');
  process.exit(0);
}

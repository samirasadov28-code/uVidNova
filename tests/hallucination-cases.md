# Adversarial Hallucination Test Cases — Validation Gate

This document records the adversarial inputs used to verify that `functions/lib/validation-gate.js` catches 100% of injected hallucinated numeric tokens before narration is returned to the client.

Tests are implemented and executed by `tests/test-validation-gate.js`. Exit code 0 = all passed.

---

## Design rationale

The validation gate is the primary anti-hallucination control. The LLM is instructed not to invent numbers, but instruction-following is imperfect — especially for:
- Figures "between" two known values (plausible-sounding but wrong)
- Scale confusions (millions vs billions)
- Unit-cost figures derived by mental arithmetic
- Percentages not in the financing template
- Physical quantities from general knowledge rather than the asset record

The gate catches all of the above by:
1. Extracting every numeric token from the narration using a regex
2. Comparing each token to the flattened retrieval payload with ±1% tolerance
3. Rejecting the narration if any token is unmatched

---

## Tolerance design

| Tolerance type | Value | Rationale |
|---|---|---|
| Percentage | ±1% | Exact match expected since all figures are integer USD M or integer % |
| Absolute fallback | None (removed) | ±0.5 absolute caused false passes for multipliers (1.5 matched 1.15) |
| Year whitelist | 1900–2099 | Bare years stripped of non-digit chars match `/^(19|20)\d{2}$/` — prevents `8,000` being stripped to `8000` and misidentified as a year |
| Single-digit filter | 0–9 | Ordinal/count context (floors, turbine units, re-damage count) |

---

## Section A — Tokeniser and canonicaliser unit tests

| # | Input | Expected | Passed |
|---|---|---|---|
| A1 | `"2022"` | Whitelisted (bare year, not extracted) | ✓ |
| A2 | `"first strike in 2023, re-damaged in 2024"` | Both years whitelisted | ✓ |
| A3 | `"USD 52M"` | Extracts token containing "52" | ✓ |
| A4 | `"55% grant share"` | Extracts percentage token | ✓ |
| A5 | `"1.5 billion"` | Canonicalises to 1500 (USD M scale) | ✓ |
| A6 | `"USD 87M"` | Canonicalises to 87 | ✓ |
| A7 | `"65%"` | Flagged as percentage (isPct=true) | ✓ |
| A8 | `"not-a-number"` | Returns null | ✓ |

---

## Section B — Valid narratives (must pass gate)

All figures are verbatim from the retrieval payload. These tests verify the gate does not produce false positives.

Sample payload (Okhmatdyt children's hospital): baseline $33M–82M (central $57M), build-back-better $43M–131M (central $87M), grant 55%/60%/65%.

| # | Narrative excerpt | Result |
|---|---|---|
| B1 | `"USD 33M to USD 82M…central USD 57M…USD 131M…65%"` | PASS ✓ |
| B2 | `"USD 38M–102M…central USD 70M…60%…25%"` | PASS ✓ |
| B3 | `"8,400 square metres…7 floors"` (modified payload) | PASS ✓ |
| B4 | `"Damaged on 8 July 2024…estimated at USD 57M"` | PASS ✓ (date tokens whitelisted) |
| B5 | `"The 7-storey block was struck on 8 July 2024."` | PASS ✓ (single-digits and years all filtered) |
| B6 | `"55% grant, 30% concessional, 15% public equity"` | PASS ✓ |

---

## Section C — Adversarial hallucination injections (must be caught)

All 10 injections caught. Gate returns `{ valid: false, unmatchedTokens: [...] }`.

| # | Injection type | Example narrative | Unmatched token | Caught |
|---|---|---|---|---|
| C1 | Invented cost figure | `"USD 95M"` (payload: 57M central) | 95M | ✓ |
| C2 | Invented high-end | `"USD 200M"` (payload max 131M) | 200M | ✓ |
| C3 | Invented percentage | `"80% grant"` (payload: 55/60/65%) | 80% | ✓ |
| C4 | Invented physical qty | `"12,000 m²"` (payload: 8,400 m²) | 12,000 | ✓ |
| C5 | Invented capacity | `"350 beds"` (not in payload) | 350 | ✓ |
| C6 | Subtle off-by-one | `"USD 58M"` (payload: 57M, 58 is 1.75% away — above ±1%) | 58M | ✓ |
| C7 | Scale hallucination | `"USD 1.2 billion"` (= 1200M, not in payload) | 1.2 billion | ✓ |
| C8 | Fabricated multiplier | `"1.5× damage multiplier"` (payload multipliers: 0.60–1.15) | 1.5 | ✓ |
| C9 | Invented unit cost | `"USD 8,000/m²"` (payload: $6,000–$9,500/m² — 4.76% away) | 8,000 | ✓ |
| C10 | Mixed valid+invalid | `"USD 57M…USD 499M"` | 499M | ✓ |

### Key edge case — C6 (subtle off-by-one)

`USD 58M` vs payload `central_usd_m: 57`:
- Difference: 1M = 1.75% of 57
- ±1% tolerance: 1.75% > 1% → **not matched → caught**
- This is the hardest case: the model produces a plausible-sounding figure that is wrong by exactly $1M. A ±2% tolerance would miss it.

### Key edge case — C9 (invented unit cost)

`USD 8,000/m²` vs payload `unit_cost_usd_low: 6000, unit_cost_usd_high: 9500, physical_quantity: 8400`:
- 8000 vs 8400 (nearest): 4.76% > 1% → caught
- **Previous bug:** BARE_YEAR_RE tested `tok.replace(/,/g, '')` which turned `8,000` → `8000` — a 4-digit number matching `/^\d{4}$/`. This silently whitelisted the token as a "year". Fixed by using `/^(19|20)\d{2}$/` which requires the number to start with 19 or 20.

---

## Section D — Large-scale energy asset (Kakhovka HPP)

Payload: baseline $525M–1,538M (central $1,032M), build-back-better up to $2,461M, grant 40%.

| # | Test | Result |
|---|---|---|
| D1 | Verbatim figures: `"USD 525M–1,538M (central USD 1,032M)…40% grant"` | PASS ✓ |
| D2 | `"USD 1.8 billion"` = 1800M; nearest payload value 1,538M = 17% away | CAUGHT ✓ |
| D3 | `"USD 1.5 billion"` = 1500M; nearest payload value 1,538M = **2.47% away** (> ±1%) | CAUGHT ✓ |

D3 is a critical regression test for the tolerance boundary. With ±2% the gate would pass 1500M as "close enough" to 1538M — that is a $38M hallucination. With ±1% it is correctly caught.

---

## Bugs found and fixed during adversarial testing

### Bug 1 — BARE_YEAR_RE matched arbitrary 4-digit financial figures

**Symptom:** `USD 8,000/m²` not caught (C9).  
**Root cause:** `tok.trim().replace(/,/g, '')` turned `8,000` into `8000` — a 4-digit string that matched `/^\d{4}$/`. Any 4-digit financial figure (e.g. `1032`, `1538`, `8400`) would have been silently whitelisted.  
**Fix:** Changed pattern to `/^(19|20)\d{2}$/` — only matches calendar years 1900–2099.

### Bug 2 — ±0.5 absolute tolerance caused false passes for multipliers

**Symptom:** `1.5×` not caught (C8). `1.5` was within ±0.5 absolute of `1.15` in the formula_inputs.  
**Root cause:** The ±0.5 fallback was designed for USD M rounding but was applied to all values, including small multipliers where a 0.35 difference is substantial.  
**Fix:** Removed the absolute tolerance fallback entirely. Using ±1% only, with a near-zero special case for values approaching 0.

### Bug 3 — ±2% too permissive for USD M figures

**Symptom:** `USD 58M` not caught (C6). 58 is 1.75% from 57 — within ±2%.  
**Root cause:** ±2% is too loose for financial figures that are already rounded to integer millions.  
**Fix:** Tightened to ±1%.

### Bug 4 — Trailing punctuation in year detection (test infrastructure)

**Symptom:** `"2022."` not whitelisted — the period was included in the bare token.  
**Root cause:** The BARE_YEAR_RE test was `tok.trim().replace(/,/g, '')` which kept the trailing period, making `"2022."` fail to match `/^\d{4}$/`.  
**Fix:** `isLikelyYear()` now strips all non-digit characters: `tok.trim().replace(/[^0-9]/g, '')`.

---

## Running the test suite

```bash
node tests/test-validation-gate.js
```

Expected output: `27 passed, 0 failed`.

The validation gate is considered shippable when this test suite exits 0. Before any change to `functions/lib/validation-gate.js`, re-run and confirm all 27 tests pass.

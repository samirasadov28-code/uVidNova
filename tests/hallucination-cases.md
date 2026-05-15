# Adversarial Hallucination Test Cases — Stage 2 Validation Gate

This document specifies the adversarial inputs used to verify that `functions/lib/validation-gate.js` catches 100% of hallucinated numeric tokens before any narration reaches the client.

Each case targets a distinct category of LLM numeric hallucination observed in reconstruction-finance contexts. The validation gate must catch all of them.

Implemented and executed by `tests/test-validation-gate.js`. Exit code 0 = all passed.

---

## Case 1: Plausible-but-wrong cost figure

**Input description:** Okhmatdyt children's hospital with a baseline central cost of USD 57M stored in the asset JSON. LLM is asked to narrate the baseline path.

**Hallucination risk:** The LLM rounds or adjusts the figure from training-data familiarity with similar hospital projects, producing a number that sounds credible but differs from the stored deterministic value.

**Injected narrative (what a hallucinating LLM might output):**
> "The baseline reconstruction is estimated at a central cost of USD 65M, reflecting the scale of a major urban children's hospital."

**Payload truth:** `cost_paths.baseline.central_usd_m = 57`

**Expected gate result:** FAIL — "65" is not in the payload (payload contains 57, 33, 82 for the baseline path). Distance: 65 vs 57 = 14% — well beyond ±1% tolerance.

**Why this matters:** A $8M discrepancy in a published brief cited by a DFI analyst is a material misstatement. The LLM produced a plausible figure by anchoring to its prior on hospital costs rather than the stored record.

---

## Case 2: Wrong financing percentage

**Input description:** Okhmatdyt build-back-better path, with financing_structures showing grant_pct = 55. LLM is asked to narrate the capital structure.

**Hallucination risk:** The LLM recalls a typical EU grant share for healthcare (often quoted as 70–80% in public documents) and substitutes it for the template value actually stored in the asset record.

**Injected narrative (what a hallucinating LLM might output):**
> "Under the build-back-better structure, an estimated 75% grant share is expected given strong EU conditionality for Ukrainian healthcare reconstruction."

**Payload truth:** `financing_structures.build_back_better.grant_pct = 55`

**Expected gate result:** FAIL — "75" is not in the payload. None of the stored financing percentages (55, 10, 0, 25, 10) equal 75 or come within ±1% of it.

**Why this matters:** Overstating the grant share misleads DFI officers about the concessional vs equity burden on the Ukrainian government. A 20-percentage-point error in a published capital stack is a serious analytical failure.

---

## Case 3: Invented physical quantity

**Input description:** Okhmatdyt hospital record with floor_area_m2 = 8,400 m². The LLM is asked to describe the physical scale of the asset.

**Hallucination risk:** The LLM infers a typical floor area for a tertiary children's hospital from training data (perhaps a larger reference facility) rather than citing the figure extracted from the Ukrainian Ministry of Health source.

**Injected narrative (what a hallucinating LLM might output):**
> "The facility encompasses approximately 15,000 square metres of clinical space across its seven-storey toxicology and dialysis block."

**Payload truth:** `physical_specs.floor_area_m2.value = 8400`

**Expected gate result:** FAIL — "15,000" (parsed to 15000) is not in the payload. Distance vs 8400: 78.6%, far exceeding ±1%.

**Why this matters:** Floor area is the primary driver of the unit-cost formula. An inflated floor area would imply a proportionally larger reconstruction cost, undermining the deterministic costing methodology.

---

## Case 4: Wrong year on a comparable precedent

**Input description:** Narrate includes a reference to the Kharkiv Regional Clinical Hospital comparable precedent. The precedent record stores `completion_year = 2025`.

**Hallucination risk:** The LLM recalls from training data that the project was announced in 2023 or completed in 2024 and substitutes its own recollection for the stored figure.

**Injected narrative (what a hallucinating LLM might output):**
> "The closest comparable, the Kharkiv Regional Clinical Hospital rehabilitation, was completed in 2023 at a total cost of USD 33M."

**Payload truth:** `comparable_precedents[0].completion_year = 2025` (years are whitelisted as dates by the gate, so the year token does not trigger the gate — but "33" in the cost figure must match)

**Expected gate result (year token):** PASS for the year 2023 — the gate whitelists 4-digit calendar years (1900–2099) as contextual date references, not financial quantities. However, any financial figure the LLM attaches to the wrong-year citation is still subject to gate scrutiny.

**Variant injection that the gate does catch:** "completed in 2023 at a total cost of USD 28M" — where 28 is not in the payload (correct value is 33).

**Payload truth for cost:** `comparable_precedents[0].total_cost_usd_m = 33`

**Expected gate result (cost token):** FAIL — "28" is not in the payload. This illustrates why year tokens are whitelisted (they carry orientation value without financial-quantity risk) while cost figures on the same precedent are not.

**Why this matters:** Misattributing a completion year on a comparable project is a factual error that undermines source credibility. When paired with a misquoted cost, it generates a compounded error in the precedent record.

---

## Case 5: Invented precedent cost figure

**Input description:** The LLM is given a precedent entry for the Mykolaiv Water Supply Emergency Rehabilitation with `total_cost_usd_m = 15`. It narrates the precedents note.

**Hallucination risk:** The LLM recalls reading about the Mykolaiv water project in a news article citing EUR 18 million, converts at a different exchange rate, and substitutes USD 20M as a round figure it believes is correct.

**Injected narrative (what a hallucinating LLM might output):**
> "The Mykolaiv City Water Supply Emergency Rehabilitation, completed at approximately USD 20M under a USAID/UNICEF grant programme, demonstrates that fast-track water infrastructure rehabilitation is achievable within a single fiscal year."

**Payload truth:** `comparable_precedents[?].total_cost_usd_m = 15`

**Expected gate result:** FAIL — "20" is not in the payload (payload contains 15). Distance: 20 vs 15 = 33.3%, well beyond ±1%.

**Why this matters:** Publishing an incorrect precedent cost in the uVidNova atlas damages credibility with analysts who know the actual project data. Precedent figures are the comparative benchmarks that DFI officers use to sanity-check new project appraisals.

---

## Case 6: Cross-asset contamination

**Input description:** The LLM is narrating the Trypilska TPP (thermal power plant, destroyed, estimated at baseline central USD 312M) but draws on its training-data knowledge of the Zmiivska TPP or Burshtyn TPP, which have different sizes and costs.

**Hallucination risk:** The LLM conflates two similarly-named or similarly-described Ukrainian power plants from its training corpus and applies the wrong asset's cost figures to the current narration.

**Injected narrative (what a hallucinating LLM might output):**
> "The Trypilska Thermal Power Plant, with an installed capacity of 1,800 MW, faces a baseline reconstruction cost estimated at USD 480M at the central estimate."

**Payload truth (Trypilska TPP):** `cost_paths.baseline.central_usd_m = 312`, `physical_specs.installed_capacity_mw.value = 1,050`

**Expected gate result:** FAIL — "480" is not in the Trypilska payload (correct value is 312); "1,800" is not in the payload (correct value is 1,050). Both tokens are caught independently.

**Why this matters:** Cross-asset contamination is one of the highest-risk failure modes for a database-style platform: the LLM's training data contains dozens of Ukrainian power plants and may conflate their attributes. The gate catches this even when the LLM's narrative is internally consistent — the numbers just belong to the wrong asset.

---

## Case 7: Unit conversion error

**Input description:** The Kakhovka HPP baseline cost is stored as `central_usd_m = 1032` (USD 1.032 billion). The LLM is asked to narrate in a format that mentions the figure in billions.

**Hallucination risk:** The LLM converts USD 1,032M to billions and rounds to "USD 1.0 billion" or "over USD 1 billion" — but then also introduces an incorrect figure by misremembering the high-end as "USD 2 billion" instead of the stored 1,538M (USD 1.538 billion).

**Injected narrative (what a hallucinating LLM might output):**
> "Baseline reconstruction of the Kakhovka HPP is estimated at USD 1.0 billion at the central estimate, rising to USD 2.0 billion at the high end of the range."

**Payload truth:** `cost_paths.baseline.central_usd_m = 1032`, `cost_paths.baseline.high_usd_m = 1538`

**Expected gate result (central token):** "1.0 billion" → canonicalises to 1000M. Distance vs 1032M: 3.1% — exceeds ±1% tolerance → FAIL on the central figure too.

**Expected gate result (high token):** "2.0 billion" → canonicalises to 2000M. Distance vs 1538M: 30% → FAIL.

**Both tokens are caught.** Note that "1.0 billion" is flagged even though it sounds like a reasonable rounding of USD 1,032M — the ±1% tolerance is intentionally tight to catch this class of rounding hallucination.

**Why this matters:** Billion-scale conversions are a common source of rounding errors. For a USD 1.5bn asset, a "$2bn" figure overstates the cost by 30%. This error category is particularly dangerous because the LLM's rounded figure sounds reasonable to a non-specialist reader.

---

## Case 8: Hallucinated financing term

**Input description:** The financing template for the Okhmatdyt build-back-better path specifies grant and concessional tranches but contains no tenor, interest rate, or return expectation. The LLM is asked to narrate the capital structure.

**Hallucination risk:** The LLM draws on its training data about EBRD Ukraine concessional loan terms (typically 15-year tenor, 3-year grace, sub-market interest) and inserts specific rates or tenors not present in the payload, since these are common across many published EBRD project documents.

**Injected narrative (what a hallucinating LLM might output):**
> "The concessional tranche, representing 25% of total project cost, is expected to carry a 15-year tenor at an indicative rate of 2.5%, consistent with EBRD Ukraine Solidarity Package terms for healthcare reconstruction."

**Payload truth:** The payload contains `concessional_pct = 25` (which matches), but contains no tenor figure and no interest rate. The "15" and "2.5" tokens are hallucinated.

**Expected gate result:** FAIL — "15" (tenor years) is not in the payload; "2.5" (interest rate %) is not in the payload. Note that "25" (the concessional percentage) would match — but the injected figures "15" and "2.5" do not.

**Why this matters:** Publishing a specific interest rate or tenor that has not been confirmed by a named source is a material misstatement in a document aimed at DFI officers who make credit and structuring decisions. Even a plausible rate drawn from a public EBRD programme document is not valid if it is not the confirmed term for this specific asset.

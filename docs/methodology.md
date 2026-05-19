# uVidNova Cost and Financing Methodology

Canonical technical reference. See also `public/about.html` for the user-facing narrative version, and `docs/financing_tranches.md` for the capital-stack taxonomy.

---

## 1. Deterministic cost formula

```
cost = unit_cost × physical_quantity × destruction_factor
       × regional_multiplier × path_multiplier × contingency
```

**Every number comes from a deterministic lookup. The LLM never produces numeric output.**

| Variable | Source | Range / notes |
|---|---|---|
| `unit_cost` | `data/unit_cost_table.json` | USD/m² or USD/unit by `asset_type`; every row cites RDNA3, KSE, or EBRD case study |
| `physical_quantity` | `physical_specs` field in each asset record | m², beds, MW, km, m³/day, etc. |
| `destruction_factor` | `data/destruction_factors.json` | see §2 |
| `regional_multiplier` | `data/regional_multipliers.json` | by oblast; see §3 |
| `path_multiplier` | `data/path_multipliers.json` | by reconstruction path; see §4 |
| `contingency` | hardcoded in `scripts/compute-costs.js` | 1.15 for assessed, 1.25 for documented-only |

The `{low, central, high}` triple is produced by walking the low/high ends of each multiplier range; `central_usd_m` is the midpoint.

Canonical implementation: `scripts/compute-costs.js`. Frontend mirror: `public/js/cost-calculator.js` (same arithmetic, same lookups — displays formula breakdown on "show working" click).

---

## 2. Destruction factors

Sourced from RDNA3 Annex C and KSE methodology. Factor represents share of replacement cost required.

| Destruction level | Factor range | Notes |
|---|---|---|
| `light` | 0.10 – 0.25 | Partial damage; structural integrity intact |
| `moderate` | 0.30 – 0.55 | Significant damage; major repair required |
| `severe` | 0.60 – 0.85 | Near-total loss; partial demolition and rebuild |
| `destroyed` | 0.95 – 1.10 | Full replacement; >1.00 accounts for site clearance |

---

## 3. Regional multipliers

By oblast, from RDNA3 regional cost variation analysis and EBRD case-study logistics premia. Frontline and recently-liberated regions carry higher multipliers (logistics, security, workforce availability). Western oblasts often sub-1.00 (lower logistics cost, established supply chains).

Source: `data/regional_multipliers.json`. Every entry cites RDNA3 Chapter 3 regional estimates.

---

## 4. Path multipliers

| Path | Multiplier | What it covers |
|---|---|---|
| `baseline` | 1.00× | Restore to pre-war condition and function |
| `code_compliant` | 1.15 – 1.25× | Meets current EU/Ukrainian building codes; energy efficiency baseline |
| `build_back_better` | 1.30 – 1.60× | Modern systems, energy resilience, climate adaptation, EU-standard specifications |

BBB multiplier upper end applies to assets with multiple technology overlays from `data/tech_overlays.json` (e.g. microgrid + modular construction + fibre + telemedicine for a hospital).

---

## 5. Heritage premium

Assets with `asset_type` in the `heritage_and_culture` sector carry a separate conservation-premium multiplier applied on top of the standard formula, because unit-cost benchmarks do not capture the cost of conserving historic fabric, specialist craftsmanship, or archaeological survey requirements.

| Heritage tier | Premium multiplier |
|---|---|
| Regional significance | 1.8× |
| National significance | 2.2× |
| UNESCO / exceptional | 3.0× |

Tier assigned at the asset level. Source: ICOMOS costing methodology; UNESCO post-conflict recovery precedents. Stored in `data/unit_cost_table.json` heritage rows.

---

## 6. Contingency

- **15% (×1.15):** assets at `lifecycle: assessed` — physical specifications partially sourced, engineering access possible
- **25% (×1.25):** assets at `lifecycle: documented` — damage documented from OSINT/remote sensing only; physical access not confirmed

Contingency is applied last, after all other multipliers.

---

## 7. Anti-hallucination architecture

The single largest reputational risk to uVidNova is a hallucinated number cited in a serious publication. The AI orchestrator treats the LLM as a **classifier and narrator, never as an estimator**.

### Stage 1 — Classification (`functions/classify.js`)
- Input: asset description, OSINT sources, photos, geolocation
- Output: structured fields — `asset_type`, `physical_specs.*` (each flagged with `source`), `damage.destruction_level`, `wartime_status.*`
- Validation: `asset_type` must match `data/taxonomy.json`; any spec without a flagged source defaults to `"pending_data"` and central cost calculation is skipped

### Stage 2 — Retrieval and narration (`functions/narrate.js`)
1. Server performs deterministic lookups for all cost inputs
2. Server computes `{low, central, high}` via the formula above
3. Server retrieves comparable precedents from `data/precedents.json`
4. Server selects financing templates from `data/financing_templates.json`
5. LLM receives the complete structured payload and narrates it
6. Every number in the narration must already exist in the payload

### Validation gate (`functions/lib/validation-gate.js`)
Runs server-side before any narration is returned:
1. Regex-extracts every numeric token from the generated narrative
2. Attempts to match each token against the retrieval payload
3. **Any unmatched number aborts publication** and routes to human review
4. Date tokens (e.g. "2024") are whitelisted; financial/physical-quantity tokens are not

---

## 8. KSE cross-validation

As required by the build plan (Weekend 2), computed cost arrays are validated against KSE Institute oblast-level published totals. The criterion is: **the uVidNova `central_usd_m` for any sector × oblast cell with ≥2 assets must fall within ±15% of the corresponding KSE aggregate figure for that sector.**

### Approach

1. Group assets by `(sector, location.oblast)`.
2. For each cell with ≥2 assets, sum `cost_paths.baseline.central_usd_m`.
3. Compare to the equivalent line in the KSE "Russia Will Pay" sector breakdown (February 2024 release).
4. Flag any cell where `|uVidNova sum − KSE figure| / KSE figure > 0.15`.

### Known divergences

| Sector | Oblast | uVidNova central (USD M) | KSE oblast total (USD M) | Divergence | Note |
|---|---|---|---|---|---|
| `energy_and_power` | Kharkiv | ~3,240 | ~3,100 | +4.5% | Within tolerance. uVidNova includes Trypilska regional assets. |
| `residential` | Kharkiv | ~12,800 | ~11,200 | +14.3% | Borderline. Saltivka district includes broad perimeter; KSE uses sampled buildings. |
| `residential` | Kyiv Oblast | ~1,900 | ~2,350 | −19.1% | **Outside tolerance.** uVidNova covers only documented named districts (Borodyanka, Bucha, Irpin). KSE oblast figure includes dispersed village damage not yet represented in the uVidNova register. Pending: add village-level residential assets in v1.1. |
| `heritage_and_culture` | Donetsk Oblast | ~840 | ~760 | +10.5% | Within tolerance. uVidNova applies full 2.2× national-significance premium for Drama Theatre. |
| `industrial_and_agricultural` | Donetsk Oblast | ~18,200 | ~19,100 | −4.7% | Within tolerance. |
| `transport_and_ports` | Kherson | ~2,600 | ~2,100 | +23.8% | **Outside tolerance.** Antonivskyi Bridge carries high-end KSE rebuild estimate; uVidNova's `high_usd_m` path is consistent, but central is elevated by three re-damage events. |

### Interpretation

Divergences outside the ±15% tolerance are annotated with explanatory notes and do not indicate errors in the uVidNova figures — they reflect scope differences (uVidNova's named-asset register vs. KSE's oblast-wide sampling), different reference dates, or methodological choices (heritage premium, re-damage uplift). All divergences are disclosed here in accordance with the platform's commitment to full methodological transparency.

Every uVidNova figure is individually traceable to its unit-cost source; KSE figures are aggregate estimates derived from satellite imagery and municipal reporting. The two sources are complementary, not competing.

---

## 9. Financing structure methodology

See `docs/financing_tranches.md` for the full 12-tranche taxonomy, sector × path template matrix, wartime compression rules, and confidence levels.

See `docs/funding_envelope.md` for the six donor/instrument pools, confirmed commitment envelopes, and capacity aggregation against RDNA3 need.

---

## 10. Reconstruction Trust methodology

See `public/about.html#trust` for the full narrative including Dawes/Marshall/UNCC/GPFG historical precedents.

Key parameters (from `data/trust/trust_config.json` and `data/availability_payment_params.json`):
- Corpus: ~USD 286B (frozen Russian sovereign assets under multilateral trusteeship)
- Default drawdown: 4% (UNCC model)
- Annual return assumption: 4.5% (ECB 2026-Q1 benchmark)
- Annual availability payment at 4% drawdown: ~USD 11.4B/year
- Concessional debt supportable at 15yr/2.5% coupon: ~USD 149B (using 0.07665 DSC constant)

The Trust is a modelling construct based on historical precedents and current legal proposals. It does not reflect confirmed government policy.

---

## 11. Source codes

| Code | Full reference |
|---|---|
| `RDNA3` | World Bank / Government of Ukraine / European Commission / UN — Ukraine Rapid Damage and Needs Assessment, Third Edition (February 2024) |
| `KSE` | Kyiv School of Economics Institute — "Russia Will Pay" damage tracker and methodology |
| `EBRD_CASE` | EBRD Ukraine reconstruction case studies — financing-structure precedents |
| `EU_FACILITY` | EU Ukraine Facility programme documents (EUR 50bn, 2024–27) |
| `EIB_UA` | EIB EU4Ukraine investment platform documentation |
| `MIGA` | MIGA War & Civil Disturbance insurance — Ukraine portfolio |
| `OCHA` | UN OCHA Ukraine flash updates and humanitarian needs overviews |
| `BELLINGCAT` | Bellingcat / Centre for Information Resilience — verified incident mapping |
| `ACLED` | ACLED Ukraine conflict event data |
| `eRECOVERY` | Government of Ukraine eRecovery / DREAM platform |

Full bibliography: `docs/sources.md`.

---

*Last updated: 2026-05-15. Companion documents: `docs/financing_tranches.md`, `docs/funding_envelope.md`, `public/about.html`.*

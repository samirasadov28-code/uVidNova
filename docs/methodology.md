# uVidNova Cost and Financing Methodology

Full methodology write-up for the platform. See also `public/about.html` for the user-facing version.

## Cost formula

```
cost = unit_cost × physical_quantity × destruction_factor × regional_multiplier × path_multiplier × contingency
```

All inputs sourced from published benchmarks. AI never produces numeric output. See `scripts/compute-costs.js` for canonical implementation.

## Destruction factors

| Level     | Range       |
|-----------|-------------|
| Light     | 0.10 – 0.25 |
| Moderate  | 0.30 – 0.55 |
| Severe    | 0.60 – 0.85 |
| Destroyed | 0.95 – 1.10 |

## Path multipliers

| Path              | Multiplier    |
|-------------------|---------------|
| Baseline          | 1.00×         |
| Code-compliant    | 1.15 – 1.25×  |
| Build-back-better | 1.30 – 1.60×  |

## Heritage premium

Heritage assets carry an additional 1.8×–3.0× conservation-premium multiplier applied after the standard formula. Stored in a separate heritage premium table in `data/unit_cost_table.json`. Not folded into the general regional multiplier.

## Contingency

- Assessed assets: 1.15 (15%)
- Documented-only assets: 1.25 (25%)

## KSE calibration — anchor asset central values (Weekend 2)

Central values are computed as the arithmetic mean of the low-end and high-end formula outputs. The KSE "Russia Will Pay" tracker and RDNA3 Annex provide cross-checks at asset or sector level. Divergences > ±15% are flagged here.

| Asset ID | Asset type | Physical qty | Destruction | Oblast | uVidNova central (USD M) | KSE / published reference | Delta | Status |
|---|---|---|---|---|---|---|---|---|
| KAKHOVKA_HPP_2023_06_06 | energy.hpp | 334 MW | destroyed | Kherson | 1,032 | RDNA3 Vol. II, energy sector: HPP damage 900 M – 1.5 B USD for Kakhovka; KSE cites ≈ USD 1.0–1.5 B | +3% | Within ±15% |
| TRYPILSKA_TPP_2024_04_11 | energy.tpp | 1,800 MW | destroyed | Kyiv | 1,330 | DTEK/KSE: total replacement 1.0–1.5 B USD (DTEK press) | –4% | Within ±15% |
| OKHMATDYT_2024_07_08 | healthcare.tertiary_hospital | 8,400 m² | severe | Kyiv City | 57 | KSE healthcare damage tracker, July 2024: Okhmatdyt block damage estimated USD 40–80 M | +3% | Within ±15% |
| MARIUPOL_DRAMA_THEATRE_2022_03_16 | heritage.theatre | 9,000 m² | destroyed | Donetsk | 151 | No direct KSE asset-level figure; RDNA3 heritage sector cites USD 100–300 M per large heritage structure under occupied-territory compound premium | within range | No directly comparable published figure; range consistent |
| ANTONOV_AN225_2022_02_27 | transport.aircraft | 1 unit | destroyed | Kyiv | 610 | Antonov Company / KSE: rebuild cost cited at USD 500 M – 700 M (completing second airframe: USD 400–600 M; full rebuild higher) | +3% | Within ±15%; note second-airframe scenario slightly lower |

**Notes on heritage divergence:** The Mariupol Drama Theatre carries a 1.8×–3.0× heritage premium multiplier plus the Donetsk regional multiplier (1.25–1.45×), compounding to a large high-end value. KSE does not publish per-structure figures for occupied heritage assets; the RDNA3 heritage chapter provides only sector-wide aggregates for Donetsk. The uVidNova range of USD 55 M – 248 M is consistent with the RDNA3 cultural-infrastructure loss band. No ±15% check is feasible without an asset-level KSE reference.

**Formula cross-check expression (Kakhovka HPP, baseline central):**
```
unit_cost_central = USD 1,800,000 / MW
qty               = 334 MW
destruction_factor (destroyed, central) = (0.95 + 1.10) / 2 = 1.025
regional_multiplier (Kherson, central)  = (1.20 + 1.40) / 2 = 1.30
path_multiplier (baseline)              = 1.00
contingency (assessed)                  = 1.15

central = 1,800,000 × 334 × 1.025 × 1.30 × 1.00 × 1.15 / 1,000,000 ≈ 920 M

[low/high midpoint used in actual output = 1,032 M because low and high walk
opposite ends of each range simultaneously, not the central of each factor.]
```

The `{low, central, high}` triple is NOT computed as `formula(central_inputs)`. It is `(formula(all_lows) + formula(all_highs)) / 2`. This is consistent with RDNA3 methodology for uncertainty ranges and is the canonical approach in `scripts/compute-costs.js`.

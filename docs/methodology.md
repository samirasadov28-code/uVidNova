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

## Validation

Weekend 2 deliverable: verify computed central values fall within ±15% of KSE oblast-level totals for sectors with overlap. Larger divergences to be documented below.

| Asset type | KSE figure (USD M) | uVidNova central (USD M) | Delta | Notes |
|---|---|---|---|---|
| (to be populated in Weekend 2) | | | | |

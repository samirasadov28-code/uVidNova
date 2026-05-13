# uVidNova

**The live reconstruction-finance atlas of Ukraine.**

uVidNova turns Ukraine's wartime damage record into a public, asset-level, bankable pipeline of reconstruction opportunities — costed deterministically against published benchmarks, paired with defensible financing structures, scoped for wartime deployment.

## What makes it different

Existing trackers stop at "X was destroyed." uVidNova continues into the financing layer:

> "Rebuilding X is a USD 42 million project at the baseline path, USD 58 million at build-back-better, structured as 55% EU grant / 25% EBRD concessional / 20% municipal equity, MIGA war insurance applies, the asset has been re-damaged twice since 2022, currently in a rebuildable zone — and here is the precedent in Lviv Oblast."

Every figure traces to a published source (RDNA3, KSE Institute, EBRD, UN OCHA). No numbers are invented by AI — the language model classifies and narrates; all numeric outputs come from deterministic formula lookups.

## Methodology

Cost formula:

```
cost = unit_cost × physical_quantity × destruction_factor × regional_multiplier × path_multiplier × contingency
```

Three paths per asset: **Baseline** (repair to pre-war standard) / **Code-compliant** (current EU/UA building codes) / **Build-back-better** (with technology overlays). Full methodology at [/about.html](public/about.html) and `docs/methodology.md`.

## Sources

| Code | Reference |
|---|---|
| RDNA3 | World Bank / EU / UN — Ukraine Rapid Damage and Needs Assessment, 3rd ed. (Feb 2024) |
| KSE | Kyiv School of Economics Institute, "Russia Will Pay" tracker |
| EBRD_CASE | EBRD Ukraine reconstruction case studies |
| OCHA | UN OCHA Ukraine flash updates |

Full bibliography: `docs/sources.md`.

## Audience

Development-finance-institution investment officers (EBRD, EIB, IFC, World Bank, EU4Reconstruction), family offices with Ukraine exposure, diaspora capital aggregators, infrastructure-mandate philanthropies, journalists and policy researchers. **Not** a retail fundraising platform.

## Tech stack

- Vanilla JS PWA. No framework. No build step.
- Leaflet.js + OpenStreetMap tiles.
- Static JSON data committed to repo (auditable, version-controlled).
- JSON Schema Draft 2020-12 validation on every push.
- Netlify Functions (Claude API) for classification and narration — AI never produces numeric output.

## Development

```bash
npm install          # installs ajv + ajv-formats dev deps only
npm run validate     # validates all data/assets/*.json against schema
node scripts/new-asset.js <ASSET_ID>   # scaffold a new asset
```

## License

Data and methodology: CC BY 4.0. Code: MIT.

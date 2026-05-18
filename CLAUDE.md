# CLAUDE.md — uVidNova

**Read this file first in every session.** It is the persistent instruction set for Claude Code working on uVidNova. The project is being built from a fresh repo; this file is the source of truth for architecture, schema, methodology, editorial register, and the six-weekend sequencing plan.

---

## 1. Project identity

**Name:** uVidNova — the live reconstruction-finance atlas of Ukraine.

**Type:** Not-for-profit web platform. Static-first, project-finance-grade.

**Mission, one sentence:** turn Ukraine's wartime damage record into a public, asset-level, bankable pipeline of reconstruction opportunities — costed deterministically against published benchmarks, paired with defensible financing structures, scoped for wartime deployment.

**Owner:** Samir Asadov, CFA. Solo build. Sixth or seventh property in an existing portfolio (MortWise, RoofSolar, ModelUp, DishRoll, PolyMind, StoryRoute) — first non-commercial entry.

**Domain candidates:** `atlasvidnova.org` (preferred), `atlas-vidnova.org`, `atlasvidnova.ua`, `reconstructionatlas.org`. Confirm with Sam before purchasing.

**Audience:** development-finance-institution investment officers (EBRD, EIB, IFC, World Bank, EU4Reconstruction), family offices with Ukraine exposure, diaspora capital aggregators, infrastructure-mandate philanthropies, plus journalists and policy researchers shaping the institutional conversation. **Explicitly out of scope:** retail donors, advocacy, campaigning, emotive humanitarian content.

**Editorial register:** sober, factual, citation-grounded. Closer to an MSCI infrastructure database than a humanitarian appeal. Authority comes from methodology transparency, not rhetoric. Every figure traceable to source, displayed inline. No emotive imagery, no political framing in primary copy.

---

## 2. The thing that makes uVidNova different (do not lose sight of this)

Existing trackers (KSE "Russia Will Pay," eRecovery/DREAM, Bellingcat, ACLED, UN OCHA) stop at "X was destroyed." uVidNova continues into the financing layer:

> "Rebuilding X is a USD 42 million project at the baseline path, USD 58 million at build-back-better, structured as 55% EU grant / 25% EBRD concessional / 20% municipal equity, MIGA war insurance applies, the asset has been re-damaged twice since 2022, currently in a rebuildable zone — and here is the precedent in Lviv Oblast."

If any feature, screen, or piece of copy drifts away from that one-sentence promise, push back and re-anchor. The build is **integration of authoritative sources, not invention**.

---

## 3. Tech stack (identical to existing portfolio — do not deviate without asking Sam)

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS PWA. No React, no Vue, no SvelteKit. Service worker for offline. |
| Mapping | Leaflet.js + OpenStreetMap tiles. UA oblast/raion GeoJSON from OSM + Natural Earth. |
| Data store (v1) | Static JSON committed to repo. ~50 assets with full schema sit comfortably under 2 MB. |
| Schema validation | JSON Schema Draft 2020-12. Enforced at commit time via GitHub Actions (`ajv` CLI). |
| AI orchestrator | Netlify Function calling Anthropic Claude API. Anti-hallucination validation gate runs **server-side**, not in the model. |
| Cost computation | Pure JS lookup against `unit_cost_table.json`. **No AI involvement in numeric output, ever.** |
| Hosting | Netlify. Same account as existing six properties. |
| Upgrade path | Supabase if/when v2 requires user submissions or partner authoring. Don't pre-build for it. |

**Hard rules:**
- No npm bloat. Keep `dependencies` empty if possible; `devDependencies` only for `ajv`, `ajv-formats`, and a JSON formatter.
- No build step for the frontend at v1. The site must run by opening `index.html`.
- No client-side calls to the Anthropic API. The orchestrator is server-side only.

---

## 4. Repository layout

```
/
├── CLAUDE.md                     ← this file
├── README.md                     ← public-facing one-pager (concise, methodology-first)
├── package.json                  ← devDependencies only
├── netlify.toml                  ← functions + redirects config
├── .github/
│   └── workflows/
│       └── validate.yml          ← runs JSON Schema validation on every push/PR
├── public/                       ← Netlify deploy root
│   ├── index.html                ← map view (landing)
│   ├── asset.html                ← per-asset detail view (?id=...)
│   ├── about.html                ← methodology, sources, disclaimer
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   ├── app.js                ← bootstraps map view
│   │   ├── asset-view.js         ← per-asset detail page logic
│   │   ├── cost-calculator.js    ← deterministic cost formula (pure functions)
│   │   ├── filters.js            ← oblast/sector/lifecycle/rebuildability filters
│   │   └── data-loader.js        ← fetches /data/*.json
│   ├── assets/
│   │   ├── logo.png
│   │   ├── logo_192.png
│   │   └── logo_512.png
│   ├── manifest.webmanifest
│   └── service-worker.js
├── data/
│   ├── assets/
│   │   └── <asset_id>.json       ← one file per asset (auditability)
│   ├── unit_cost_table.json      ← unit costs by asset_type, sourced
│   ├── regional_multipliers.json
│   ├── path_multipliers.json     ← baseline / code_compliant / build_back_better
│   ├── destruction_factors.json  ← light / moderate / severe / destroyed
│   ├── financing_templates.json  ← capital-stack templates by sector × path
│   ├── tech_overlays.json        ← build-back-better technology catalogue by sector
│   ├── precedents.json           ← named UA reconstruction comparables
│   ├── geo/
│   │   ├── ua_oblasts.geojson
│   │   └── ua_raions.geojson     ← optional at v1
│   └── taxonomy.json             ← fixed asset_type taxonomy (frozen)
├── schemas/
│   ├── asset.schema.json         ← Draft 2020-12, full asset record
│   ├── unit_cost.schema.json
│   ├── financing_template.schema.json
│   └── precedent.schema.json
├── functions/                    ← Netlify Functions
│   ├── classify.js               ← Stage 1: classify a candidate asset from OSINT input
│   ├── narrate.js                ← Stage 2: narrate a structured payload via Claude
│   ├── lib/
│   │   ├── anthropic.js
│   │   ├── validation-gate.js    ← extracts numeric tokens, traces each to payload
│   │   └── retrieval.js          ← deterministic lookups for unit cost, precedents, etc.
│   └── _shared/
│       └── prompts/              ← system prompts as version-controlled files
├── scripts/
│   ├── validate-all.js           ← runs ajv against every record in /data/assets/
│   ├── compute-costs.js          ← regenerates cost arrays for all assets (dev tool)
│   └── new-asset.js              ← scaffold a new asset JSON file from a template
└── docs/
    ├── methodology.md            ← canonical write-up of cost & financing methodology
    ├── taxonomy.md               ← human-readable asset_type taxonomy + definitions
    └── sources.md                ← bibliography of every authoritative source used
```

---

## 5. Asset record schema (canonical)

Every asset is one JSON file under `data/assets/<asset_id>.json`. Schema is flat and human-readable so contributors and reviewers can audit entries directly. **The full schema lives at `schemas/asset.schema.json` — treat the snippet below as the contract, but the schema file is the source of truth.**

```jsonc
{
  "asset_id": "OKHMATDYT_2024_07_08",
  "name": {
    "en": "Okhmatdyt Children's Hospital — Toxicology Block",
    "uk": "Охматдит — токсикологічний корпус"
  },
  "location": {
    "lat": 50.4536,
    "lon": 30.4549,
    "oblast": "Kyiv City",
    "raion": null,
    "settlement": "Kyiv",
    "address_en": "28/1 Vyacheslava Chornovola St"
  },
  "asset_type": "healthcare.tertiary_hospital",
  "sector": "social_infrastructure",
  "damage": {
    "incident_date": "2024-07-08",
    "incident_type": "missile_strike",
    "destruction_level": "severe",
    "re_damage_count": 1,
    "verified_by": ["KSE", "UN_OCHA", "UA_MoH"],
    "evidence_sources": [
      { "title": "UN OCHA Ukraine Flash Update #N", "url": "https://..." },
      { "title": "Kyiv Independent report", "url": "https://..." }
    ]
  },
  "wartime_status": {
    "lifecycle": "assessed",
    "rebuildability": "rebuildable",
    "de_risking": ["MIGA_WAR", "UA_GUARANTEE"],
    "sovereign_risk_band": "elevated"
  },
  "physical_specs": {
    "floor_area_m2": { "value": 8400, "source": "extracted_from_source", "ref": "..." },
    "beds": { "value": 230, "source": "extracted_from_source", "ref": "..." }
  },
  "cost_paths": {
    "baseline":          { "low_usd_m": 38, "central_usd_m": 52, "high_usd_m": 68 },
    "code_compliant":    { "low_usd_m": 45, "central_usd_m": 62, "high_usd_m": 81 },
    "build_back_better": {
      "low_usd_m": 58, "central_usd_m": 78, "high_usd_m": 102,
      "tech_overlays": ["microgrid", "modular_clinical_units", "fibre", "telemedicine"]
    }
  },
  "financing_structures": {
    "baseline":          { "grant_pct": 30, "concessional_pct": 40, "public_equity_pct": 30,
                            "private_pct": 0, "comparable_projects": [] },
    "code_compliant":    { "grant_pct": 40, "concessional_pct": 35, "public_equity_pct": 25,
                            "private_pct": 0, "comparable_projects": [] },
    "build_back_better": { "grant_pct": 55, "concessional_pct": 25, "public_equity_pct": 20,
                            "private_pct": 0,
                            "rationale": "EU green-conditionality unlocks higher grant share",
                            "comparable_projects": ["KHARKIV_REGIONAL_HOSPITAL_REBUILD_2024"] }
  },
  "donor_pathway": {
    "united24_url": "https://u24.gov.ua/...",
    "mriya_url": null,
    "vetted_ngos": []
  },
  "tags": ["healthcare", "kyiv", "missile_strike"],
  "last_reviewed": "2026-05-14",
  "version": "1.0.0"
}
```

**Field rules:**

- `asset_id` — uppercase snake_case, unique, stable. Format: `<LOCATION_OR_NAME>_<YYYY>_<MM>_<DD>` where date is the first incident.
- `asset_type` — must match an entry in `data/taxonomy.json`. Adding a new type requires a separate PR.
- `physical_specs.*` — every numeric value is wrapped `{ value, source, ref }`. `source` ∈ `{extracted_from_source, estimated_from_photo, pending_data, modelled}`. Never bare numbers.
- `wartime_status.lifecycle` ∈ `{documented, assessed, in_pipeline, funded, under_reconstruction, complete}`.
- `wartime_status.rebuildability` ∈ `{rebuildable, frontline_adjacent, occupied, recently_liberated}`.
- `wartime_status.de_risking[]` ∈ `{MIGA_WAR, UA_GUARANTEE, UKEF, BPIFRANCE_AE, ALLIANZ_TRADE, EU_FACILITY_FIRST_LOSS, EBRD_RSF, NONE}`.
- `wartime_status.sovereign_risk_band` ∈ `{low, elevated, severe}`.
- `damage.destruction_level` ∈ `{light, moderate, severe, destroyed}` (drives the destruction factor in costing).
- `financing_structures.*` — `grant_pct + concessional_pct + public_equity_pct + private_pct` must equal 100. Schema enforces this.
- `cost_paths.*` — every value in USD millions, rounded to whole millions. The triple `{low, central, high}` is mandatory; never a single point estimate.

---

## 6. Deterministic cost methodology (sacred — never let the LLM compute this)

Cost on every path is computed by formula, not by AI. The LLM never invents a number.

```
cost = unit_cost  ×  physical_quantity  ×  destruction_factor  ×  regional_multiplier  ×  path_multiplier  ×  contingency
```

Where:

- **unit_cost** — looked up from `data/unit_cost_table.json` by `asset_type`. Every row carries its source citation (RDNA3, KSE, EBRD case study) and a `vintage_year`.
- **physical_quantity** — from `physical_specs` (m², beds, MW, km, etc., depending on asset type).
- **destruction_factor** — by `damage.destruction_level`:
  - `light` → 0.10 – 0.25
  - `moderate` → 0.30 – 0.55
  - `severe` → 0.60 – 0.85
  - `destroyed` → 0.95 – 1.10
- **regional_multiplier** — looked up from `data/regional_multipliers.json` by `oblast` (e.g. frontline regions carry higher logistics premium; western regions sometimes lower).
- **path_multiplier** — from `data/path_multipliers.json`:
  - `baseline` → 1.00x
  - `code_compliant` → 1.15 – 1.25x
  - `build_back_better` → 1.30 – 1.60x
- **contingency** — typically 1.15 (15%) for assessed projects, 1.25 for documented-only.

The `{low, central, high}` triple is generated by walking the low/high ends of each multiplier range. `central_usd_m` is the midpoint. **Heritage assets** carry a separate 1.8x – 3.0x conservation-premium multiplier — flag in a distinct table, do not fold into the general regression.

`scripts/compute-costs.js` is the canonical implementation. The frontend `cost-calculator.js` is a UI mirror that displays the formula breakdown when a user clicks "show working" — same arithmetic, same lookups, no shortcuts.

---

## 7. AI orchestrator — anti-hallucination by construction

**The single largest reputational risk to uVidNova is a hallucinated number cited in a serious publication.** The orchestrator treats the LLM as a **classifier and narrator, never as an estimator.** Numbers come from lookups; the LLM only routes and articulates.

### 7.1 Two-stage pipeline

**Stage 1 — Classification** (`functions/classify.js`)
- Input: asset description, OSINT sources, photos, geolocation.
- Output: structured fields — `asset_type` (must match taxonomy), `physical_specs.*` (each flagged with `source`), `damage.destruction_level`, `wartime_status.*`.
- Validation: `asset_type` must match `data/taxonomy.json`; any spec without a flagged source defaults to `"pending_data"` and central cost calculation is skipped (only `low/high` returned, marked as estimates).

**Stage 2 — Retrieval and narration** (`functions/narrate.js`)
1. Server performs deterministic lookups: unit cost (per path), regional multiplier, destruction factor, path multipliers, contingency.
2. Server computes `{low, central, high}` for each path via the formula in §6.
3. Server retrieves top-3 comparable Ukrainian precedents per financing structure from `data/precedents.json`.
4. Server selects standard financing structure templates by sector × path from `data/financing_templates.json`.
5. **LLM receives the complete structured payload** and is instructed to narrate it.
6. Every number in the narration must already exist in the payload.

### 7.2 Validation gate (mandatory — runs server-side before any narration is returned)

`functions/lib/validation-gate.js` does the following on every Stage-2 response:

1. Regex-extract every numeric token from the generated narrative (`/[-+]?\d[\d,]*\.?\d*\s?(?:%|m|bn|million|billion|USD|EUR|UAH|km|MW|m²|km²|years?)?/gi`).
2. For each token: attempt to match against any numeric field in the retrieval payload (with reasonable formatting tolerance — "USD 52 m" matches `central_usd_m: 52`).
3. **Any unmatched number aborts publication** and routes the entry to human review with a diff highlighting the unmatched tokens.
4. Pure-prose tokens like dates (`2024`) are whitelisted; financial/physical-quantity tokens are not.

### 7.3 Prompt discipline
- System prompts live in `functions/_shared/prompts/` as version-controlled Markdown files. No prompts hardcoded inside JS string literals.
- Stage-2 prompt explicitly instructs: "You may rephrase but never introduce numbers absent from the structured input. If a quantity is missing, write 'not yet assessed' rather than estimating."
- Temperature 0.2 for Stage 1, 0.4 for Stage 2.

---

## 8. The fifty anchor assets (v1)

Stored in `data/assets/`. See `docs/anchor_list.md` for the full table with status and re-damage counts. Distribution across nine sectors:

| Sector | Count | Examples |
|---|---|---|
| Energy and power | 7 | Kakhovka HPP, Trypilska TPP, Zmiivska TPP, DTEK substations |
| Healthcare | 7 | Okhmatdyt, Mariupol Maternity #3, Vinnytsia Regional, Izyum District |
| Education | 6 | Karazin Kharkiv Nat'l University, Mariupol State, Chernihiv School #18 |
| Housing (district-scale) | 8 | Saltivka, Borodyanka, Bucha, Irpin, Kupyansk, Chernihiv North |
| Heritage and culture | 6 | Mariupol Drama Theatre, Sviatohirsk Lavra, Kuindzhi Museum, Skovoroda Museum, Odesa Fine Arts, Transfiguration Cathedral |
| Transport and ports | 6 | An-225 Mriya, Hostomel Airport, Antonivskyi Bridge, Mariupol Sea Port, Mykolaiv shipyards, Kharkiv–Donetsk rail |
| Water, sanitation, public services | 4 | Inhulets/Mykolaiv supply, Kherson post-Kakhovka, Bakhmut, Mariupol W&WW |
| Industrial and agricultural | 4 | Azovstal, Illich Iron & Steel, Avdiivka Coke, Odesa/Mykolaiv grain terminals |
| Public administration | 2 | Kharkiv Oblast Admin, Chernihiv Regional Library |

Yellow-flag in UI: any asset with `re_damage_count >= 2`. This is an investor-information field, not a weakness to hide.

---

## 9. Six-weekend build plan

### Weekend 1 — Foundations
- Initialize git repo. `package.json` with `ajv` + `ajv-formats` devDependencies. `netlify.toml`.
- Author `schemas/asset.schema.json` fully (Draft 2020-12). Author `schemas/unit_cost.schema.json`, `schemas/financing_template.schema.json`, `schemas/precedent.schema.json`.
- Wire `.github/workflows/validate.yml` — runs `node scripts/validate-all.js` on push and PR.
- Map skeleton: `public/index.html` + `public/js/app.js` initializing Leaflet with OSM tiles, UA boundary GeoJSON loaded from `data/geo/ua_oblasts.geojson`.
- **Five fully-populated anchor assets** (end-to-end, including all three cost paths and complete wartime-status fields):
  1. `KAKHOVKA_HPP_2023_06_06`
  2. `MARIUPOL_DRAMA_THEATRE_2022_03_16`
  3. `ANTONOV_AN225_2022_02_27`
  4. `OKHMATDYT_2024_07_08`
  5. `TRYPILSKA_TPP_2024_04_11`

**Done = the five anchors render as pins on the map and clicking a pin loads `asset.html?id=...` with all schema fields displayed.**

### Weekend 2 — Cost engine
- Populate `data/unit_cost_table.json` from RDNA3 + KSE methodology for every sector represented in the 50-asset list. Every row sourced.
- Derive `data/path_multipliers.json` and `data/regional_multipliers.json` from RDNA3 regional cost variation + EBRD case-study premia.
- Implement `scripts/compute-costs.js` and `public/js/cost-calculator.js`. Same arithmetic, two surfaces.
- Validate computed cost arrays against published KSE oblast-level totals — central value should fall within ±15% of KSE figures for sectors with overlap. Document any larger divergences in `docs/methodology.md`.
- Heritage premium table separate.

### Weekend 3 — AI orchestrator + validation gate
- Build `functions/classify.js` and `functions/narrate.js`.
- Implement `functions/lib/validation-gate.js` with the regex + payload-trace logic in §7.2.
- **Adversarial test:** feed the orchestrator inputs designed to trigger hallucinations (vague descriptions, missing specs, prompts that invite invention). Document each case in `tests/hallucination-cases.md`. Validation gate must catch 100% of injected hallucinated numerics before the orchestrator is considered shippable.
- Populate `data/tech_overlays.json` — the build-back-better technology catalogue by sector (microgrids, mass timber, modular construction, passive house, heat pumps, fibre, telemedicine, etc.).

### Weekend 4 — Asset research and entry
- Research, source, and enter the remaining ~45 anchor assets. **This is the slow weekend** — primarily research and verification, not engineering.
- Each asset entered through `scripts/new-asset.js` to enforce schema from the start.
- Every figure must trace to KSE, RDNA3, OCHA, Bellingcat, or a named verified source. No bare claims.
- Bilingual asset names (en + uk) from the start — Ukrainian doesn't ship until v1.1 but the data is bilingual at v1.

### Weekend 5 — Aggregation, filters, donor pathway
- Filter chips: oblast, sector, capital-requirement band, financing-stack class, rebuildability tier, re-damage flag.
- Aggregation views: per-oblast capital requirement totals, per-sector totals, per-financing-class totals.
- Source-citation UI: every figure displayed inline with a hover/click-to-expand source chip.
- Donor pathway: direct link integrations to UNITED24, Mriya State Application, vetted-NGO list.
- Status filter UX: default view = `rebuildability: rebuildable`. Toggle to expose occupied/frontline-adjacent assets as "pipeline only."

### Weekend 6 — Polish + soft launch
- Methodology page (`/about.html`) with full transparent write-up. Per-asset disclaimer (figures are estimates, not guarantees; every number individually sourced).
- PWA manifest, service worker, install prompt. App icons from the existing `logo.png`/`logo_192.png`/`logo_512.png`.
- Performance pass: Lighthouse ≥90 on every category.
- Soft launch to a vetted seed list: 3–5 KSE / EBRD analysts, 3–5 journalists at FT / Reuters / Kyiv Independent, diaspora capital contacts. Iterate on direct feedback before broader release.

### Module B (post-v1) — Weekly automated refresh
After v1 ships, the platform gains a weekly automated job that surfaces (a) re-strike candidates on existing assets, (b) lifecycle progression events, (c) candidate new assets, (d) candidate new financing precedents, and (e) source-freshness failures — all delivered as a draft PR for human review. **Nothing auto-merges.** Specification lives at `WEEKLY_REFRESH_SPEC.md` (repo root). Do not start Module B until Weekend 6 is complete and the v1 register is stable.

---

## 10. Editorial and content rules

- **No emotive imagery.** Damage photos only where they materially support classification or destruction-level claims. Never as a hero image.
- **No political framing in primary copy.** State facts and sources. Readers form their own conclusions.
- **Every figure inline-sourced.** A figure without an accessible source citation is a bug.
- **Disclaimer per asset:** "Cost and financing-structure figures are estimates derived from published unit-cost benchmarks (RDNA3, KSE Institute) and named comparable Ukrainian precedents. They are not guarantees, not procurement quotes, and not a substitute for transaction-level due diligence."
- **No real-time damage claims.** Updates are weekly-batched. The platform is a register, not a wire.
- **Bilingual asset names always.** English-first UI at v1; Ukrainian UI by v1.1.
- **Re-damaged assets are featured, not hidden.** A re-damage count of 2+ is a material investor-information field. Show it.
- **Frontline and occupied assets are documented but defaulted off.** Filter chip lets users expose them as "pipeline only."

---

## 11. Reference sources (canonical)

These are the load-bearing sources for the methodology. Cite by these short codes everywhere in the data:

| Code | Full reference |
|---|---|
| `RDNA3` | World Bank, Government of Ukraine, European Commission, UN — Ukraine Rapid Damage and Needs Assessment, Third Edition (February 2024). |
| `KSE` | Kyiv School of Economics Institute, "Russia Will Pay" damage tracker and methodology, updated periodically. |
| `EBRD_CASE` | EBRD Ukraine reconstruction case studies — financing-structure precedents. |
| `EU_FACILITY` | EU Ukraine Facility programme documents (EUR 50bn, 2024–27), Ukraine Plan reform and reconstruction milestones. |
| `EIB_UA` | EIB EU4Ukraine investment platform documentation. |
| `MIGA` | MIGA War & Civil Disturbance insurance product documentation, Ukraine portfolio. |
| `OCHA` | UN OCHA Ukraine flash updates and humanitarian needs overviews. |
| `BELLINGCAT` | Bellingcat / Centre for Information Resilience verified-incident mapping. |
| `ACLED` | ACLED Ukraine conflict event data. |
| `eRECOVERY` | Government of Ukraine eRecovery / DREAM platform. |

Full bibliography lives in `docs/sources.md`.

---

## 12. Conventions Claude Code should follow

- **JSON files:** 2-space indent, sorted keys at top level for diff-friendliness, trailing newline.
- **JS:** ES modules. No transpilation. Targets evergreen browsers + Node 20 (Netlify Functions runtime).
- **CSS:** plain CSS, custom properties for theming, mobile-first. No Tailwind, no preprocessor.
- **Commits:** Conventional Commits style. Sectional prefixes: `data:`, `schema:`, `map:`, `orchestrator:`, `costing:`, `docs:`, `infra:`.
- **Version bump on every commit:** Every commit that changes any file under `public/` or `data/` must increment both (a) `CACHE_VERSION` in `public/service-worker.js` (e.g. `uvidnova-v18` → `uvidnova-v19`) and (b) `app-version` / `version-label` strings in `public/index.html` (e.g. `0.2.2` → `0.2.3`). This ensures users always receive the latest assets after deployment without manual cache clearing.
- **PRs:** every PR that touches `data/` must pass `scripts/validate-all.js`. CI enforces this.
- **Adding a new asset:** always use `scripts/new-asset.js <asset_id>` to scaffold from template. Never copy-paste an existing JSON and mutate — too easy to miss a field.
- **Adding a new asset_type to taxonomy:** separate PR, must include unit_cost row and any new physical-spec fields required by the type.
- **Numbers:** USD millions for costs, percent integers for financing stacks, lat/lon to 4 decimal places.
- **Dates:** ISO 8601 (`YYYY-MM-DD`).
- **No secrets in repo.** Anthropic API key lives in Netlify env vars only.

---

## 13. Things to NOT do (do not relitigate without Sam)

- Do not introduce a frontend framework (React/Vue/Svelte). Stack is vanilla JS PWA.
- Do not move data from static JSON to a database at v1. Static files are version-controlled, diff-able, auditable — that is the point.
- Do not let the LLM produce a numeric output. Numbers always come from deterministic lookups.
- Do not add a donations widget, a newsletter signup, or any retail-fundraising element. Audience is institutional.
- Do not add live damage feeds or real-time incident ingestion. Weekly batched, verified updates only.
- Do not include occupied or frontline-adjacent assets in the default view. They are documented as "pipeline only" with the filter off by default.
- Do not pursue KSE Institute partnership before the platform launches. Ship clean, then pitch with a working artefact.
- Do not incorporate as a legal entity yet. Personal project until product-market fit with institutional users is demonstrated.
- Do not start Module B (weekly automated refresh) until v1 is shipped and stable. See `WEEKLY_REFRESH_SPEC.md` for the full spec when ready.

---

## 14. Immediate next step for the first session

If this is the **first time** Claude Code is opening this repo, do all of the following in one PR:

1. Create `package.json` (devDeps: `ajv`, `ajv-formats`).
2. Create `netlify.toml` with `[build] publish = "public"` and `[functions] directory = "functions"`.
3. Create `.github/workflows/validate.yml`.
4. Author the four schema files in `schemas/` (full Draft 2020-12).
5. Author `data/taxonomy.json` with the asset types implied by the 50-asset list (energy, healthcare, education, residential, heritage, transport, water, industrial, public_admin — each with subtypes).
6. Author `scripts/validate-all.js` and `scripts/new-asset.js`.
7. Create the five anchor asset JSONs (Kakhovka HPP, Mariupol Drama Theatre, An-225, Okhmatdyt, Trypilska TPP) — even if `cost_paths` carry placeholder figures with `"pending_methodology": true`, the structural fields and sources must be real.
8. Create `public/index.html` + `public/js/app.js` rendering a Leaflet map of Ukraine with five pins at the anchor coordinates.
9. Create `public/asset.html` + `public/js/asset-view.js` rendering all schema fields for an asset by `?id=...`.
10. Open with a self-review checklist confirming schema validation passes and the five pins render.

If the repo already has a partial scaffold, run `git status` first and continue from wherever the previous session stopped — don't blow away existing work.

Before any major architectural change, ask Sam.

---

*Last updated: 2026-05-14. Source brief: uVidNova Project Brief v1.2, 11 May 2026.*

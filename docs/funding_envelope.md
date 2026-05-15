# Funding envelope — donor pools, instrument capacity, EU accession multipliers, concentration findings

**Document type:** Canonical reference. Governs `data/funding_envelope.json`.

**Vintage:** 2025 Ukraine Recovery Conference cycle. Re-verify all figures against
current IFI board decisions and EU budget commitments before each platform release.

**Total recovery need:** USD 486bn (RDNA3, February 2024) / USD 524bn (updated December
2024 estimate). [RDNA3]

---

## 1. The six donor and instrument pools

Ukraine's reconstruction financing draws from six structurally distinct pools. Each pool
has a different governance structure, disbursement mechanism, conditionality framework,
and confidence level.

---

### Pool 1 — EU Ukraine Facility and bilateral EU member-state grants

**Confirmed commitment:** EUR 50bn (2024–27), of which approximately EUR 33bn in Pillar I
non-repayable support and EUR 17bn in Pillar II loans and guarantees. [EU_FACILITY]

**Confidence:** High. The Facility is established by EU Regulation 2024/792, ratified by
the European Parliament and Council. Annual tranches are disbursed against Ukraine Plan
milestones. First tranche of EUR 4.5bn disbursed March 2024.

**Tranche fields filled:**
- `grant_pct` (Pillar I non-repayable component, primary EU grant source)
- `first_loss_pct` (Pillar II guarantee window, subordinated first-loss capacity)
- `era_pct` (ERA loan: G7 Extraordinary Revenue Acceleration loan of ~USD 50bn backed
  by interest on frozen Russian sovereign reserves; EU administers the European portion)

**Key conditionalities:**
- Annual reform milestones under the Ukraine Plan (governance, rule of law, public
  administration, energy transition)
- Green and accessibility conditionalities activate higher grant shares in the
  build-back-better path for social infrastructure and energy sectors
- EU accession milestones tied to post-2027 successor facility

**Sector concentration:** All sectors eligible; social infrastructure (healthcare,
education, water and sanitation, housing) and energy transition receive the highest
absolute allocations.

---

### Pool 2 — EBRD (European Bank for Reconstruction and Development)

**Confirmed commitment:** EBRD announced cumulative Ukraine support exceeding EUR 12bn
since February 2022, with a forward programme envelope of approximately EUR 3–4bn per
year under the Resilience and Sustainability Framework (RSF). [EBRD_CASE]

**Confidence:** Medium. Board-approved aggregate envelopes; project-level sectoral
allocation inferred from EBRD pipeline disclosures and historical Ukraine loan mix.

**Tranche fields filled:**
- `concessional_pct` (EBRD concessional window — sub-IBRD pricing, 20–40 year tenors)
- `senior_ifi_pct` (EBRD near-market loans to revenue-generating assets)
- `first_loss_pct` (EBRD RSF first-loss sleeves for blended transactions)
- `dfi_equity_pct` (EBRD direct equity in SOE restructurings and PPP concessions)

**Pre-armistice capacity:** USD 20bn central estimate across the planning horizon.
**Post-armistice capacity:** USD 40–50bn central estimate (board reconfirmation of
enlarged Ukraine envelope contingent on peace).

**Key conditionalities:** EBRD ESG standards; procurement competition requirements;
governance reform triggers for concessional vs. near-market pricing.

---

### Pool 3 — World Bank Group / IDA

**Confirmed commitment:** World Bank Group approved USD 21.4bn in financing for Ukraine
across IBRD, IDA, and IFC instruments from March 2022 to end-2024. Forward programme
includes a potential USD 50bn+ reconstruction financing framework. [RDNA3]

**Confidence:** Medium. Aggregate cumulative commitment explicit; forward reconstruction
envelope inferred from World Bank Board discussions and RDNA3 financing annex.

**Tranche fields filled:**
- `concessional_pct` (IBRD and IDA concessional reconstruction loans, 25–40 year tenors)
- `grant_pct` (IDA grant component for eligible low-income sub-programmes)
- `senior_ifi_pct` (IFC near-market lending to private sector revival)
- `dfi_equity_pct` (IFC equity in SOE privatisations and anchor private investments)

**Pre-armistice capacity:** USD 25bn central estimate across IBRD/IDA/IFC combined.
**Post-armistice capacity:** USD 60–80bn if full IBRD headroom activated.

**Key conditionalities:** World Bank fiduciary and procurement standards; Systematic
Country Diagnostic alignment; governance reform prior actions linked to DPF series.

---

### Pool 4 — Bilateral export credit agencies (ECAs)

**Confirmed commitment:** Named bilateral ECA Ukraine envelopes publicly announced:
UKEF (UK): GBP 3bn announced capacity for Ukraine; Bpifrance/COFACE (France): EUR 1bn+;
Euler Hermes/SACE (Germany/Italy): sovereign guarantee frameworks; EKF (Denmark):
Scandinavian credit facilities; JICA (Japan): grant-equivalent support for social
infrastructure. [MIGA]

**Confidence:** High for announced capacities; medium for actual deployment rates.
Pre-armistice utilisation at 30–50% of announced capacity (risk appetite constraint).
Post-armistice: utilisation rate rises to 70–90% of announced capacity; caps lifted.

**Tranche fields filled:**
- `eca_pct` (primary vehicle — buyer credit and political risk insurance)
- Enables `commercial_debt_pct` by backstopping B-loan commercial tranches

**Pre-armistice capacity:** USD 10bn central estimate (PRI capacity unlocking USD 30–60bn
in commercial lending per MIGA portfolio analysis). [MIGA]
**Post-armistice capacity:** USD 40bn ECA direct; USD 70–100bn commercial unlock.

**Key conditionalities:** Export nexus requirements (ECA-country goods and services
content in project procurement); OECD Arrangement on Officially Supported Export Credits.

---

### Pool 5 — Diaspora capital and patriotic bond programmes

**Confirmed commitment:** None. Ukraine has issued war bonds (UAH and FX) since 2022;
no formal diaspora bond programme equivalent to Israel State Bonds or Ireland NTMA
scheme has been established as of 2025.

**Confidence:** Low. Estimated from analogues:
- Israel State Bonds: ~USD 1–2bn/year sustained diaspora placement.
- Ireland NTMA retail scheme: EUR 300–500m/year.
- Ukrainian diaspora estimated at 5–8 million people, with remittance capacity of
  USD 5–15bn/year based on pre-war patterns.

**Tranche fields filled:**
- `diaspora_pct` (direct diaspora bond placement)
- Indirectly supports `commercial_debt_pct` (diaspora capital in A/B structures)

**Pre-armistice central estimate:** USD 3bn total.
**Post-armistice central estimate:** USD 11bn (sustained annual programme possible).

**Key uncertainties:** legal framework for non-resident bond issuance; FX convertibility
guarantees; retail distribution infrastructure in diaspora locations (USA, Germany, UK,
Canada, Poland, Czech Republic).

---

### Pool 6 — Commercial and institutional capital markets

**Confirmed commitment:** None. Commercial market access is currently limited to
Ukraine sovereign eurobonds (restructured, trading at distressed levels) and IFI A/B
loan B-tranches.

**Confidence:** Low. Post-armistice figures are theoretical capacity modelling.

**Instruments and tranche fields:**
- `commercial_debt_pct`: commercial bank senior debt via IFI A/B structures (pre-armistice)
  and standalone syndicates (post-armistice)
- `institutional_debt_pct`: capital markets debt absorbed by EU/UK/North American/Asian
  institutional investors as sovereign rating improves

**Pre-armistice capacities (central estimates):**
- Commercial bank debt: USD 7bn (almost entirely via A/B structures)
- Institutional debt: USD 4bn (primarily bilateral placements; market access minimal)
- Private equity: USD 4bn (telecoms, agri-logistics, opportunistic)

**Post-armistice capacities (central estimates):**
- Commercial bank debt: USD 40bn
- Institutional debt: USD 80bn (wide range: USD 50–115bn depending on accession state)
- Private equity: USD 30bn

**Institutional investor sub-pools (post-armistice, central estimates):**

| Pool | Post-armistice central (USD bn) |
|---|---|
| EU insurers and pension funds | 22.5 |
| UK insurers and bulk annuity | 10.0 |
| North American pension funds | 17.5 |
| Asian institutional capital | 7.5 |
| Sovereign wealth funds | 10.0 |
| Global infrastructure debt funds | 15.0 |
| **Total** | **82.5** |

Source: `data/funding_envelope.json`, `institutional_pools` block.

---

## 2. EU accession state multipliers

EU accession trajectory is the most powerful single variable affecting total funding
envelope capacity. Multipliers from `data/funding_envelope.json`:

| Accession state | Grant multiplier | Senior IFI multiplier | Institutional debt multiplier |
|---|---|---|---|
| Stalled | 0.85× | 0.80× | 0.40× |
| On track | 1.00× | 1.00× | 1.00× |
| Accelerated | 1.15× | 1.20× | 1.50× |

**Mechanism:**
- **Stalled:** EU Facility successor programme uncertain; Solvency II matching-adjustment
  relief unavailable; capital-market investors apply sovereign-rating premium that removes
  most institutional debt capacity.
- **On track:** Baseline case. EU Facility successor in planning; partial Solvency II
  relief expected; commercial market access recovers gradually.
- **Accelerated:** Full EU cohesion fund access; Solvency II matching adjustment fully
  applicable to Ukraine sovereign debt; infrastructure debt funds activate EM mandates.

**Illustration:** At stalled accession, the institutional debt envelope shrinks from
USD 80bn (central) to USD 32bn (0.40× multiplier). At accelerated accession, it grows
to USD 120bn (1.50× multiplier). This USD 88bn swing is the largest single scenario
variable in the entire funding envelope.

The EU accession toggle in the Finance It tool (`/finance.html`) reflects these
multipliers directly.

---

## 3. Scenario defaults

The platform defaults to the conservative scenario:

| Parameter | Default value | Rationale |
|---|---|---|
| `peace_state` | `pre_armistice` | Reflects current conditions as of Q2 2026 |
| `eu_accession` | `stalled` | Accession chapters opened but no timeline confirmed |
| `frozen_assets` | `proceeds_only` | G7 ERA loan (~USD 50bn) confirmed; principal seizure remains legally contested |

Users can toggle all three parameters in the Finance It tool to explore alternative scenarios.

---

## 4. Total funding envelope summary

Pre-armistice, conservative default (proceeds_only, stalled accession):

| Pool | Confidence | Central capacity (USD bn) |
|---|---|---|
| EU grants (Pillar I) | High | ~28 (stalled accession: 0.85× on EUR 33bn) |
| ERA / frozen-asset proceeds | High | 50 |
| First-loss / guarantee capital | Medium | 12 |
| Concessional IFI debt (EBRD + World Bank + EIB) | Medium | 95 |
| Senior IFI debt | Medium | 20 |
| ECA buyer credit | High | 10 |
| DFI equity | Medium | 6 |
| Public equity (Ukrainian counterpart) | Medium | 11 |
| Diaspora bonds | Low | 3 |
| Commercial bank debt | Low | 7 |
| Institutional debt | Low | 1.6 (stalled: 0.40×) |
| Private equity | Low | 4 |
| **Indicative total** | — | **~248** |

Against a total recovery need of USD 486–524bn [RDNA3], this indicates a structural gap
of approximately USD 238–276bn in pre-armistice conditions with stalled EU accession.
The gap narrows materially under post-armistice durable peace with on-track accession:
indicative total rises to approximately USD 400–430bn.

**Important caveat.** These are funding-envelope estimates for the total reconstruction
programme over a multi-decade horizon, not single-year deployment capacity. Annual
deployment is absorption-capacity limited (project preparation, procurement, supervision)
independent of funding availability. RDNA3 estimates maximum credible annual disbursement
at USD 15–20bn in the near term. [RDNA3]

---

## 5. Concentration findings

From `data/funding_envelope.json`, `concentration_finding` block:

### Near-fully financeable (pre-armistice, rebuildable zones)
- Healthcare — all paths
- Education — all paths
- Transport non-revenue (rail, bridges) — all paths
- Public administration — all paths

These sectors are dominated by grant and concessional tranches that are high-confidence
and largely independent of peace-state and accession trajectory.

### Conditionally financeable (pre-armistice)
- **Energy BBB:** financeable if MIGA wrap secured and offtake contract structure in
  place. Without MIGA, commercial tranche drops to zero and total cost coverage falls
  ~15% short.
- **Transport revenue-generating:** financeable if PPP concession framework
  standardised. Currently delayed by regulatory uncertainty.
- **Housing BBB:** financeable if EU Housing Pillar envelope confirmed (announced but
  not yet fully detailed as of May 2026).
- **Water and sanitation BBB:** financeable if municipal PPP capacity sufficient for
  co-financing. Current absorptive constraint: municipal financial management.

### Capacity-constrained (pre-armistice)
- **Industrial (steel, coke, agri-processing):** private equity and commercial debt
  tranches that dominate these stacks are near-zero pre-armistice. Estimated financing
  gap: USD 50–60bn for the full industrial register.
- **Heritage in formerly-occupied areas:** grant capacity exists (UNESCO + EU Creative
  Europe) but absorptive constraint is project preparation and documentation, not funds.
- **Frontline-adjacent and occupied assets:** rebuildability filter excludes from
  financing-active universe; no deployment modelled.
- **Re-damaged assets in contested zones (Mariupol, Avdiivka):** destruction factor ×
  regional multiplier × war-risk premium compound to costs that exceed any available
  PRI cover; financing capacity collapses.
- **Small-scale municipal infrastructure (< USD 5m project cost):** transaction-cost
  economics fail — IFI project preparation and supervision costs exceed the economics
  of individual transactions. Requires aggregation vehicles (municipal bond programmes,
  pooled guarantee facilities) that do not yet exist at scale in Ukraine.

---

## 6. Data update cadence

| Source | Expected update | Action on update |
|---|---|---|
| RDNA3 | RDNA4 expected 2025-Q2 | Recheck all unit costs and sector totals; update `data/unit_cost_table.json` and cross-check anchor assets |
| KSE tracker | Monthly (typically) | Review asset-level figures for anchor assets; flag divergences > 15% |
| EBRD programme disclosures | Quarterly | Update `pre_armistice` and `post_armistice` capacity fields for concessional and senior IFI tranches |
| EU Facility disbursement reporting | Semi-annual | Verify Pillar I disbursement pace; update ERA tranche total if accruals differ |
| MIGA Ukraine portfolio | Annual (MIGA Annual Report) | Update PRI wrap capacity and debt-unlock multiplier |
| Funding envelope total | Annual (Ukraine Recovery Conference) | Full re-review of all pool estimates; update `data/funding_envelope.json` |

---

*Last updated: 2026-05-14. Anchor sources: `RDNA3`, `EU_FACILITY`, `EBRD_CASE`,
`MIGA`, `EIB_UA`. All capacity figures are planning estimates, not confirmed
commitments. See `docs/sources.md` for full bibliography.*

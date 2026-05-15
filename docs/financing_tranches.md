# Financing tranches — taxonomy, sector × path templates, wartime rules, confidence levels

**Document type:** Canonical reference. Governs `data/financing_templates.json`,
`schemas/financing_template.schema.json`, and the `financing_structures` block of
`schemas/asset.schema.json`.

**Sources:** `RDNA3`, `EU_FACILITY`, `EBRD_CASE`, `MIGA`, `EIB_UA`.

---

## 1. Canonical tranche taxonomy

Twelve layers, ordered most concessional → most commercial. Every Ukraine reconstruction
deal can be expressed as a combination of these. Within any single deal, percentage
allocations must sum to 100. Political-risk insurance (PRI) is a credit enhancement —
modelled as a boolean / multi-select on the deal, not as a percentage tranche.

| # | Short code | Field in schema | Label | Confidence |
|---|---|---|---|---|
| 1 | `grnt` | `grant_pct` | Pure grants | High |
| 2 | `era` | `era_pct` | ERA / frozen-asset proceeds | High |
| 3 | `flos` | `first_loss_pct` | First-loss / guarantee capital | Medium |
| 4 | `conc` | `concessional_pct` | Concessional IFI debt | Medium |
| 5 | `sifi` | `senior_ifi_pct` | Senior IFI debt (near-market) | Medium |
| 6 | `dfie` | `dfi_equity_pct` | DFI equity / quasi-equity | Medium |
| 7 | `eca` | `eca_pct` | ECA buyer credit / direct lending | High |
| 8 | `pubq` | `public_equity_pct` | Sovereign / municipal counterpart equity | Medium |
| 9 | `dias` | `diaspora_pct` | Diaspora capital / patriotic bonds | Low |
| 10 | `bnkd` | `commercial_debt_pct` | Commercial bank senior debt | Low |
| 11 | `insd` | `institutional_debt_pct` | Institutional / capital markets debt | Low |
| 12 | `peq` | `private_equity_pct` | Private equity / infrastructure funds | Low |
| — | `pri` | `pri_wrap` | PRI / war-risk wrap (credit enhancement, not a tranche) | High |

### 1.1 Tranche definitions

**1. Pure grants (`grant_pct`)**
Non-repayable. EU Ukraine Facility Pillar I non-repayable component; bilateral grants
(KfW/BMZ, USAID legacy commitments, FCDO, JICA grant aid); UN agency grants; EU
Creative Europe and UNESCO for heritage assets. Dominant in social infrastructure
(40–70% for healthcare, education, heritage, water and sanitation). Negligible for
revenue-generating assets. [RDNA3] [EU_FACILITY]

**2. ERA / frozen-asset proceeds (`era_pct`)**
Proceeds from the G7 Extraordinary Revenue Acceleration (ERA) loan backed by interest
on immobilised Russian sovereign reserves (~USD 50bn total envelope confirmed at G7 Stresa
Summit 2024). Repayment contingent on Russian reparations — functionally grant-equivalent
from Ukraine's balance-sheet perspective even though it books as debt to the G7. Carried
as a distinct tranche because the political conditionality differs from EU Facility grants.
[EU_FACILITY]

**3. First-loss / guarantee capital (`first_loss_pct`)**
Donor-funded subordinated layers that absorb initial impairment so commercial capital can
sit above them. EU Facility Pillar II guarantee window; EBRD Resilience and Sustainability
Framework (RSF) first-loss sleeves; EU4Ukraine guarantee pillar; DFC first-loss. Typically
5–15% of the stack by size, but does disproportionate leverage work: USD 1 of first-loss
typically unlocks USD 5–10 of commercial-layer capacity. [EU_FACILITY] [EBRD_CASE]

**4. Concessional IFI debt (`concessional_pct`)**
Long-tenor debt (20–40 years) with grace periods at sub-market pricing (IBRD-flat or
below). World Bank, EBRD concessional window, EIB EU4Ukraine, AIIB, NIB. Bilateral
concessional: KfW Entwicklungsbank, AFD, JICA. The workhorse layer — typically 25–45% in
mixed-finance social and municipal infrastructure. [EBRD_CASE] [EIB_UA]

**5. Senior IFI debt at near-market (`senior_ifi_pct`)**
EBRD, EIB, IFC senior loans to revenue-generating assets: rebuilt thermal/wind/solar with
offtakes, telecoms infrastructure, port concessions, agri-export logistics. Priced just
below commercial. Carries policy conditionality (governance, procurement, ESG). Primarily
post-armistice or for assets with clear offtake structures pre-armistice. [EBRD_CASE]
[EIB_UA]

**6. DFI equity and quasi-equity (`dfi_equity_pct`)**
IFC equity; EBRD direct equity; DFC equity; EU4Ukraine equity sleeve. Mezzanine
instruments (subordinated debt, convertible notes, preference shares) sit here. Used for
restructured state-owned enterprises (Ukrhydroenergo, Ukrenergo, Ukrposhta), PPP
concessionaires, and anchor private sponsors needing a DFI cornerstone. [EBRD_CASE]

**7. ECA buyer credit / direct lending (`eca_pct`)**
Export credit agency instruments: UKEF, Bpifrance Assurance Export, Euler Hermes (SACE),
EKF, and similar. Not a capital-stack percentage in the traditional sense but modelled as
a tranche for portfolio-level funding envelope sizing. Pre-armistice: ~30–50% of announced
capacity utilised. Post-armistice: caps lifted, bank syndication deepens materially. [MIGA]

**8. Sovereign / municipal counterpart equity (`public_equity_pct`)**
The Ukrainian contribution. Often partly in-kind (land, existing structure, regulatory
approvals at appraised value), partly budgetary. IFIs typically require 10–30% Ukrainian
counterpart. Municipal counterpart is the relevant line for housing, water and sanitation,
and oblast-level healthcare. [RDNA3] [EBRD_CASE]

**9. Diaspora capital and patriotic bonds (`diaspora_pct`)**
Ukrainian war bonds (UAH and FX issuances); diaspora bond programmes modelled on Israel
State Bonds and the Irish NTMA savings scheme. Small but politically significant for
legitimisation. Pre-armistice central estimate: USD 3bn. Post-armistice: USD 11bn at
central estimate. Confidence: low — estimated from analogues and fund-manager soundings.
[EBRD_CASE]

**10. Commercial bank senior debt (`commercial_debt_pct`)**
Viable pre-armistice almost exclusively via IFI A/B loan structures: IFI sits as lender
of record; commercial banks join the B-loan; preferred-creditor status passes through.
Some standalone export-credit-backed commercial debt for shipyards and agri terminals.
Post-armistice: standalone bank syndicates return. Confidence: low pre-armistice.
[EBRD_CASE]

**11. Institutional / capital markets debt (`institutional_debt_pct`)**
EU insurers and pension funds (Solvency II / matching adjustment regimes); UK insurers
and bulk annuity books; North American pension funds; Asian institutional capital;
sovereign wealth funds; global infrastructure debt funds. The most policy-contingent
tranche. EU accession stall compresses capacity by 40–60%; accelerated accession
multiplies it 1.5×. Solvency II / matching-adjustment regimes activate as Ukraine's
sovereign rating crosses thresholds. Confidence: low. [EU_FACILITY]

**12. Private equity / infrastructure funds (`private_equity_pct`)**
Ukraine-dedicated funds (Horizon Capital, Dragon Capital); regional EM infrastructure
funds; impact-mandate global infrastructure; distressed/value funds. Mostly post-armistice
or for narrow asset classes (telecoms, agri-logistics) where revenue visibility justifies
risk today. Confidence: low. [EBRD_CASE]

---

## 2. Sector × path template matrix

Central-tendency capital stacks for `data/financing_templates.json`. Percentages sum to
100 within each row. PRI wrap is a separate flag, not part of the sum.

### 2.1 Healthcare, education, heritage, water and sanitation
(High-grant social infrastructure — public goods character, no revenue to commercial lenders)

| Path | grant | era | first_loss | concessional | public_equity | private_equity | pri_wrap |
|---|---|---|---|---|---|---|---|
| baseline | 30 | 10 | 0 | 40 | 20 | 0 | MIGA optional |
| code_compliant | 40 | 10 | 0 | 35 | 15 | 0 | MIGA optional |
| build_back_better | 55 | 10 | 0 | 25 | 10 | 0 | MIGA optional |

**BBB rationale:** EU green and accessibility conditionalities (Pillar I) pay for the
upgrade increment. Heritage assets skew further toward grant (UNESCO + EU Creative Europe
+ bilateral cultural channels can reach 65–70%). [EU_FACILITY]

### 2.2 Residential (district-scale rebuild)

| Path | grant | era | first_loss | concessional | public_equity | private_equity | pri_wrap |
|---|---|---|---|---|---|---|---|
| baseline | 25 | 10 | 0 | 40 | 20 | 5 | MIGA optional |
| code_compliant | 35 | 10 | 5 | 30 | 15 | 5 | MIGA optional |
| build_back_better | 45 | 10 | 5 | 25 | 10 | 5 | MIGA optional |

**BBB rationale:** EU Housing Pillar conditionality + EBRD Green Cities concessional.
Small private equity wedge for premium segments where market pricing supports it.
[EU_FACILITY] [EBRD_CASE]

### 2.3 Energy — generation and grid

| Path | grant | era | first_loss | concessional | senior_ifi | dfi_equity | public_equity | commercial_debt | pri_wrap |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 10 | 5 | 5 | 25 | 25 | 5 | 15 | 10 | MIGA required |
| code_compliant | 20 | 5 | 5 | 25 | 20 | 5 | 15 | 5 | MIGA required |
| build_back_better | 30 | 5 | 5 | 25 | 15 | 5 | 10 | 5 | MIGA required |

**BBB rationale:** EU grant for renewables conversion + EBRD Green Economy concessional
tranche. MIGA wrap is the determining variable for the commercial-debt slice; without it,
commercial tranche drops to zero. [EU_FACILITY] [MIGA]

### 2.4 Transport — revenue-generating (ports, toll roads, telecoms)

| Path | grant | era | first_loss | concessional | senior_ifi | dfi_equity | private_equity | commercial_debt | pri_wrap |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 10 | 0 | 5 | 20 | 25 | 10 | 15 | 15 | MIGA + ECA |
| code_compliant | 15 | 0 | 5 | 20 | 25 | 10 | 10 | 15 | MIGA + ECA |
| build_back_better | 20 | 0 | 5 | 20 | 20 | 10 | 10 | 15 | MIGA + ECA |

Often structured as A/B loan + PPP concession. Frequently summarises at the four-bucket
level as 10–20 / 20–40 / 20–25 / 15–30 (grant / concessional / public_equity / private).
[EBRD_CASE]

### 2.5 Transport — non-revenue (rail corridors, bridges)

| Path | grant | era | first_loss | concessional | public_equity | pri_wrap |
|---|---|---|---|---|---|---|
| baseline | 30 | 10 | 0 | 40 | 20 | MIGA optional |
| code_compliant | 35 | 10 | 0 | 40 | 15 | MIGA optional |
| build_back_better | 40 | 10 | 0 | 40 | 10 | MIGA optional |

[EU_FACILITY] [EBRD_CASE]

### 2.6 Industrial (steel, coke, agri-processing)

| Path | grant | first_loss | concessional | senior_ifi | dfi_equity | private_equity | commercial_debt | pri_wrap |
|---|---|---|---|---|---|---|---|---|
| baseline | 5 | 5 | 15 | 20 | 10 | 35 | 10 | MIGA + ECA |
| code_compliant | 10 | 5 | 15 | 20 | 10 | 30 | 10 | MIGA + ECA |
| build_back_better | 15 | 5 | 15 | 20 | 10 | 25 | 10 | MIGA + ECA |

Most commercially oriented sector. Strategic investor anchor is typically a prerequisite
for any IFI involvement. [EBRD_CASE]

### 2.7 Public administration

| Path | grant | era | concessional | public_equity | pri_wrap |
|---|---|---|---|---|---|
| baseline | 55 | 10 | 30 | 5 | none |
| code_compliant | 60 | 10 | 25 | 5 | none |
| build_back_better | 65 | 10 | 20 | 5 | none |

EU Facility institutional track; governance conditionality rather than green/climate.
[EU_FACILITY]

---

## 3. Named structural patterns

These are recurring contractual arrangements that materially affect deal economics and
optics but are not tranches. They appear as `structure_patterns` tags on template and
precedent records.

| Code | Pattern | Description |
|---|---|---|
| `a_b_loan` | IFI A/B senior loan | IFI sits as lender of record; commercial banks join the B-loan. Preferred-creditor status passes through, enabling commercial capital to price risk it otherwise could not hold. Standard route through which commercial debt enters Ukraine deals. [EBRD_CASE] |
| `blending_facility` | Blended finance | EU grant explicitly used to write down the all-in cost of IFI debt rather than as a separate project line. Economically a grant; contractually attached to the loan. Flag separately to avoid double-counting grant and concessional tranches. [EU_FACILITY] |
| `donor_interest_subsidy` | Donor interest-rate subsidy | Donor pays interest above a target rate, reducing effective borrowing cost. NPV-equivalent to a grant but different optics for the recipient government. [EBRD_CASE] |
| `mezzanine` | Mezzanine / quasi-equity | Subordinated debt or convertible notes sitting within `dfi_equity_pct`. Tag when a convertible or participating note is the DFI instrument, rather than ordinary equity. |

---

## 4. Wartime adjustment rules

Applied when `peace_state = pre_armistice` (source: `data/wartime_adjustment_rules.json`).

### 4.1 Pre-armistice compressions

| Tranche | Retain fraction | Remainder redirected to |
|---|---|---|
| `commercial_bank_debt_pct` | 30% | 100% → `concessional_pct` |
| `institutional_debt_pct` | 20% | 50% → `era_pct`, 50% → `concessional_pct` |
| `private_equity_pct` | 30% | 60% → `dfi_equity_pct`, 40% → `grant_pct` |

PRI wrap (`MIGA_WAR`, `UKEF`, or equivalent) is **required** on all retained
`commercial_bank_debt_pct`, `institutional_debt_pct`, and `private_equity_pct` slices.
Without PRI wrap, these tranches compress to zero.

**Rationale.** In active conflict, commercial lenders and equity investors face loss
scenarios that cannot be priced into standard project-finance premiums without the
explicit first-loss and guarantee layering that only IFIs and sovereigns can provide.
Observed EBRD Ukraine portfolio deal structures and bilateral ECA utilisation rates
(30–50% of announced capacity pre-armistice) support these retention fractions.
[EBRD_CASE] [MIGA]

### 4.2 Post-armistice fragile compressions

| Tranche | Retain fraction | Remainder redirected to |
|---|---|---|
| `commercial_bank_debt_pct` | 60% | 100% → `concessional_pct` |
| `institutional_debt_pct` | 40% | 50% → `era_pct`, 50% → `concessional_pct` |
| `private_equity_pct` | 60% | 60% → `dfi_equity_pct`, 40% → `grant_pct` |

PRI wrap remains required on retained commercial tranches. War premium falls; sovereign
residual risk remains.

### 4.3 Full peacetime template

Activated when `peace_state = post_armistice_durable` and `sovereign_risk_band` is not
`severe`. Templates in §2 represent peacetime central tendency. No compression applied.
PRI wrap becomes optional rather than required.

---

## 5. Confidence levels

Each tranche's funding-envelope estimate carries a confidence rating based on the
quality of evidence for the stated capacity figure.

### High confidence
**Tranches:** `grant_pct`, `era_pct`, `pri_wrap`, `eca_pct`

Capacity figures are explicit in named source programme documents. Named envelopes
confirmed in published policy commitments or ratified agreements. Examples:
- EU Facility Pillar I: EUR 33bn non-repayable, explicit in EU Regulation 2024/792. [EU_FACILITY]
- ERA loan: ~USD 50bn, G7 Stresa declaration confirmed quantum.
- MIGA Ukraine War & Civil Disturbance portfolio target: explicit in MIGA press communications. [MIGA]

### Medium confidence
**Tranches:** `first_loss_pct`, `concessional_pct`, `senior_ifi_pct`, `dfi_equity_pct`,
`public_equity_pct`

Aggregate commitments announced by IFI boards; deployment ratios and project-level splits
inferred from comparable deal structures rather than stated in programme documents.
Examples:
- EBRD total Ukraine envelope 2022–27: announced at board level; sectoral allocation
  inferred from project pipeline. [EBRD_CASE]
- World Bank IBRD + IDA Ukraine programme: board-approved totals; concessional vs.
  near-market split inferred. [RDNA3]

### Low confidence
**Tranches:** `diaspora_pct`, `commercial_debt_pct`, `institutional_debt_pct`,
`private_equity_pct`

Estimated from analogues, fund-manager soundings, and theoretical capacity modelling.
Post-armistice figures are not confirmed commitments.

| Tranche | Pre-armistice central (USD bn) | Post-armistice central (USD bn) | Key sensitivity |
|---|---|---|---|
| Diaspora bonds | 3 | 11 | Diaspora engagement programme; Israel analogue |
| Commercial bank debt | 7 | 40 | A/B loan structures; sovereign rating |
| Institutional debt | 4 | 80 | EU accession state; Solvency II thresholds |
| Private equity | 4 | 30 | Armistice durability; fund mandate alignment |

EU accession adjustment multipliers applied to low-confidence tranches:

| Accession state | Grant multiplier | Senior IFI multiplier | Institutional debt multiplier |
|---|---|---|---|
| Stalled | 0.85× | 0.80× | 0.40× |
| On track | 1.00× | 1.00× | 1.00× |
| Accelerated | 1.15× | 1.20× | 1.50× |

Source: `data/funding_envelope.json`, `eu_accession_adjustments` block.

---

## 6. Concentration findings

From `data/funding_envelope.json`:

**Near-fully financeable** (pre-armistice, all paths):
- Healthcare (rebuildable zones)
- Education (rebuildable zones)
- Transport non-revenue rail/bridges (rebuildable zones)
- Public administration (grant-dominant)

**Conditionally financeable** (depends on specific instrument availability):
- Energy BBB (depends on MIGA wrap + offtake structures)
- Transport revenue-generating (depends on PPP concession standardisation)
- Housing BBB (depends on EU Housing Pillar envelope)
- Water and sanitation BBB (depends on PPP municipal capacity)

**Capacity-constrained** (pre-armistice; financing gap significant):
- Industrial assets (steel, coke, agri-processing) — pre-armistice gap ~USD 50–60bn
- Heritage in formerly-occupied areas — absorptive-capacity constraint
- Frontline-adjacent residential — rebuildability filter excludes most deployment
- Industrial in re-damaged zones (Mariupol, Avdiivka) — capacity collapse
- Smaller-scale municipal infrastructure — transaction-cost economics fail below ~USD 5m

---

## 7. Schema implications

### 7.1 `financing_template.schema.json` shape

```jsonc
{
  "template_id": "HEALTHCARE_BBB",
  "sector": "social_infrastructure",
  "asset_type_match": ["healthcare.*"],
  "path": "build_back_better",
  "tranches": {
    "grant_pct":           { "central": 55, "low": 50, "high": 65 },
    "era_pct":             { "central": 10, "low": 0,  "high": 15 },
    "first_loss_pct":      { "central": 0,  "low": 0,  "high": 5  },
    "concessional_pct":    { "central": 25, "low": 20, "high": 30 },
    "senior_ifi_pct":      { "central": 0,  "low": 0,  "high": 10 },
    "dfi_equity_pct":      { "central": 0,  "low": 0,  "high": 5  },
    "public_equity_pct":   { "central": 10, "low": 5,  "high": 15 },
    "diaspora_pct":        { "central": 0,  "low": 0,  "high": 5  },
    "commercial_debt_pct": { "central": 0,  "low": 0,  "high": 0  },
    "private_equity_pct":  { "central": 0,  "low": 0,  "high": 0  }
  },
  "pri_wrap": {
    "applicable": true,
    "providers": ["MIGA_WAR", "UKEF"]
  },
  "structure_patterns": ["blending_facility"],
  "rationale": "EU green-conditionality unlocks higher grant share via Pillar I.",
  "comparable_projects": ["KHARKIV_REGIONAL_HOSPITAL_REBUILD_2024"],
  "sources": [
    { "code": "EU_FACILITY", "ref": "Ukraine Facility Regulation 2024/792, Pillar I" },
    { "code": "EBRD_CASE",   "ref": "EBRD Ukraine Healthcare Reconstruction Programme" }
  ]
}
```

Constraint: sum of all `*_pct.central` values must equal 100. Schema enforces this.
`pri_wrap` is a credit enhancement, not part of the sum.

### 7.2 Asset schema `financing_structures` block

The `financing_structures.{baseline,code_compliant,build_back_better}` block in
`schemas/asset.schema.json` mirrors the 10-tranche structure with an additional
`template_id` field pointing to the matched template in `data/financing_templates.json`.
Per-asset overrides are permitted but must remain sum-to-100.

Mezzanine and quasi-equity are folded into `dfi_equity_pct` with `structure_patterns:
["mezzanine"]` rather than receiving a separate top-level bucket. Revisit at v1.x if
deal variation warrants it.

---

*Last updated: 2026-05-14. Anchor sources: `RDNA3`, `EU_FACILITY`, `EBRD_CASE`,
`MIGA`, `EIB_UA`. See also `docs/sources.md` for full bibliography.*

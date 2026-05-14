# Financing tranches — taxonomy, sector × path templates, schema implications

**Purpose.** This document is the spec for two pieces of work on uVidNova:

1. `data/financing_templates.json` — the sector × path matrix of standard capital stacks, keyed off the canonical tranche taxonomy below.
2. A revision of `schemas/financing_template.schema.json` (and a knock-on revision of the `financing_structures` block in `schemas/asset.schema.json`) so the stack can represent the post-war Ukraine reality without forcing distinct economic tranches into the same bucket.

It also informs `data/precedents.json` — each named Ukrainian precedent should record its actual tranche breakdown using the same vocabulary.

The taxonomy below is the Ukraine post-war stack as documented in `RDNA3`, the `EU_FACILITY` regulation and Ukraine Plan, `EBRD_CASE` reconstruction studies, and `MIGA` portfolio documentation. It is not generic post-conflict finance — it reflects the specific instruments Ukraine has had built around it.

---

## 1. Canonical tranche taxonomy

Eleven layers, ordered most concessional → most commercial. Every Ukraine reconstruction deal can be expressed as a combination of these.

1. **Pure grants (sovereign-to-sovereign and multilateral).** Non-repayable. EU Ukraine Facility Pillar I non-repayable component, bilateral grants (KfW/BMZ, USAID legacy commitments, FCDO, JICA grant aid), UN agency grants, EU Creative Europe and UNESCO for heritage. Dominant in social infrastructure (40–70% for healthcare, education, heritage, W&WW). Negligible for revenue-generating assets.

2. **Frozen Russian sovereign asset proceeds (ERA / G7 Extraordinary Revenue Acceleration loan).** Repayment contingent on RU reparations, so functionally a grant from Ukraine's balance-sheet perspective even though it books as debt. ~USD 50bn envelope across G7. Carried as a distinct tranche because the political conditionality differs from EU Facility grants.

3. **First-loss / guarantee capital.** Donor-funded subordinated layers that absorb initial impairment so commercial money can sit above them. EU Facility Pillar II guarantee window, EBRD Resilience and Sustainability Framework first-loss sleeves, EU4Ukraine guarantee pillar, DFC first-loss. Typically 5–15% of the stack; does the disproportionate work of unlocking everything below.

4. **Concessional IFI debt.** Long tenor (20–40 years), grace periods, IBRD-flat or sub-IBRD pricing. World Bank, EBRD concessional window, EIB EU4Ukraine, AIIB, NIB. Bilateral concessional: KfW Entwicklungsbank, AFD, JICA. The workhorse layer — typically 25–45% in mixed-finance social and municipal infrastructure.

5. **Senior IFI debt at near-market.** EBRD, EIB, IFC senior loans to revenue-generating assets (rebuilt thermal/wind/solar with offtakes, telecoms, port concessions, agri-export logistics). Priced just below commercial. Carries policy conditionality (governance, procurement, ESG).

6. **Political risk insurance / war-risk wrap.** MIGA War & Civil Disturbance, UKEF, BPIFrance Assurance Export, Allianz Trade, SACE, EKF. Not a tranche in the capital-stack sense but the credit enhancement that opens the lower layers. Premiums frequently subsidised by donor envelopes. Modelled as a boolean / multi-select on the deal, not a percentage of stack.

7. **DFI equity and quasi-equity.** IFC equity, EBRD direct equity, DFC equity, EU4Ukraine equity sleeve. Mezzanine instruments — subordinated debt, convertible notes, preference shares — sit here. Used for restructured SOEs (Ukrhydroenergo, Ukrenergo, Ukrposhta), PPP concessionaires, anchor private sponsors.

8. **Sovereign and municipal counterpart equity.** The Ukrainian contribution. Often partly in-kind (land, existing structure, regulatory approvals at appraised value), partly budgetary. IFIs typically require 10–30%. Municipal counterpart is the relevant line for housing, W&WW, oblast healthcare.

9. **Diaspora capital and patriotic bonds.** Ukrainian war bonds (UAH + FX), diaspora bond issuances modelled on Israel/Ireland precedents. Small but politically valuable for legitimisation.

10. **Commercial senior debt.** Viable only on revenue-generating, post-stabilisation assets and typically only via IFI A/B loan structures — IFI as lender of record, commercial banks on the B-loan, preferred-creditor status passes through. Some standalone export-credit-backed commercial debt for shipyards, agri terminals.

11. **Private equity / infrastructure funds.** Ukraine-dedicated (Horizon Capital, Dragon Capital), regional EM infra, impact-mandate global infra. Mostly post-armistice or for narrow asset classes (telecoms, logistics) today.

---

## 2. Sector × path template matrix

Central-tendency capital stacks for `data/financing_templates.json`. Columns are tranches by short code; rows are sector × path. Percentages sum to 100 within each row (the PRI wrap is a separate flag, not part of the sum).

Short codes used below:

- `grant` (layer 1)
- `era` (layer 2 — frozen asset proceeds)
- `first_loss` (layer 3)
- `concessional` (layer 4)
- `senior_ifi` (layer 5)
- `dfi_equity` (layer 7)
- `public_equity` (layer 8)
- `diaspora` (layer 9)
- `commercial_debt` (layer 10)
- `private_equity` (layer 11)
- `pri_wrap` — boolean / array of named wrap providers (layer 6)

Where a cell shows a range, the central template uses the midpoint; the range is informational for `comparable_projects` matching.

### Healthcare, education, heritage, W&WW (high-grant social infrastructure)

| Path | grant | era | first_loss | concessional | public_equity | private_equity | pri_wrap |
|---|---|---|---|---|---|---|---|
| baseline | 30 | 10 | 0 | 40 | 20 | 0 | MIGA optional |
| code_compliant | 40 | 10 | 0 | 35 | 15 | 0 | MIGA optional |
| build_back_better | 55 | 10 | 0 | 25 | 10 | 0 | MIGA optional |

Rationale for the BBB grant uplift: EU green/accessibility conditionalities (Pillar I) pay for the upgrade. Heritage skews even further toward grant (UNESCO + EU Creative Europe + bilateral cultural).

### Housing (district-scale rebuild)

| Path | grant | era | first_loss | concessional | public_equity | private_equity | pri_wrap |
|---|---|---|---|---|---|---|---|
| baseline | 25 | 10 | 0 | 40 | 20 | 5 | MIGA optional |
| code_compliant | 35 | 10 | 5 | 30 | 15 | 5 | MIGA optional |
| build_back_better | 45 | 10 | 5 | 25 | 10 | 5 | MIGA optional |

BBB unlock: EU Housing Pillar + EBRD Green Cities concessional. Small private equity wedge for premium segments.

### Energy — generation and grid

| Path | grant | era | first_loss | concessional | senior_ifi | dfi_equity | public_equity | commercial_debt | pri_wrap |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 10 | 5 | 5 | 25 | 25 | 5 | 15 | 10 | MIGA required |
| code_compliant | 20 | 5 | 5 | 25 | 20 | 5 | 15 | 5 | MIGA required |
| build_back_better | 30 | 5 | 5 | 25 | 15 | 5 | 10 | 5 | MIGA required |

BBB unlock: EU grant for renewables conversion + EBRD Green Economy concessional. MIGA wrap is the determining variable for the commercial-debt slice.

### Transport — revenue-generating (ports, toll roads, telecoms)

| Path | grant | era | first_loss | concessional | senior_ifi | dfi_equity | private_equity | commercial_debt | pri_wrap |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 10 | 0 | 5 | 20 | 25 | 10 | 15 | 15 | MIGA + ECA |
| code_compliant | 15 | 0 | 5 | 20 | 25 | 10 | 10 | 15 | MIGA + ECA |
| build_back_better | 20 | 0 | 5 | 20 | 20 | 10 | 10 | 15 | MIGA + ECA |

Often structured as A/B loan + concession PPP. Frequently 10/30/20/40 grant/concessional/public_equity/private when modelled at the four-bucket level.

### Transport — non-revenue (rail, bridges)

| Path | grant | era | first_loss | concessional | public_equity | pri_wrap |
|---|---|---|---|---|---|---|
| baseline | 30 | 10 | 0 | 40 | 20 | MIGA optional |
| code_compliant | 35 | 10 | 0 | 40 | 15 | MIGA optional |
| build_back_better | 40 | 10 | 0 | 40 | 10 | MIGA optional |

### Industrial (steel, coke, agri-processing)

| Path | grant | first_loss | concessional | senior_ifi | dfi_equity | private_equity | commercial_debt | pri_wrap |
|---|---|---|---|---|---|---|---|---|
| baseline | 5 | 5 | 15 | 20 | 10 | 35 | 10 | MIGA + ECA |
| code_compliant | 10 | 5 | 15 | 20 | 10 | 30 | 10 | MIGA + ECA |
| build_back_better | 15 | 5 | 15 | 20 | 10 | 25 | 10 | MIGA + ECA |

### Public administration

| Path | grant | era | concessional | public_equity | pri_wrap |
|---|---|---|---|---|---|
| baseline | 55 | 10 | 30 | 5 | none |
| code_compliant | 60 | 10 | 25 | 5 | none |
| build_back_better | 65 | 10 | 20 | 5 | none |

---

## 3. Named structural patterns

These are not tranches but recurring contractual arrangements. They should be modelled as `structure_pattern` tags on a financing template / precedent record, because they materially affect both the economics and the optics of the stack.

- **`a_b_loan`** — IFI senior with commercial syndicate. IFI sits as lender of record; commercial banks join the B-loan; preferred-creditor status passes through. The standard route through which commercial debt enters Ukraine deals.
- **`blending_facility`** — EU grant explicitly used to write down the all-in cost of IFI debt rather than as a separate project line. Common in EU4Ukraine. Economically a grant but contractually attached to the loan — flag separately to avoid double-counting.
- **`donor_interest_rate_subsidy`** — Alternative to grants. Donor pays interest above a target rate, reducing effective borrowing cost. Equivalent NPV impact to a grant, very different optics for the recipient government.

---

## 4. Schema implications

Current state. `schemas/asset.schema.json` represents financing as four buckets per path:

```
grant_pct + concessional_pct + public_equity_pct + private_pct = 100
```

That collapses several economically distinct tranches. For an institutional audience it should be expanded.

### Proposed `financing_template.schema.json` shape

```jsonc
{
  "template_id": "HEALTHCARE_BBB",
  "sector": "social_infrastructure",
  "asset_type_match": ["healthcare.*"],
  "path": "build_back_better",
  "tranches": {
    "grant_pct":            { "central": 55, "low": 50, "high": 65 },
    "era_pct":              { "central": 10, "low": 0,  "high": 15 },
    "first_loss_pct":       { "central": 0,  "low": 0,  "high": 5  },
    "concessional_pct":     { "central": 25, "low": 20, "high": 30 },
    "senior_ifi_pct":       { "central": 0,  "low": 0,  "high": 10 },
    "dfi_equity_pct":       { "central": 0,  "low": 0,  "high": 5  },
    "public_equity_pct":    { "central": 10, "low": 5,  "high": 15 },
    "diaspora_pct":         { "central": 0,  "low": 0,  "high": 5  },
    "commercial_debt_pct":  { "central": 0,  "low": 0,  "high": 0  },
    "private_equity_pct":   { "central": 0,  "low": 0,  "high": 0  }
  },
  "pri_wrap": {
    "applicable": true,
    "providers": ["MIGA_WAR", "UKEF"]
  },
  "structure_patterns": ["blending_facility"],
  "rationale": "EU green-conditionality unlocks higher grant share via Pillar I.",
  "comparable_projects": ["KHARKIV_REGIONAL_HOSPITAL_REBUILD_2024"],
  "sources": [
    { "code": "EU_FACILITY", "ref": "..." },
    { "code": "EBRD_CASE",   "ref": "..." }
  ]
}
```

Constraint: the sum of all `*_pct.central` values must equal 100. `pri_wrap` is a credit enhancement, not part of the sum.

### Knock-on change in `asset.schema.json`

The `financing_structures.{baseline,code_compliant,build_back_better}` block should be revised to mirror the ten-tranche structure (rather than the current four buckets), and should carry a `template_id` field pointing back at `data/financing_templates.json` for the central case. Per-asset overrides are still permitted but must remain sum-to-100.

Mezzanine and quasi-equity are not getting their own top-level bucket at this stage — they are folded into `dfi_equity_pct` with a `structure_patterns` tag if relevant (e.g. `["mezzanine"]`). Revisit if v1.x deals show enough material variation.

---

## 5. Implementation checklist

1. Revise `schemas/financing_template.schema.json` per §4. Enforce sum-to-100 on `*_pct.central`. Enforce `pri_wrap.providers[]` against the existing `de_risking` enum in `asset.schema.json`.
2. Revise the `financing_structures` block in `schemas/asset.schema.json` to the same ten-tranche shape with a `template_id` reference field.
3. Populate `data/financing_templates.json` with the seven sector templates × three paths = 21 records using the matrices in §2.
4. Migrate existing five anchor assets' `financing_structures` to the new shape. Where the old four-bucket values map cleanly (grant → grant_pct, concessional → concessional_pct, public_equity → public_equity_pct, private → split between commercial_debt_pct / private_equity_pct / dfi_equity_pct as appropriate), the migration is mechanical. Where it doesn't, mark `"pending_methodology": true` and flag for review.
5. Update `scripts/validate-all.js` to run the new schema. Update `.github/workflows/validate.yml` if any new dev dep is needed.
6. Add `docs/financing_tranches.md` (this file) to the canonical references in `docs/methodology.md`.
7. Update `data/precedents.json` records to use the same tranche vocabulary so `comparable_projects` matching is apples-to-apples.

Acceptance: `scripts/validate-all.js` passes; the five anchor assets render unchanged in the UI at the four-bucket level; new tranche detail is exposed in `asset.html` under a "show full capital stack" expander; `data/financing_templates.json` is referenced from at least one anchor asset.

---

*Source brief: brainstorm of 2026-05-14 with Sam. Anchor sources: `RDNA3`, `EU_FACILITY`, `EBRD_CASE`, `MIGA`, `EIB_UA`.*

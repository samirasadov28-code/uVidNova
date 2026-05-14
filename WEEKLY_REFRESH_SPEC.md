# WEEKLY_REFRESH_SPEC.md — uVidNova Module B

**Workstream:** Module B — Weekly Automated Refresh (post-v1)
**Trigger to start work:** Weekend 6 (v1 launch) complete.
**Status:** Specification. To be executed by Claude Code as a follow-on engagement after v1 ships.

This spec is the operational embodiment of the four GDELT use cases discussed during planning: re-damage detection, source discovery, pipeline expansion, and precedent mining. All four are delivered by a single weekly job that produces human-reviewed pull requests against the v1 register.

Read this **after** reading `CLAUDE.md` in full. Everything in CLAUDE.md still applies. This spec extends it.

---

## 1. Goal and non-goals

**Goal.** A weekly automated job that:

1. Surfaces new strikes on existing assets (re-damage detection).
2. Surfaces lifecycle progression events on existing assets (documented → assessed → in pipeline → funded → under reconstruction → complete).
3. Surfaces candidate new assets not yet in the register (pipeline expansion).
4. Surfaces candidate new financing precedents for `data/precedents.json` (precedent mining).
5. Performs source freshness checks on existing evidence URLs.

All five outputs land in a single weekly pull request against `main`. **Nothing auto-merges.** The publication chain is: automated detection → LLM classification + validation gate → proposed diff → human review → manual merge → Netlify auto-deploy.

**Non-goals.**
- Real-time alerts, push notifications, or anything more frequent than weekly.
- Auto-merge of any change. Even high-confidence detections require human approval.
- Any update to `cost_paths.*` or `financing_structures.*`. Those derive from methodology inputs (RDNA3/KSE), which change at quarterly cadence at most and via a separate process.
- Any update to editorial copy on `about.html` or in `docs/`.
- LLM-generated numeric output of any kind. Same anti-hallucination rules as the v1 orchestrator (§7 of CLAUDE.md).

---

## 2. Architecture overview

```
GitHub Actions (cron: 0 6 * * 1)   ← Monday 06:00 UTC
        │
        ▼
scripts/weekly-refresh.js
        │
        ├─► Source connectors:
        │     - GDELT 2.0 (BigQuery via google-auth-library)
        │     - Bellingcat (API or RSS feed scraping)
        │     - OCHA Ukraine flash updates (RSS)
        │     - DREAM / eRecovery (if API or export available)
        │     - EBRD / EIB / EU Ukraine Facility press release RSS
        │
        ├─► Per-asset candidate detection
        ├─► functions/classify.js  (Stage-1 LLM classifier, Temperature 0.2)
        ├─► functions/lib/validation-gate.js  (mandatory)
        ├─► Diff generation against /data/assets/*.json and /data/precedents.json
        │
        ▼
Draft Pull Request:
   "Weekly refresh: YYYY-MM-DD — N candidate updates"
   Body: per-change Markdown summary + source links
   Files changed: proposed diffs in data/
        │
        ▼
Human review (Sam)
        │
        ▼
Selective merge → Netlify auto-deploy
```

No new infrastructure. GitHub Actions is the runner. The repo is the queue. The PR is the review UI. The merge is the publish action.

---

## 3. Source connectors

### 3.1 GDELT 2.0 (primary discovery engine)

**Access:** BigQuery, free public dataset `gdelt-bq.gdeltv2`. Auth via a Google service account; key stored as `GCP_SA_KEY` in repo secrets. Use `@google-cloud/bigquery` (Node SDK).

**Per-asset re-strike query (sketch):**
```sql
SELECT
  GLOBALEVENTID, SQLDATE, EventCode, EventRootCode, GoldsteinScale,
  ActionGeo_Lat, ActionGeo_Long, ActionGeo_FullName, SOURCEURL
FROM `gdelt-bq.gdeltv2.events`
WHERE _PARTITIONTIME BETWEEN
        TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        AND CURRENT_TIMESTAMP()
  AND ActionGeo_CountryCode = 'UP'   -- Ukraine
  AND EventRootCode IN ('18','19','20')  -- assault, fight, mass violence
  AND ST_DISTANCE(
        ST_GEOGPOINT(ActionGeo_Long, ActionGeo_Lat),
        ST_GEOGPOINT(@asset_lon, @asset_lat)
      ) < 2000  -- metres; tunable per asset_type
```

**Pipeline-expansion query:** drop the `ST_DISTANCE` predicate, scan all Ukraine infrastructure-themed events, dedupe against existing assets by coordinate proximity, and surface the top N unmatched clusters as new-asset candidates.

**Precedent-mining query:** GDELT Global Knowledge Graph (`gdelt-bq.gdeltv2.gkg`), filter on themes containing `ECON_RECONSTRUCT`, `INFRA_FINANCE`, or named DFIs (EBRD, EIB, World Bank, IFC, MIGA) in conjunction with Ukraine. Extract the `Amounts` field — GDELT pre-extracts numeric quantities and currencies from articles. Output as precedent candidates with `verification_required: true`.

**Tuning knobs (must be config, not hardcoded):**
- Radius per `asset_type` (district-scale housing needs km; a single building needs hundreds of metres).
- `EventRootCode` whitelist.
- `GoldsteinScale` threshold (more negative = more conflict-intense).
- Source-URL deduplication window.

Store all knobs in `config/weekly-refresh.json`, version-controlled.

### 3.2 Bellingcat / Centre for Information Resilience

Use their public Ukraine incident feed (API or RSS, whichever is currently exposed). Bellingcat is the highest-fidelity verified source — when it confirms an incident GDELT also picked up, confidence on the candidate goes up. When Bellingcat confirms an incident GDELT missed, that incident still enters the queue.

### 3.3 OCHA Ukraine flash updates

RSS or HTML scrape. Used primarily for lifecycle and humanitarian-context signals.

### 3.4 DREAM / eRecovery

Government of Ukraine reconstruction platform. Check for a public API, RSS, or downloadable CSV/JSON exports. If none exists, this connector ships disabled with a `TODO` note; do not scrape behind auth.

### 3.5 DFI press release RSS

EBRD, EIB, EU Ukraine Facility, World Bank Ukraine country page, MIGA. RSS or HTML scrape. Filter for project-financing announcements that name a Ukrainian asset or sector. Drives lifecycle progression candidates (e.g. "Asset X moved from `assessed` to `funded` per EBRD board approval YYYY-MM-DD") and precedent candidates.

---

## 4. Classifier — LLM role and discipline

The LLM is invoked exactly as in v1 §7: classifier and narrator, never estimator.

**Input per candidate event.** Source-URL, source-text excerpt (≤2000 tokens), event metadata from the connector, the current `data/assets/<asset_id>.json` for any candidate target, and the full `data/taxonomy.json`.

**Output (structured, JSON only).** One of five kinds:

```jsonc
{
  "kind": "re_strike",
  "target_asset_id": "TRYPILSKA_TPP_2024_04_11",
  "proposed_change": {
    "damage.re_damage_count": { "from": 2, "to": 3 },
    "damage.evidence_sources[]": "<append>",
    "damage.last_incident_date": "2026-05-09"
  },
  "evidence_urls": ["https://...", "https://..."],
  "confidence": "high|medium|low",
  "narrative": "Trypilska TPP reported struck on 2026-05-09 in coverage from [Source A] and [Source B]. Coordinates match within 800m. No conflicting reports in same date window."
}
```

```jsonc
{ "kind": "lifecycle_progress", "target_asset_id": "...", "proposed_change": { "wartime_status.lifecycle": { "from": "assessed", "to": "in_pipeline" } }, ... }
```

```jsonc
{ "kind": "new_asset_candidate", "proposed_scaffold": { /* output of scripts/new-asset.js applied to the candidate */ }, "evidence_urls": [...], "narrative": "..." }
```

```jsonc
{ "kind": "new_precedent", "proposed_record": { /* matches schemas/precedent.schema.json with verification_required: true */ }, ... }
```

```jsonc
{ "kind": "source_refresh", "target_asset_id": "...", "stale_url": "https://...", "replacement_candidate_url": "https://..." }
```

**System prompt** lives at `functions/_shared/prompts/weekly-classify.md`. It must:
- Pin the LLM to the five-kind output schema.
- Forbid the LLM from inventing dates, counts, or coordinates not present in the input.
- Instruct it to return `confidence: low` and `narrative: "insufficient evidence"` rather than guessing when sources conflict or are thin.

**Temperature 0.2. JSON-only output. Retry once on schema validation failure, then drop to human-review queue.**

**Validation gate (mandatory, identical to v1).** `functions/lib/validation-gate.js` extracts every numeric token from `narrative` and `proposed_change` and traces each back to either (a) the input source-text excerpt, (b) the existing asset record, or (c) the connector event metadata. Any unmatched number aborts that candidate and posts a `BLOCKED — unmatched numerics: [tokens]` entry to the PR for manual triage.

---

## 5. PR generation

`scripts/weekly-refresh.js` finishes by:

1. Writing all approved candidates' diffs to a `weekly-refresh/<date>` branch.
2. Generating a `WEEKLY_REFRESH_REPORT.md` at repo root (overwritten each run) summarising:
   - Total candidates surfaced, total passed validation gate, total blocked.
   - Per-kind counts.
   - Per-asset change summary with source links.
   - Per-blocked candidate, the reason (validation gate failure, conflicting sources, etc.).
3. Opening a draft PR via the GitHub REST API (auth via `GITHUB_TOKEN` provided to Actions).

**PR title format:** `Weekly refresh: YYYY-MM-DD — N candidates (R re-strikes, L lifecycle, A new assets, P precedents, S source refreshes)`.

**PR body template:**

```markdown
## Summary
- Run window: YYYY-MM-DD to YYYY-MM-DD (7 days)
- Candidates surfaced: N (passed gate: M, blocked: K)
- High-confidence: X | Medium: Y | Low: Z

## Re-strike candidates
- **TRYPILSKA_TPP_2024_04_11** — re_damage_count 2 → 3. Confidence: high.
  - [Kyiv Independent, 2026-05-09](https://...)
  - [Reuters, 2026-05-10](https://...)
  - GDELT event id: 1234567890

## Lifecycle progression candidates
...

## New asset candidates
...

## New precedent candidates
...

## Blocked (require manual triage)
- GDELT event 0987654321 near Kharkiv (50.0123, 36.2345) — could not match to existing asset; LLM returned `new_asset_candidate` but validation gate blocked on unmatched numeric "USD 14.2m" in narrative (not present in source excerpt). Recommend manual review of [source URL].
```

Sam reviews, cherry-picks files into a merge commit (or closes the PR if the week's run is junk), Netlify deploys.

---

## 6. Configuration files this workstream introduces

```
config/
  weekly-refresh.json     ← all tuning knobs (radii, thresholds, connector enable/disable)
  connectors.json         ← per-connector credentials reference (env var names only)
data/
  precedents.json         ← already in v1, gains the verification_required field
functions/_shared/prompts/
  weekly-classify.md      ← system prompt for classifier
scripts/
  weekly-refresh.js       ← orchestrator entry point
  connectors/
    gdelt.js
    bellingcat.js
    ocha.js
    dream.js              ← stubbed if no public access
    dfi-press.js
  lib/
    candidate-detector.js ← geo + thematic candidate logic
    pr-builder.js         ← opens the draft PR via GitHub API
.github/workflows/
  weekly-refresh.yml      ← cron schedule, secrets binding, runs scripts/weekly-refresh.js
```

---

## 7. Schemas this workstream extends

- `schemas/precedent.schema.json` gains an optional `verification_required: boolean` field, defaulting `false`. Set `true` by the precedent connector; cleared manually after verification.
- `schemas/asset.schema.json` gains an optional `damage.last_incident_date: date` field for re-strike tracking, distinct from `damage.incident_date` (the first incident).
- New schema `schemas/weekly-candidate.schema.json` for the LLM classifier output, used in tests and for runtime validation.

---

## 8. Failure modes and how to handle each

| Failure mode | Detection | Handling |
|---|---|---|
| GDELT BigQuery quota exceeded | API error in connector | Job retries with exponential backoff (max 3); on persistent failure, posts a "skipped run" issue and exits non-zero |
| Bellingcat / OCHA feed offline | Connector returns empty + non-200 | Logs warning; other connectors continue; PR notes "Bellingcat unavailable this week" |
| LLM hallucinates a date / number | Validation gate | Candidate moves to BLOCKED section of PR with explanation |
| LLM produces invalid JSON | Schema validation after parse | One retry, then BLOCKED |
| Source URL no longer reachable (in source refresh check) | HTTP HEAD non-200 | Flagged in PR as candidate for evidence refresh |
| Candidate duplicates an event already merged in a previous week | Hash-based dedup against a `data/.refresh-history.json` ledger | Dropped silently before LLM call |
| GitHub API rate-limit on PR creation | API error | Fall back to writing the report as an artifact and posting an issue |

---

## 9. Frontend visibility of the weekly cadence (optional, v1.1)

Two low-cost UI additions that signal the maintenance discipline to investor-grade analysts:

1. **Footer:** `Last refreshed: 2026-05-11 (commit abc123)`. Pulled from the most recent commit date on `main` touching `data/assets/`. No API call — built at deploy time and embedded in `index.html`.
2. **Homepage panel:** "Recent updates" — last 5 merged changes with date, asset name, and kind (re-strike, lifecycle, etc.). Generated by `scripts/build-recent-updates.js` from git log at deploy time.

Both are optional, ship after the first three or four weekly refreshes have run successfully and the workflow is stable.

---

## 10. Acceptance criteria for Module B

Module B is considered shipped when:

1. `weekly-refresh.yml` runs on schedule and on `workflow_dispatch`.
2. Three consecutive weekly runs have produced PRs that Sam was able to triage in ≤90 minutes total (the rough efficiency budget).
3. Zero unverified numbers have entered `data/assets/` or `data/precedents.json` via the weekly path.
4. The validation gate has caught at least one injected hallucination in the adversarial test suite (extend `tests/hallucination-cases.md` with weekly-refresh-specific cases).
5. False-positive rate on re-strike candidates is bounded — if more than 80% of high-confidence candidates are rejected on review, tighten the GDELT radius and Goldstein threshold before continuing.

---

## 11. Order of operations for Claude Code

Do these in order. Open one PR per numbered step.

1. Extend schemas: `damage.last_incident_date`, `precedent.verification_required`, and new `weekly-candidate.schema.json`. Update `scripts/validate-all.js`.
2. Create `config/weekly-refresh.json` with sensible defaults; document every knob in a header comment.
3. Build connectors in this order, each with a `--dry-run` mode that prints what it would output without making API calls: `gdelt.js`, `bellingcat.js`, `ocha.js`, `dfi-press.js`. `dream.js` stubbed.
4. Build `lib/candidate-detector.js` (geo + thematic dedup, hash ledger against `data/.refresh-history.json`).
5. Build the LLM classifier integration in `scripts/weekly-refresh.js`, reusing `functions/classify.js` and `functions/lib/validation-gate.js`.
6. Write `functions/_shared/prompts/weekly-classify.md`.
7. Build `lib/pr-builder.js` (drafts the PR via the GitHub REST API).
8. Wire `.github/workflows/weekly-refresh.yml`. Schedule plus `workflow_dispatch` for manual triggers.
9. Extend `tests/hallucination-cases.md` with weekly-specific adversarial cases. Run them end-to-end with the full pipeline.
10. Trigger one manual run, review the PR with Sam, iterate on radius / threshold tuning, document final values in `docs/methodology.md` (new subsection: "Module B operating parameters").

---

## 12. Things to NOT do (Module B-specific additions to CLAUDE.md §13)

- Do not promote any weekly-refresh output directly to the published register. Always via PR + human merge.
- Do not let the LLM increment, decrement, derive, or invent any number. Numerics flow from connectors and source text only.
- Do not raise the cadence above weekly without an explicit decision from Sam. The platform is a register, not a wire.
- Do not add a "live feed" widget, an alert subscription, or anything that pushes weekly updates to users. The footer date and the optional recent-updates panel are the only acceptable surfacings.
- Do not query non-public sources or scrape behind auth. If a connector needs auth, ship it disabled until access is properly licensed.

---

*Specification version 1.0. Last updated: 2026-05-14. Author: Samir Asadov.*

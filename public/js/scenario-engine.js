/**
 * scenario-engine.js — Pure deterministic scenario computation.
 * No side effects; all inputs explicit. Numbers come from lookups, never from AI.
 */

// ── Wartime adjustment ────────────────────────────────────────────────────────

/**
 * Apply wartime compression rules to a financing_structures path object.
 * Returns a new path object with compressed commercial tranches redistributed.
 *
 * @param {Object} pathObj  - e.g. { grant_pct, concessional_pct, commercial_bank_debt_pct, … }
 * @param {string} peaceState - 'pre_armistice' | 'post_armistice_fragile' | 'post_armistice_durable'
 * @param {Object} rules    - parsed wartime_adjustment_rules.json
 * @returns {Object} adjusted path object + tranches_compressed[]
 */
export function applyWartimeAdjustment(pathObj, peaceState, rules) {
  if (peaceState === 'post_armistice_durable') {
    return { ...pathObj, tranches_compressed: [] };
  }

  const rule = rules['FOUNDATIONAL_WARTIME_RULE_A'];
  if (!rule) return { ...pathObj, tranches_compressed: [] };

  const transformKey = peaceState === 'pre_armistice'
    ? 'transformations_pre_armistice'
    : 'transformations_post_armistice_fragile';

  const transforms = rule[transformKey] ?? [];
  const out = { ...pathObj };
  const compressed = [];

  for (const t of transforms) {
    const orig = +(out[t.from] ?? 0);
    if (orig === 0) continue;
    const retained = orig * t.retain_fraction;
    const remainder = orig - retained;

    out[t.from] = retained;
    compressed.push({ field: t.from, original: orig, retained, remainder });

    if (t.remainder_to) {
      out[t.remainder_to] = (+(out[t.remainder_to] ?? 0)) + remainder * (t.remainder_fraction ?? 1);
    }
    if (t.remainder_to_a) {
      out[t.remainder_to_a] = (+(out[t.remainder_to_a] ?? 0)) + remainder * t.remainder_fraction_a;
    }
    if (t.remainder_to_b) {
      out[t.remainder_to_b] = (+(out[t.remainder_to_b] ?? 0)) + remainder * t.remainder_fraction_b;
    }
  }

  return { ...out, tranches_compressed: compressed };
}

// ── EU accession adjustment ───────────────────────────────────────────────────

/**
 * Apply EU accession multipliers to a tranche envelope entry's capacity numbers.
 * Returns adjusted { central, low, high } object (values in USD bn).
 *
 * @param {Object} envelopeEntry - one tranche from funding_envelope.json tranches[]
 * @param {string} accessionState - 'stalled' | 'on_track' | 'accelerated'
 * @param {Object} adjustments   - funding_envelope.json eu_accession_adjustments
 * @returns {{ low_usd_bn, central_usd_bn, high_usd_bn }}
 */
export function applyAccessionAdjustment(envelopeEntry, accessionState, adjustments) {
  const adj = adjustments[accessionState] ?? adjustments['on_track'];

  const multiplierFor = (field) => {
    if (field === 'grant_pct')            return adj.grant_multiplier         ?? 1;
    if (field === 'senior_ifi_pct')       return adj.senior_ifi_multiplier    ?? 1;
    if (field === 'institutional_debt_pct') return adj.institutional_debt_multiplier ?? 1;
    return 1;
  };

  const m = multiplierFor(envelopeEntry.field);

  const pick = (state) => {
    if (envelopeEntry.pre_armistice && state === 'pre') return envelopeEntry.pre_armistice;
    if (envelopeEntry.post_armistice && state === 'post') return envelopeEntry.post_armistice;
    return null;
  };

  const base = pick('pre') ?? {};
  return {
    low_usd_bn:     (base.low_usd_bn     ?? 0) * m,
    central_usd_bn: (base.central_usd_bn ?? 0) * m,
    high_usd_bn:    (base.high_usd_bn    ?? 0) * m,
  };
}

// ── Per-asset addressable capacity ────────────────────────────────────────────

/**
 * For a single asset and path, compute addressable capital under a scenario.
 *
 * Logic: the asset's cost_path gives the required amount. We then look at
 * the asset's financing_structures[path] (if present) or fall back to the
 * funding_envelope totals pro-rated by tranche to estimate what fraction
 * can actually be sourced under the current scenario.
 *
 * Simplified model: sum the pre_armistice tranche capacities from
 * funding_envelope for the relevant peace state, apply the wartime
 * compression to the asset's financing structure, then cap addressable
 * at the minimum of (available envelope capacity × weight) and required.
 *
 * @param {Object} asset
 * @param {string} path - 'baseline' | 'code_compliant' | 'build_back_better'
 * @param {{ peace_state, eu_accession, frozen_assets }} scenario
 * @param {Object} fundingEnvelope - parsed funding_envelope.json
 * @param {Object} wartimeRules    - parsed wartime_adjustment_rules.json
 * @returns {{ required_usd_m, addressable_usd_m, gap_usd_m, tranches_compressed[] }}
 */
export function computeAssetAddressableCapacity(asset, path, scenario, fundingEnvelope, wartimeRules) {
  const costPath = asset.cost_paths?.[path];
  if (!costPath) return { required_usd_m: 0, addressable_usd_m: 0, gap_usd_m: 0, tranches_compressed: [] };

  const required_usd_m = costPath.central_usd_m ?? 0;

  const structPath = asset.financing_structures?.[path];
  let finStruct = structPath
    ? { ...structPath }
    : { grant_pct: 40, concessional_pct: 35, public_equity_pct: 25, private_pct: 0 };

  const adjusted = applyWartimeAdjustment(finStruct, scenario.peace_state, wartimeRules);
  const { tranches_compressed } = adjusted;

  // Total available envelope under current peace state (USD bn → USD m)
  const peaceKey = scenario.peace_state === 'post_armistice_durable' ? 'post_armistice'
                 : scenario.peace_state === 'post_armistice_fragile'  ? 'post_armistice'
                 : 'pre_armistice';

  const accAdj = fundingEnvelope.eu_accession_adjustments ?? {};

  // Sum the envelope capacity for key public tranches
  let totalEnvelopeM = 0;
  for (const t of (fundingEnvelope.tranches ?? [])) {
    const base = t[peaceKey];
    if (!base || typeof base !== 'object') continue;

    let central = base.central_usd_bn ?? 0;

    // ERA frozen-assets scenario override
    if (t.code === 'era' && peaceKey === 'post_armistice') {
      const era = base[scenario.frozen_assets] ?? base.proceeds_only ?? {};
      central = era.central_usd_bn ?? 0;
    }

    // EU accession multiplier on affected tranches
    const m = accAdj[scenario.eu_accession]?.[`${
      t.field === 'grant_pct' ? 'grant' :
      t.field === 'senior_ifi_pct' ? 'senior_ifi' :
      t.field === 'institutional_debt_pct' ? 'institutional_debt' : null
    }_multiplier`] ?? 1;

    totalEnvelopeM += central * 1000 * m;
  }

  // Addressable = required × (1 – fraction compressed away / 100)
  const totalCompressed = tranches_compressed.reduce((s, tc) => s + tc.remainder, 0);
  const compressionPct = totalCompressed; // already in pct points
  const retentionRatio = Math.max(0, (100 - compressionPct) / 100);
  const addressable_usd_m = Math.min(required_usd_m, required_usd_m * retentionRatio);

  return {
    required_usd_m,
    addressable_usd_m: Math.round(addressable_usd_m * 10) / 10,
    gap_usd_m: Math.round((required_usd_m - addressable_usd_m) * 10) / 10,
    tranches_compressed,
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/**
 * Aggregate addressable capacity across assets, grouped by oblast or sector.
 *
 * @param {Object[]} assets
 * @param {string} path
 * @param {Object} scenario
 * @param {Object} fundingEnvelope
 * @param {Object} wartimeRules
 * @param {'oblast'|'sector'} groupBy
 * @returns {Array<{ key, required_usd_m, addressable_usd_m, gap_usd_m, asset_count }>}
 */
export function aggregateCapacity(assets, path, scenario, fundingEnvelope, wartimeRules, groupBy) {
  const map = new Map();

  for (const asset of assets) {
    const key = groupBy === 'oblast'
      ? (asset.location?.oblast ?? 'Unknown')
      : (asset.sector ?? 'Unknown');

    const cap = computeAssetAddressableCapacity(asset, path, scenario, fundingEnvelope, wartimeRules);

    if (!map.has(key)) {
      map.set(key, { key, required_usd_m: 0, addressable_usd_m: 0, gap_usd_m: 0, asset_count: 0 });
    }
    const row = map.get(key);
    row.required_usd_m    += cap.required_usd_m;
    row.addressable_usd_m += cap.addressable_usd_m;
    row.gap_usd_m         += cap.gap_usd_m;
    row.asset_count       += 1;
  }

  return [...map.values()]
    .map(r => ({
      ...r,
      required_usd_m:    Math.round(r.required_usd_m * 10) / 10,
      addressable_usd_m: Math.round(r.addressable_usd_m * 10) / 10,
      gap_usd_m:         Math.round(r.gap_usd_m * 10) / 10,
    }))
    .sort((a, b) => b.gap_usd_m - a.gap_usd_m);
}

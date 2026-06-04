/**
 * Loads asset data from /data/assets/.
 * loadAssetsForMap()  — returns slim summary objects from index.json (1 request).
 * loadAsset(id)       — returns full asset record on demand (1 request per call).
 * loadAllAssets()     — legacy: fetches every full asset file (100 requests, kept for finance-wizard).
 */

const BASE = '';

export async function loadAssetsIndex() {
  const res = await fetch(`${BASE}/data/assets/index.json`);
  if (!res.ok) throw new Error(`Failed to load assets index: ${res.status}`);
  const raw = await res.json();
  // index.json is a flat array of full asset objects
  return Array.isArray(raw) ? raw : (raw.assets ?? []);
}

/**
 * Returns asset objects shaped for map display, popups, filters, and
 * aggregation — no individual asset fetches needed.
 * Full record is loaded lazily via loadAsset(id) when detail/finance is needed.
 */
export async function loadAssetsForMap() {
  const index = await loadAssetsIndex();
  return index.map(item => {
    // index.json contains full asset objects with nested structure
    const cp = item.cost_paths ?? {};
    const baseline = cp.baseline ?? null;
    const cc       = cp.code_compliant ?? null;
    const bbb      = cp.build_back_better ?? null;
    const baselineFs = item.financing_structures?.baseline ?? {};
    const financingClass =
      baselineFs._financing_class ??
      ((baselineFs.grant_pct ?? 0) >= 50 ? 'grant_led' : 'mixed');

    return {
      asset_id: item.asset_id,
      name: {
        en: item.name?.en ?? item.asset_id,
        uk: item.name?.uk ?? item.name?.en ?? item.asset_id,
      },
      location: {
        lat:    item.location?.lat,
        lon:    item.location?.lon,
        oblast: item.location?.oblast ?? '',
      },
      sector: item.sector,
      wartime_status: {
        lifecycle:      item.wartime_status?.lifecycle,
        rebuildability: item.wartime_status?.rebuildability,
      },
      damage: {
        destruction_level: item.damage?.destruction_level,
        re_damage_count:   item.damage?.re_damage_count ?? 0,
      },
      cost_paths: {
        pending_methodology: cp.pending_methodology ?? false,
        baseline,
        code_compliant:    cc,
        build_back_better: bbb,
      },
      financing_structures: {
        baseline:          { _financing_class: financingClass },
        code_compliant:    { _financing_class: financingClass },
        build_back_better: { _financing_class: financingClass },
      },
      _slim: true,
    };
  });
}

export async function loadAsset(id) {
  const res = await fetch(`${BASE}/data/assets/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`Failed to load asset ${id}: ${res.status}`);
  return res.json();
}

export async function loadAllAssets() {
  const index = await loadAssetsIndex();
  // index.json is already the full asset objects; no need for individual fetches
  return index;
}

export async function loadOblastsGeoJSON() {
  const res = await fetch(`${BASE}/data/geo/ua_oblasts.geojson`);
  if (!res.ok) throw new Error(`Failed to load oblasts GeoJSON: ${res.status}`);
  return res.json();
}

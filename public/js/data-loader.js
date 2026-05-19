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
  const { assets } = await res.json();
  return assets;
}

/**
 * Returns slim asset objects shaped to match the full schema well enough for
 * map display, popups, filters, and aggregation — no individual asset fetches.
 * Full record is loaded lazily via loadAsset(id) when detail/finance is needed.
 */
export async function loadAssetsForMap() {
  const index = await loadAssetsIndex();
  return index.map(item => {
    function pathObj(low, cen, high) {
      if (low == null && cen == null && high == null) return null;
      return { low_usd_m: low ?? 0, central_usd_m: cen ?? 0, high_usd_m: high ?? 0 };
    }
    return {
      asset_id: item.asset_id,
      name: { en: item.name_en, uk: item.name_uk ?? item.name_en },
      location: {
        lat:    item.lat,
        lon:    item.lon,
        oblast: item.oblast ?? '',
      },
      sector: item.sector,
      wartime_status: {
        lifecycle:      item.lifecycle,
        rebuildability: item.rebuildability,
      },
      damage: {
        destruction_level: item.destruction_level,
        re_damage_count:   item.re_damage_count ?? 0,
      },
      cost_paths: {
        pending_methodology: item.pending_methodology ?? false,
        baseline:          pathObj(item.cost_baseline_low, item.cost_baseline_cen, item.cost_baseline_high),
        code_compliant:    pathObj(item.cost_cc_low,       item.cost_cc_cen,       item.cost_cc_high),
        build_back_better: pathObj(item.cost_bbb_low,      item.cost_bbb_cen,      item.cost_bbb_high),
      },
      financing_structures: {
        baseline:          { _financing_class: item.financing_class },
        code_compliant:    { _financing_class: item.financing_class },
        build_back_better: { _financing_class: item.financing_class },
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
  const ids = index.map(item => (typeof item === 'string' ? item : item.asset_id));
  const assets = await Promise.all(ids.map(id => loadAsset(id)));
  return assets;
}

export async function loadOblastsGeoJSON() {
  const res = await fetch(`${BASE}/data/geo/ua_oblasts.geojson`);
  if (!res.ok) throw new Error(`Failed to load oblasts GeoJSON: ${res.status}`);
  return res.json();
}

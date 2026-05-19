/**
 * Loads asset data from /data/assets/.
 * Fetches the index, then each individual asset file.
 */

const BASE = '';

export async function loadAssetsIndex() {
  const res = await fetch(`${BASE}/data/assets/index.json`);
  if (!res.ok) throw new Error(`Failed to load assets index: ${res.status}`);
  const { assets } = await res.json();
  return assets;
}

export async function loadAsset(id) {
  const res = await fetch(`${BASE}/data/assets/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`Failed to load asset ${id}: ${res.status}`);
  return res.json();
}

export async function loadAllAssets() {
  const index = await loadAssetsIndex();
  // Support both legacy string-ID arrays and the current object-summary format
  const ids = index.map(item => (typeof item === 'string' ? item : item.asset_id));
  const assets = await Promise.all(ids.map(id => loadAsset(id)));
  return assets;
}

export async function loadOblastsGeoJSON() {
  const res = await fetch(`${BASE}/data/geo/ua_oblasts.geojson`);
  if (!res.ok) throw new Error(`Failed to load oblasts GeoJSON: ${res.status}`);
  return res.json();
}

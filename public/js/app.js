/**
 * app.js — Map view bootstrap.
 * Initialises Leaflet, loads Ukraine oblast GeoJSON, plots asset pins.
 * Clicking a pin navigates to asset.html?id=<asset_id>.
 */

import { loadAllAssets, loadOblastsGeoJSON } from './data-loader.js';
import {
  matchesFilters, initSectorFilter, initToggleChips,
  SECTOR_LABELS, getActiveFilters, state as filterState
} from './filters.js';

// ── Marker configuration ───────────────────────────────────────────────────────

const SECTOR_COLOURS = {
  energy_and_power:         '#e67e22',
  healthcare:               '#e74c3c',
  education:                '#3498db',
  residential:              '#95a5a6',
  heritage_and_culture:     '#9b59b6',
  transport_and_ports:      '#1abc9c',
  water_and_sanitation:     '#2980b9',
  industrial_and_agricultural: '#7f8c8d',
  public_administration:    '#34495e'
};

const REBUILDABILITY_OPACITY = {
  rebuildable:        1.0,
  recently_liberated: 0.85,
  frontline_adjacent: 0.65,
  occupied:           0.45
};

function makeIcon(asset) {
  const colour = SECTOR_COLOURS[asset.sector] ?? '#555';
  const opacity = REBUILDABILITY_OPACITY[asset.wartime_status?.rebuildability] ?? 1;
  const reFlag = (asset.damage?.re_damage_count ?? 0) >= 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
          fill="${colour}" fill-opacity="${opacity}" stroke="#fff" stroke-width="1.5"/>
    ${reFlag ? '<circle cx="18" cy="4" r="5" fill="#e74c3c" stroke="#fff" stroke-width="1"/>' : ''}
  </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36]
  });
}

// ── Popup content ─────────────────────────────────────────────────────────────

function makePopupHTML(asset) {
  const name = asset.name?.en ?? asset.asset_id;
  const sector = SECTOR_LABELS[asset.sector] ?? asset.sector;
  const level = asset.damage?.destruction_level ?? '—';
  const lifecycle = asset.wartime_status?.lifecycle ?? '—';
  const rebuildability = asset.wartime_status?.rebuildability ?? '—';
  const central = asset.cost_paths?.baseline?.central_usd_m;
  const pending = asset.cost_paths?.pending_methodology;
  const reCount = asset.damage?.re_damage_count ?? 0;

  const costLine = pending
    ? `<span class="popup-pending">Cost estimate pending methodology (Weekend 2)</span>`
    : `<span class="popup-cost">Baseline: USD ${central}M central</span>`;

  const reLine = reCount >= 2
    ? `<span class="popup-redamage" title="Re-damaged ${reCount} time(s) — material investor-information field">⚠ Re-damaged ×${reCount}</span>`
    : '';

  return `
    <div class="popup-inner">
      <h3 class="popup-name">${name}</h3>
      <div class="popup-meta">
        <span class="popup-sector">${sector}</span>
        <span class="popup-level ${level}">${level}</span>
      </div>
      ${reLine}
      <div class="popup-status">
        <span>${lifecycle}</span> · <span>${rebuildability}</span>
      </div>
      ${costLine}
      <a href="/asset.html?id=${encodeURIComponent(asset.asset_id)}" class="popup-link">
        Full financing profile →
      </a>
    </div>`;
}

// ── Map initialisation ────────────────────────────────────────────────────────

const map = L.map('map', {
  center: [48.4, 31.5],
  zoom: 6,
  zoomControl: true,
  attributionControl: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18
}).addTo(map);

// ── State ─────────────────────────────────────────────────────────────────────

let allAssets = [];
const markerMap = new Map();
let oblastLayer = null;

// ── Oblast boundary layer ─────────────────────────────────────────────────────

async function addOblastLayer() {
  try {
    const geojson = await loadOblastsGeoJSON();
    oblastLayer = L.geoJSON(geojson, {
      style: {
        color: '#1a3a6b',
        weight: 1,
        fillColor: '#cdd9f0',
        fillOpacity: 0.15
      },
      onEachFeature(feature, layer) {
        const name = feature.properties?.name ?? '';
        if (name) layer.bindTooltip(name, { permanent: false, sticky: true, className: 'oblast-tooltip' });
      }
    }).addTo(map);
    oblastLayer.bringToBack();
  } catch (e) {
    console.warn('Oblast GeoJSON failed to load:', e.message);
  }
}

// ── Marker layer ──────────────────────────────────────────────────────────────

function renderMarkers() {
  for (const [id, marker] of markerMap) {
    map.removeLayer(marker);
  }
  markerMap.clear();

  const visible = allAssets.filter(matchesFilters);

  for (const asset of visible) {
    const { lat, lon } = asset.location;
    if (!lat || !lon) continue;

    const marker = L.marker([lat, lon], { icon: makeIcon(asset) })
      .bindPopup(makePopupHTML(asset), { maxWidth: 280, className: 'asset-popup' });

    marker.on('click', () => {
      map.setView([lat, lon], Math.max(map.getZoom(), 8));
    });

    marker.addTo(map);
    markerMap.set(asset.asset_id, marker);
  }

  updateAssetCount(visible.length);
  renderAssetList(visible);
}

// ── Asset list panel ──────────────────────────────────────────────────────────

function renderAssetList(assets) {
  const list = document.getElementById('assetList');
  if (!list) return;

  list.innerHTML = '';
  for (const asset of assets) {
    const item = document.createElement('a');
    item.className = 'asset-list-item';
    item.href = `/asset.html?id=${encodeURIComponent(asset.asset_id)}`;

    const name = asset.name?.en ?? asset.asset_id;
    const sector = SECTOR_LABELS[asset.sector] ?? asset.sector;
    const level = asset.damage?.destruction_level ?? '—';
    const colour = SECTOR_COLOURS[asset.sector] ?? '#555';
    const reCount = asset.damage?.re_damage_count ?? 0;

    item.innerHTML = `
      <span class="ali-dot" style="background:${colour}"></span>
      <span class="ali-body">
        <span class="ali-name">${name}</span>
        <span class="ali-meta">${sector} · ${level}${reCount >= 2 ? ' · ⚠ re-damaged' : ''}</span>
      </span>`;

    item.addEventListener('click', e => {
      // On small screens, let the link navigate. On large screens, also fly to pin.
      const marker = markerMap.get(asset.asset_id);
      if (marker && window.innerWidth >= 900) {
        e.preventDefault();
        map.setView([asset.location.lat, asset.location.lon], 9);
        marker.openPopup();
      }
    });

    list.appendChild(item);
  }
}

function updateAssetCount(n) {
  const el = document.getElementById('assetCount');
  if (el) el.textContent = `${n} asset${n !== 1 ? 's' : ''} shown`;
}

// ── Filter UI ─────────────────────────────────────────────────────────────────

function initFilters() {
  const sectors = [...new Set(allAssets.map(a => a.sector))].sort();
  initSectorFilter(document.getElementById('sectorFilter'), sectors);

  // Rebuildability chips already in HTML — just wire them
  initToggleChips(
    document.getElementById('rebuildabilityFilter'),
    getActiveFilters().rebuildability
  );

  initToggleChips(
    document.getElementById('lifecycleFilter'),
    getActiveFilters().lifecycle
  );

  document.addEventListener('filtersChanged', renderMarkers);
}

// ── Disclaimer ────────────────────────────────────────────────────────────────

function initDisclaimer() {
  const dismissed = sessionStorage.getItem('uvidnova_disclaimer');
  const banner = document.getElementById('disclaimerBanner');
  if (dismissed && banner) {
    banner.hidden = true;
    return;
  }
  document.getElementById('dismissDisclaimer')?.addEventListener('click', () => {
    sessionStorage.setItem('uvidnova_disclaimer', '1');
    if (banner) banner.hidden = true;
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  initDisclaimer();

  try {
    const [assets] = await Promise.all([
      loadAllAssets(),
      addOblastLayer()
    ]);

    allAssets = assets;
    initFilters();
    renderMarkers();

    // Fit map to asset bounds if any
    if (assets.length > 0) {
      const latlngs = assets
        .filter(a => a.location?.lat && a.location?.lon)
        .map(a => [a.location.lat, a.location.lon]);
      if (latlngs.length > 0) {
        map.fitBounds(L.latLngBounds(latlngs).pad(0.4));
      }
    }
  } catch (err) {
    console.error('uVidNova init error:', err);
    document.getElementById('map').insertAdjacentHTML('afterend',
      `<p class="load-error">Failed to load asset data: ${err.message}</p>`);
  }
}

init();

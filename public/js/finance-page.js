/**
 * finance-page.js — Finance It dedicated page bootstrap.
 * Initialises the map, loads assets, wires the wizard trigger.
 */

import { loadAllAssets, loadOblastsGeoJSON } from './data-loader.js';
import { openFinanceWizard } from './finance-wizard.js';

const OCCUPIED_OBLASTS         = new Set(['Crimea', 'Luhansk']);
const PARTIALLY_OCCUPIED_OBLASTS = new Set(['Donetsk', 'Zaporizhzhia', 'Kherson']);

// Finance page uses the dark-navy / gold palette
const PALETTE = { border: '#c9a227', fill: '#0d2b5e', crimeaFill: '#060e22', bg: '#040e24' };

let map   = null;
let assets = [];

function oblastStyle(feature) {
  const name     = feature.properties?.name ?? '';
  const isCrimea = name === 'Crimea';
  return {
    color:       PALETTE.border,
    weight:      1.5,
    fillColor:   isCrimea ? PALETTE.crimeaFill : PALETTE.fill,
    fillOpacity: isCrimea ? 0.55 : 0.68,
    dashArray:   isCrimea ? '6,4' : null,
  };
}

async function addOblastLayer() {
  try {
    const geojson = await loadOblastsGeoJSON();
    const layer = L.geoJSON(geojson, {
      style: oblastStyle,
      onEachFeature(feature, lyr) {
        const name     = feature.properties?.name ?? '';
        const isCrimea = name === 'Crimea';
        const tip      = isCrimea ? 'Crimea (temporarily occupied — UA territory)' : name;
        if (name) lyr.bindTooltip(tip, { permanent: false, sticky: true, className: 'oblast-tooltip' });
        lyr.on('mouseover', function () { this.setStyle({ fillOpacity: 0.88, weight: 2.5 }); });
        lyr.on('mouseout',  function () { layer.resetStyle(this); });
      }
    }).addTo(map);
    layer.bringToBack();
  } catch { /* non-critical */ }
}

function renderHeroCard() {
  const card = document.getElementById('financeHero');
  if (!card) return;
  card.hidden = false;
}

async function init() {
  // Set map background
  const mapEl    = document.getElementById('map');
  const layoutEl = document.querySelector('.map-layout');
  if (mapEl)    mapEl.style.background    = PALETTE.bg;
  if (layoutEl) layoutEl.style.background = PALETTE.bg;

  map = L.map('map', {
    center:             [48.8, 31.5],
    zoom:               6,
    minZoom:            5,
    maxZoom:            12,
    zoomControl:        true,
    attributionControl: false,
    maxBounds:          [[43.5, 21.5], [53.5, 40.5]],
    maxBoundsViscosity: 0.85,
  });

  const [loadedAssets] = await Promise.all([loadAllAssets(), addOblastLayer()]);
  assets = loadedAssets;

  renderHeroCard();

  // Update asset count in hero card
  const countEl = document.getElementById('fpAssetCount');
  if (countEl) countEl.textContent = `${assets.length} documented assets · USD ${
    assets.reduce((s, a) => s + (a.cost_paths?.baseline?.central_usd_m ?? 0), 0).toLocaleString()
  }M+ baseline pipeline`;

  // Wire "Begin Analysis" button
  document.getElementById('fpBeginBtn')?.addEventListener('click', () => {
    document.getElementById('financeHero').hidden = true;
    openFinanceWizard(assets, [], () => {
      // Wizard closed — show hero again
      document.getElementById('financeHero').hidden = false;
    });
  });
}

init().catch(err => {
  console.error('Finance page init error:', err);
});

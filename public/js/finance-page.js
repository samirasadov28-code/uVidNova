/**
 * finance-page.js — Finance It dedicated page bootstrap.
 * Initialises the map, loads assets, wires the wizard trigger, scenario toggles, and Capital Gap tab.
 */

import { loadAllAssets, loadOblastsGeoJSON } from './data-loader.js';
import { openFinanceWizard } from './finance-wizard.js';
import { aggregateCapacity } from './scenario-engine.js';

const OCCUPIED_OBLASTS           = new Set(['Crimea', 'Luhansk']);
const PARTIALLY_OCCUPIED_OBLASTS = new Set(['Donetsk', 'Zaporizhzhia', 'Kherson']);

const PALETTE = { border: '#c9a227', fill: '#0d2b5e', crimeaFill: '#060e22', bg: '#040e24' };

// ── Scenario state (module-level; intentionally resets on page load) ──────────

const scenario = {
  peace_state:   'pre_armistice',
  eu_accession:  'stalled',
  frozen_assets: 'proceeds_only',
};

let map        = null;
let assets     = [];
let envelope   = null;
let wtRules    = null;
let activeTab  = 'wizard';
let activeSubTab = 'oblast';

// ── Data loaders ──────────────────────────────────────────────────────────────

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// ── Map ───────────────────────────────────────────────────────────────────────

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

// ── Hero card ─────────────────────────────────────────────────────────────────

function renderHeroCard() {
  const card = document.getElementById('financeHero');
  if (!card) return;
  card.hidden = false;
}

// ── Scenario bar wiring ───────────────────────────────────────────────────────

function wireScenarioBar() {
  document.querySelectorAll('.scenario-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      const value = btn.dataset.value;
      scenario[group] = value;

      document.querySelectorAll(`.scenario-pill[data-group="${group}"]`).forEach(b => {
        b.classList.toggle('active', b.dataset.value === value);
      });

      onScenarioChange();
    });
  });

  document.getElementById('scenarioReset')?.addEventListener('click', () => {
    scenario.peace_state  = 'pre_armistice';
    scenario.eu_accession = 'stalled';
    scenario.frozen_assets = 'proceeds_only';

    document.querySelectorAll('.scenario-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.value === scenario[b.dataset.group]);
    });

    onScenarioChange();
  });
}

function onScenarioChange() {
  if (activeTab === 'gap') renderGapChart();
}

// ── Tab wiring ────────────────────────────────────────────────────────────────

function wireTabs() {
  document.querySelectorAll('.fp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.fp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));

      const hero    = document.getElementById('financeHero');
      const gapPanel = document.getElementById('fpGapPanel');

      if (activeTab === 'wizard') {
        if (hero)     hero.hidden     = false;
        if (gapPanel) gapPanel.hidden = true;
      } else {
        if (hero)     hero.hidden     = true;
        if (gapPanel) gapPanel.hidden = false;
        renderGapChart();
      }
    });
  });

  document.querySelectorAll('.gap-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSubTab = btn.dataset.subtab;
      document.querySelectorAll('.gap-sub-tab').forEach(b => b.classList.toggle('active', b.dataset.subtab === activeSubTab));
      renderGapChart();
    });
  });
}

// ── Capital Gap chart ─────────────────────────────────────────────────────────

const SECTOR_LABELS = {
  energy:              'Energy & Power',
  healthcare:          'Healthcare',
  education:           'Education',
  residential:         'Housing',
  heritage:            'Heritage & Culture',
  transport:           'Transport & Ports',
  water_sanitation:    'Water & Sanitation',
  industrial:          'Industrial & Agri',
  public_administration: 'Public Admin',
};

function getInterpretation(envelope) {
  const cf = envelope?.concentration_finding;
  if (!cf) return '';
  const nf = (cf.near_fully_financeable ?? []).slice(0, 2).join(', ');
  const cc = (cf.capacity_constrained   ?? []).slice(0, 2).join('; ');
  return `Under this scenario, <strong>near-fully financeable</strong> sectors include: ${nf}. Sectors that remain <strong>capacity-constrained</strong>: ${cc}.`;
}

function getSectorFinding(sectorKey, envelope) {
  const cf = envelope?.concentration_finding;
  if (!cf) return '';
  const label = SECTOR_LABELS[sectorKey] ?? sectorKey;
  const allFindings = [
    ...(cf.near_fully_financeable    ?? []).map(f => ({ type: 'near', text: f })),
    ...(cf.conditionally_financeable ?? []).map(f => ({ type: 'cond', text: f })),
    ...(cf.capacity_constrained      ?? []).map(f => ({ type: 'constr', text: f })),
  ];
  const match = allFindings.find(f => f.text.toLowerCase().includes(label.toLowerCase().split(' ')[0]));
  if (!match) return '';
  return match.type === 'near'   ? 'Near-fully financeable' :
         match.type === 'cond'   ? 'Conditionally financeable' :
                                    'Capacity-constrained';
}

function renderGapChart() {
  if (!assets.length || !envelope || !wtRules) return;

  const interp = document.getElementById('gapInterpretation');
  if (interp) interp.innerHTML = getInterpretation(envelope);

  const rows = aggregateCapacity(assets, 'build_back_better', scenario, envelope, wtRules, activeSubTab);

  const wrap = document.getElementById('gapChartWrap');
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.82rem;padding:1rem 0">No asset data available.</p>';
    return;
  }

  const ROW_H    = 36;
  const LABEL_W  = 140;
  const VALUE_W  = 60;
  const PAD      = 12;
  const AXIS_H   = 22;
  const BAR_H    = 11;
  const GAP_ROWS = 4;

  const maxRequired = Math.max(...rows.map(r => r.required_usd_m), 1);
  const W = Math.max(wrap.clientWidth || 500, 320);
  const BAR_W = W - LABEL_W - VALUE_W - PAD * 2;
  const H = rows.length * ROW_H + AXIS_H + PAD;

  const scale = (v) => (v / maxRequired) * BAR_W;

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (maxRequired * i) / tickCount;
    return { v, x: scale(v) };
  });

  const svgRows = rows.map((row, i) => {
    const y = PAD + i * ROW_H + ROW_H / 2;
    const label = activeSubTab === 'sector'
      ? (SECTOR_LABELS[row.key] ?? row.key)
      : row.key;
    const finding = activeSubTab === 'sector' ? getSectorFinding(row.key, envelope) : '';

    const reqW  = scale(row.required_usd_m);
    const adrW  = scale(row.addressable_usd_m);
    const gapPct = row.required_usd_m > 0
      ? Math.round((row.gap_usd_m / row.required_usd_m) * 100)
      : 0;

    const tooltipTitle = `${label}: Required $${row.required_usd_m}M · Addressable $${row.addressable_usd_m}M · Gap $${row.gap_usd_m}M (${gapPct}%) · ${row.asset_count} asset${row.asset_count !== 1 ? 's' : ''}`;

    return `<g class="gap-row" style="cursor:default">
      <title>${tooltipTitle}</title>
      <text class="gap-bar-label" x="${LABEL_W - 6}" y="${y - GAP_ROWS}" text-anchor="end">${label}</text>
      ${finding ? `<text class="gap-sector-finding" x="${LABEL_W - 6}" y="${y + GAP_ROWS + 5}" text-anchor="end" style="font-size:9px;fill:rgba(255,255,255,0.3);font-style:italic">${finding}</text>` : ''}
      <!-- Required bar -->
      <rect x="${LABEL_W}" y="${y - BAR_H - 2}" width="${reqW}" height="${BAR_H}" rx="2" class="gap-bar-req" opacity="0.55">
        <animate attributeName="width" from="0" to="${reqW}" dur="0.4s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>
      </rect>
      <!-- Addressable bar -->
      <rect x="${LABEL_W}" y="${y + 2}" width="${adrW}" height="${BAR_H}" rx="2" class="gap-bar-addr" opacity="0.85">
        <animate attributeName="width" from="0" to="${adrW}" dur="0.4s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/>
      </rect>
      <!-- Gap label -->
      <text class="gap-bar-value" x="${LABEL_W + reqW + 6}" y="${y - GAP_ROWS}"
            style="fill:rgba(255,255,255,0.35)">$${Math.round(row.required_usd_m)}M</text>
      ${row.gap_usd_m > 0 ? `<text class="gap-bar-gap-text" x="${LABEL_W + adrW + 6}" y="${y + GAP_ROWS + 7}"
            style="fill:#e67e22;opacity:0.8">gap $${Math.round(row.gap_usd_m)}M (${gapPct}%)</text>` : ''}
    </g>`;
  }).join('');

  const axisY = PAD + rows.length * ROW_H;
  const axisLine = `<line x1="${LABEL_W}" y1="${axisY}" x2="${LABEL_W + BAR_W}" y2="${axisY}" class="gap-axis-line"/>`;
  const axisLabels = ticks.map(t =>
    `<text class="gap-axis-label" x="${LABEL_W + t.x}" y="${axisY + 15}">${t.v >= 1000 ? (t.v / 1000).toFixed(1) + 'bn' : Math.round(t.v) + 'M'}</text>
     <line x1="${LABEL_W + t.x}" y1="${axisY}" x2="${LABEL_W + t.x}" y2="${axisY + 4}" class="gap-axis-line"/>`
  ).join('');

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
    style="font-family:system-ui,-apple-system,sans-serif;overflow:visible">
    ${svgRows}
    ${axisLine}
    ${axisLabels}
  </svg>`;
}

// ── Main init ─────────────────────────────────────────────────────────────────

async function init() {
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

  const [loadedAssets] = await Promise.all([
    loadAllAssets(),
    addOblastLayer(),
  ]);
  assets = loadedAssets;

  [envelope, wtRules] = await Promise.all([
    loadJSON('/data/funding_envelope.json').catch(() => null),
    loadJSON('/data/wartime_adjustment_rules.json').catch(() => null),
  ]);

  renderHeroCard();

  const countEl = document.getElementById('fpAssetCount');
  if (countEl) countEl.textContent = `${assets.length} documented assets · USD ${
    assets.reduce((s, a) => s + (a.cost_paths?.baseline?.central_usd_m ?? 0), 0).toLocaleString()
  }M+ baseline pipeline`;

  document.getElementById('fpBeginBtn')?.addEventListener('click', () => {
    document.getElementById('financeHero').hidden = true;
    openFinanceWizard(assets, [], () => {
      document.getElementById('financeHero').hidden = false;
    });
  });

  wireScenarioBar();
  wireTabs();
}

init().catch(err => {
  console.error('Finance page init error:', err);
});

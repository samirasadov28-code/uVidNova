/**
 * app.js — Map view bootstrap.
 * Initialises Leaflet, loads Ukraine oblast GeoJSON, plots asset pins.
 * Clicking a pin navigates to asset.html?id=<asset_id>.
 */

import { loadAllAssets, loadOblastsGeoJSON } from './data-loader.js';
import {
  matchesFilters, initSectorFilter, initOblastFilter, initToggleChips,
  initCostBandFilter, initFinancingClassFilter, initReDamageFilter,
  resetAllFilters,
  SECTOR_LABELS, getActiveFilters, state as filterState
} from './filters.js';
import { computeAggregation, renderAggregation } from './aggregation.js';
import { getLang, getName, initLangToggle, applyTranslations, t } from './lang.js';
import { openFinanceWizard } from './finance-wizard.js';

// ── Marker configuration ───────────────────────────────────────────────────────

const SECTOR_COLOURS = {
  energy_and_power:             '#e67e22',
  healthcare:                   '#e74c3c',
  education:                    '#3498db',
  residential:                  '#95a5a6',
  heritage_and_culture:         '#9b59b6',
  transport_and_ports:          '#1abc9c',
  water_and_sanitation:         '#2980b9',
  industrial_and_agricultural:  '#7f8c8d',
  public_administration:        '#34495e'
};

const REBUILDABILITY_OPACITY = {
  rebuildable:        1.0,
  recently_liberated: 0.85,
  frontline_adjacent: 0.65,
  occupied:           0.45
};

function makeIcon(asset) {
  const colour  = SECTOR_COLOURS[asset.sector] ?? '#555';
  const opacity = REBUILDABILITY_OPACITY[asset.wartime_status?.rebuildability] ?? 1;
  const reFlag  = (asset.damage?.re_damage_count ?? 0) >= 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
          fill="${colour}" fill-opacity="${opacity}" stroke="#fff" stroke-width="1.5"/>
    ${reFlag ? '<circle cx="18" cy="4" r="5" fill="#e74c3c" stroke="#fff" stroke-width="1"/>' : ''}
  </svg>`;

  return L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [24, 36],
    iconAnchor:  [12, 36],
    popupAnchor: [0, -36]
  });
}

function makeCompletedIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z"
          fill="#27ae60" stroke="#fff" stroke-width="1.5"/>
    <text x="12" y="16" text-anchor="middle" font-size="10" fill="#fff" font-family="sans-serif">✓</text>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36] });
}

// ── Popup content ─────────────────────────────────────────────────────────────

function fmtUSD(m) {
  if (m == null) return '—';
  return `USD ${m}M`;
}

function makePopupHTML(asset) {
  const name           = getName(asset);
  const sector         = t(`sector.${asset.sector}`) || SECTOR_LABELS[asset.sector] || asset.sector;
  const level          = asset.damage?.destruction_level ?? '—';
  const lifecycle      = asset.wartime_status?.lifecycle ?? '—';
  const rebuildability = asset.wartime_status?.rebuildability ?? '—';
  const central        = asset.cost_paths?.baseline?.central_usd_m;
  const pending        = asset.cost_paths?.pending_methodology;
  const reCount        = asset.damage?.re_damage_count ?? 0;

  const costLine = pending
    ? `<span class="popup-pending">Cost estimate pending methodology</span>`
    : `<span class="popup-cost">Baseline: ${fmtUSD(central)} central</span>`;

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

// ── State ─────────────────────────────────────────────────────────────────────

let map = null;
let allAssets = [];
const markerMap = new Map();
let oblastLayer = null;
let oblastInfoData = null;
let capitalLayer  = null;   // capital city markers (Ukraine view)
let warMode = false;
let warLayer = null;
let mapViewMode = 'damaged';
let selectedOblast = null; // GeoJSON feature name of selected oblast in Damaged view

// Oblasts with significant current occupation (as of 2024-2025)
// Names must match GeoJSON feature names exactly (apostrophe variants from Natural Earth)
const OCCUPIED_OBLASTS = new Set(["Luhans'k"]);
const PARTIALLY_OCCUPIED_OBLASTS = new Set(["Donets'k", 'Zaporizhzhya', 'Kherson']);

// ── Oblast info panel ─────────────────────────────────────────────────────────

// Explicit mapping from GeoJSON feature name → oblasts_info name_en
// Needed because GeoJSON uses short names; oblasts_info uses "Oblast" suffix
const OBLAST_INFO_MAP = {
  'Kyiv Oblast':   'Kyiv Oblast',
  'Kyiv City':     'Kyiv City',
  'Autonomous Republic of Crimea': 'Crimea (Temporarily Occupied)',
  "Donets'k":      'Donetsk Oblast',
  "Luhans'k":      'Luhansk Oblast',
  'Dnipropetrovs\'k': 'Dnipropetrovsk Oblast',
  'Zaporizhzhya':  'Zaporizhzhia Oblast',
  'Kharkiv':       'Kharkiv Oblast',
  "L'viv":         'Lviv Oblast',
  'Odessa':        'Odesa Oblast',
  'Mykolayiv':     'Mykolaiv Oblast',
  'Kherson':       'Kherson Oblast',
  'Transcarpathia':'Zakarpattia Oblast',
  "Khmel'nyts'kyy":'Khmelnytskyi Oblast',
  "Ivano-Frankivs'k":'Ivano-Frankivsk Oblast',
  'Vinnytsya':     'Vinnytsia Oblast',
  'Chernihiv':     'Chernihiv Oblast',
  'Chernivtsi':    'Chernivtsi Oblast',
  'Cherkasy':      'Cherkasy Oblast',
  'Poltava':       'Poltava Oblast',
  'Sumy':          'Sumy Oblast',
  'Zhytomyr':      'Zhytomyr Oblast',
  'Rivne':         'Rivne Oblast',
  'Volyn':         'Volyn Oblast',
  "Ternopil'":     'Ternopil Oblast',
  'Kirovohrad':    'Kirovohrad Oblast',
};

async function loadOblastInfo() {
  try {
    const res = await fetch('/data/oblasts_info.json');
    if (res.ok) {
      oblastInfoData = await res.json();
      renderCapitalMarkers();
    }
  } catch { /* non-critical */ }
}

function findOblastInfo(featureName) {
  if (!oblastInfoData) return null;
  const infoName = OBLAST_INFO_MAP[featureName];
  if (infoName) {
    const match = oblastInfoData.oblasts.find(o => o.name_en === infoName);
    if (match) return match;
  }
  // Fuzzy fallback
  const lower = featureName.toLowerCase();
  return oblastInfoData.oblasts.find(o =>
    o.name_en.toLowerCase().startsWith(lower) ||
    o.name_en.toLowerCase().replace(' oblast', '') === lower
  ) ?? null;
}

// ── Capital city markers (Ukraine view) ──────────────────────────────────────

function renderCapitalMarkers() {
  if (!map || !oblastInfoData) return;
  if (capitalLayer) { capitalLayer.remove(); capitalLayer = null; }
  if (mapViewMode !== 'ukraine') return;

  const oblasts = oblastInfoData.oblasts ?? oblastInfoData;
  capitalLayer = L.layerGroup();

  oblasts.forEach(o => {
    if (!o.capital_lat || !o.capital_lon) return;
    const isOccupied = o.name_en?.includes('Crimea') || o.name_en?.includes('Luhansk');
    const dotColor   = isOccupied ? '#cc0000' : '#c9a227';
    const labelClass = isOccupied ? 'capital-label capital-label-occupied' : 'capital-label';

    const icon = L.divIcon({
      className: '',
      html: `<div class="capital-dot" style="background:${dotColor}"></div>`,
      iconSize: [8, 8],
      iconAnchor: [4, 4],
    });

    const marker = L.marker([o.capital_lat, o.capital_lon], { icon, interactive: false })
      .bindTooltip(`<span class="${labelClass}">${o.capital_en ?? o.capital_uk ?? ''}</span>`, {
        permanent: true,
        direction: 'top',
        offset: [0, -6],
        className: 'capital-tooltip',
      });

    capitalLayer.addLayer(marker);
  });

  capitalLayer.addTo(map);
}

function zoomToOblastFeature(layer) {
  try {
    const bounds = layer.getBounds().pad(0.08);
    map.flyToBounds(bounds, { maxZoom: 9, duration: 0.8, easeLinearity: 0.35 });
  } catch { /* no bounds */ }
}

function showOblastPanel(info, featureName) {
  let panel = document.getElementById('oblastInfoPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'oblastInfoPanel';
    panel.className = 'oblast-info-panel';
    document.body.appendChild(panel);
  }

  const lang = getLang();
  const name      = lang === 'uk' ? (info?.name_uk ?? featureName) : (info?.name_en ?? featureName);
  const capital   = lang === 'uk' ? (info?.capital_uk ?? '—') : (info?.capital_en ?? '—');
  const famous    = lang === 'uk' ? (info?.famous_for_uk ?? '') : (info?.famous_for_en ?? '');
  const recon     = lang === 'uk' ? (info?.reconstruction_uk ?? '') : (info?.reconstruction_en ?? '');
  const closeLabel = t('oblast.close');
  const capitalLabel = t('oblast.capital');
  const famousLabel  = t('oblast.famous_for');
  const reconLabel   = t('oblast.reconstruction');

  const wikiArticle = info?.wiki_article;
  const imgHTML = wikiArticle
    ? `<div class="oblast-photo-wrap" id="oblastPhotoWrap"><div class="oblast-photo-loading"></div></div>`
    : '';

  panel.innerHTML = `
    <button class="oblast-panel-close" aria-label="${closeLabel}">×</button>
    ${imgHTML}
    <div class="oblast-panel-body">
      <h2 class="oblast-panel-name">${name}</h2>
      <dl class="oblast-panel-dl">
        <dt>${capitalLabel}</dt><dd>${capital}</dd>
        ${famous ? `<dt>${famousLabel}</dt><dd>${famous}</dd>` : ''}
        ${recon  ? `<dt>${reconLabel}</dt><dd>${recon}</dd>` : ''}
      </dl>
    </div>`;

  panel.hidden = false;
  panel.classList.add('visible');
  panel.querySelector('.oblast-panel-close').addEventListener('click', () => {
    panel.classList.remove('visible');
    setTimeout(() => { panel.hidden = true; }, 280);
    if (oblastLayer) oblastLayer.resetStyle();
  });

  // Load photo via Wikipedia REST API (avoids guessing Commons filenames)
  if (wikiArticle) {
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiArticle)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const wrap = document.getElementById('oblastPhotoWrap');
        if (!wrap) return;
        if (data?.thumbnail?.source) {
          wrap.innerHTML = `<img src="${data.thumbnail.source}" alt="${name}" class="oblast-photo">`;
        } else {
          wrap.remove();
        }
      })
      .catch(() => {
        const wrap = document.getElementById('oblastPhotoWrap');
        if (wrap) wrap.remove();
      });
  }
}

// ── Damaged-view oblast interaction ──────────────────────────────────────────

function handleDamagedOblastClick(name, leafletThis, layer, info) {
  // Toggle: clicking the same oblast again clears the selection
  if (selectedOblast === name) {
    selectedOblast = null;
    oblastLayer.setStyle(oblastStyle);
    closeOblastWarPanel();
    renderMarkers();
    return;
  }

  selectedOblast = name;

  // Dim all oblasts, highlight selected
  oblastLayer.eachLayer(l => {
    const lname = l.feature?.properties?.name;
    if (lname === name) {
      l.setStyle({ fillOpacity: 0.88, weight: 2.5, color: '#f5c842' });
      l.bringToFront();
    } else {
      l.setStyle({ fillOpacity: 0.25, weight: 1, color: '#c9a227' });
    }
  });

  // Zoom to oblast bounds
  try { map.fitBounds(layer.getBounds().pad(0.12)); } catch { /* no bounds */ }

  // Filter asset markers to this oblast
  renderMarkers();

  // Show war risk panel
  showOblastWarPanel(info, name);
}

function closeOblastWarPanel() {
  const p = document.getElementById('oblastWarPanel');
  if (p) { p.classList.remove('visible'); setTimeout(() => p.remove(), 280); }
}

function closeReconstructedPanel() {
  const p = document.getElementById('oblastReconPanel');
  if (p) { p.classList.remove('visible'); setTimeout(() => p.remove(), 280); }
}

// ── Risk visual helpers ───────────────────────────────────────────────────────

function riskColor(val) {
  if (val <= 2) return '#27ae60';
  if (val <= 4) return '#c9a227';
  if (val <= 7) return '#e07020';
  return '#cc2222';
}

function makeGaugeSVG(risk) {
  const cx = 100, cy = 102, r = 78, sw = 15;
  const SEGS = [
    { key: 'low',      col: '#27ae60', a0:   1.5, a1:  43.5 },
    { key: 'moderate', col: '#c9a227', a0:  46.5, a1:  88.5 },
    { key: 'high',     col: '#e07020', a0:  91.5, a1: 133.5 },
    { key: 'severe',   col: '#cc2222', a0: 136.5, a1: 178.5 },
  ];
  const ORDER = { low: 0, moderate: 1, high: 2, severe: 3 };
  const cur = ORDER[risk] ?? 0;

  function pt(f) {
    const rad = (180 - f) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  }
  function arc(a0, a1) {
    const [x1, y1] = pt(a0), [x2, y2] = pt(a1);
    return `M ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  const segSVG = SEGS.map((s, i) =>
    `<path d="${arc(s.a0, s.a1)}" fill="none" stroke="${s.col}"
      stroke-width="${sw}" stroke-linecap="${i === 0 ? 'round' : i === 3 ? 'round' : 'butt'}"
      opacity="${i <= cur ? '1' : '0.15'}"/>`
  ).join('');

  const LABELS = { severe:'SEVERE', high:'HIGH', moderate:'MODERATE', low:'LOW' };
  const COLS   = { severe:'#ff6666', high:'#ffaa44', moderate:'#f5c842', low:'#55dd77' };
  const label  = LABELS[risk] ?? risk.toUpperCase();
  const col    = COLS[risk] ?? '#fff';

  // Scale labels
  const scaleTicks = ['LOW','MOD','HIGH','SEV'].map((t, i) => {
    const [tx, ty] = pt(i * 45 + 22.5);
    const nx = tx + (cx - tx) * 0.22, ny = ty + (cy - ty) * 0.22;
    return `<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="middle"
      font-size="6.5" fill="rgba(255,255,255,0.35)" font-family="sans-serif">${t}</text>`;
  }).join('');

  return `<svg viewBox="0 0 200 115" xmlns="http://www.w3.org/2000/svg" class="owp-gauge-svg">
    <path d="${arc(0, 180)}" fill="none" stroke="#1a2a4a" stroke-width="${sw}" stroke-linecap="round"/>
    ${segSVG}
    ${scaleTicks}
    <text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="22" font-weight="800"
          fill="${col}" font-family="sans-serif" letter-spacing="1">${label}</text>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9"
          fill="rgba(255,255,255,0.38)" font-family="sans-serif">WAR RISK</text>
  </svg>`;
}

function makeRiskBars(scores) {
  const metrics = [
    { label: 'Frontline proximity', val: scores?.frontline  ?? 0, inv: false },
    { label: 'Strike frequency',    val: scores?.strikes    ?? 0, inv: false },
    { label: 'Infrastructure damage',val: scores?.damage    ?? 0, inv: false },
    { label: 'Reconstruction readiness', val: scores?.readiness ?? 0, inv: true },
  ];
  return `<div class="owp-bars">${metrics.map(m => {
    const col = m.inv
      ? (m.val >= 8 ? '#27ae60' : m.val >= 6 ? '#c9a227' : m.val >= 4 ? '#e07020' : '#cc2222')
      : riskColor(m.val);
    return `<div class="owp-bar-row">
      <span class="owp-bar-lbl">${m.label}</span>
      <div class="owp-bar-track">
        <div class="owp-bar-fill" style="width:${m.val * 10}%;background:${col}"></div>
      </div>
      <span class="owp-bar-num" style="color:${col}">${m.val}</span>
    </div>`;
  }).join('')}</div>`;
}

function showOblastWarPanel(info, featureName) {
  closeOblastWarPanel();

  const lang   = getLang();
  const name   = lang === 'uk' ? (info?.name_uk ?? featureName) : (info?.name_en ?? featureName);
  const risk   = info?.war_risk ?? 'unknown';
  const prox   = lang === 'uk' ? (info?.front_proximity_uk ?? '') : (info?.front_proximity_en ?? '');
  const freq   = lang === 'uk' ? (info?.attack_frequency_uk ?? '') : (info?.attack_frequency_en ?? '');

  const RISK_LABEL = {
    severe:   { en: 'Severe',   uk: 'Критичний', cls: 'risk-severe'   },
    high:     { en: 'High',     uk: 'Високий',   cls: 'risk-high'     },
    moderate: { en: 'Moderate', uk: 'Помірний',  cls: 'risk-moderate' },
    low:      { en: 'Low',      uk: 'Низький',   cls: 'risk-low'      },
  };
  const rl = RISK_LABEL[risk] ?? { en: 'Unknown', uk: 'Невідомо', cls: 'risk-low' };
  const riskLabel = lang === 'uk' ? rl.uk : rl.en;

  // Count assets in this oblast
  const fullName = OBLAST_INFO_MAP[featureName] ?? featureName;
  const oblastAssets = allAssets.filter(a => {
    const loc = a.location?.oblast ?? '';
    return loc === fullName || loc === featureName || loc.replace(' Oblast', '') === featureName;
  });
  const totalCost = oblastAssets.reduce((s, a) => s + (a.cost_paths?.baseline?.central_usd_m ?? 0), 0);

  const panel = document.createElement('div');
  panel.id = 'oblastWarPanel';
  panel.className = 'oblast-war-panel';
  panel.innerHTML = `
    <div class="owp-header">
      <div>
        <div class="owp-name">${name}</div>
        <span class="owp-risk-badge ${rl.cls}">⚠ ${riskLabel}</span>
      </div>
      <button class="owp-close" aria-label="Close">×</button>
    </div>
    <div class="owp-visual">
      ${makeGaugeSVG(risk)}
      ${makeRiskBars(info?.risk_scores)}
    </div>
    ${prox ? `<div class="owp-section"><div class="owp-section-label">Frontline proximity</div><p>${prox}</p></div>` : ''}
    ${freq ? `<div class="owp-section"><div class="owp-section-label">Attack frequency</div><p>${freq}</p></div>` : ''}
    <div class="owp-stats">
      <div class="owp-stat"><span class="owp-stat-n">${oblastAssets.length}</span><span class="owp-stat-l">damaged assets</span></div>
      ${totalCost > 0 ? `<div class="owp-stat"><span class="owp-stat-n">$${totalCost}M</span><span class="owp-stat-l">est. baseline cost</span></div>` : ''}
    </div>
    <p class="owp-hint">Click the region again to deselect</p>`;

  panel.querySelector('.owp-close').addEventListener('click', () => {
    selectedOblast = null;
    oblastLayer.setStyle(oblastStyle);
    closeOblastWarPanel();
    renderMarkers();
  });

  document.querySelector('.map-layout').appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('visible'));

  // Load Wikipedia photo
  const wikiArticle = info?.wiki_article;
  if (wikiArticle) {
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiArticle)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const img = data?.thumbnail?.source;
        if (!img || !document.getElementById('oblastWarPanel')) return;
        const photo = document.createElement('img');
        photo.src = img; photo.className = 'owp-photo'; photo.alt = name;
        panel.querySelector('.owp-header').insertAdjacentElement('afterend', photo);
      })
      .catch(() => {});
  }
}

// ── Reconstructed-view oblast interaction ─────────────────────────────────────

function handleReconstructedOblastClick(name, leafletThis, layer, info) {
  if (selectedOblast === name) {
    selectedOblast = null;
    oblastLayer.setStyle(oblastStyle);
    closeReconstructedPanel();
    renderMarkers();
    return;
  }

  selectedOblast = name;

  oblastLayer.eachLayer(l => {
    const lname = l.feature?.properties?.name;
    if (lname === name) {
      l.setStyle({ fillOpacity: 0.90, weight: 3, color: '#f5c842' });
      l.bringToFront();
    } else {
      l.setStyle({ fillOpacity: 0.20, weight: 1, color: '#c9a227' });
    }
  });

  try { map.fitBounds(layer.getBounds().pad(0.12)); } catch { /* no bounds */ }

  renderMarkers();
  showReconstructedPanel(info, name);
}

function showReconstructedPanel(info, featureName) {
  closeReconstructedPanel();

  const lang = getLang();
  const name = lang === 'uk' ? (info?.name_uk ?? featureName) : (info?.name_en ?? featureName);

  const fullName = OBLAST_INFO_MAP[featureName] ?? featureName;
  const completed = allAssets.filter(a => {
    if (a.wartime_status?.lifecycle !== 'complete') return false;
    const loc = a.location?.oblast ?? '';
    return loc === fullName || loc === featureName || loc.replace(' Oblast', '') === featureName;
  });

  const projectsHTML = completed.length === 0
    ? `<div class="orp-empty">No completed reconstruction projects recorded in this region yet.</div>`
    : completed.map(a => {
        const aName = getName(a);
        const colour = SECTOR_COLOURS[a.sector] ?? '#555';
        const baseline = a.cost_paths?.baseline?.central_usd_m;
        const codeComp = a.cost_paths?.code_compliant?.central_usd_m;
        const bbb      = a.cost_paths?.build_back_better?.central_usd_m;
        const totalCost = bbb ?? codeComp ?? baseline;
        return `
          <a class="orp-project" href="/asset.html?id=${encodeURIComponent(a.asset_id)}">
            <div class="orp-project-banner" style="background:${colour}22;border-left:3px solid ${colour}">
              <span class="orp-project-sector" style="color:${colour}">${SECTOR_LABELS[a.sector] ?? a.sector}</span>
              ${totalCost != null ? `<span class="orp-project-cost">$${totalCost}M</span>` : ''}
            </div>
            <div class="orp-project-body">
              <div class="orp-project-name">${aName}</div>
              <div class="orp-cost-row">
                ${baseline != null ? `<span class="orp-cost-item"><span class="orp-cost-lbl">Baseline</span> $${baseline}M</span>` : ''}
                ${codeComp != null ? `<span class="orp-cost-item"><span class="orp-cost-lbl">Code+</span> $${codeComp}M</span>` : ''}
                ${bbb      != null ? `<span class="orp-cost-item"><span class="orp-cost-lbl">BBB</span> $${bbb}M</span>` : ''}
              </div>
            </div>
          </a>`;
      }).join('');

  const panel = document.createElement('div');
  panel.id = 'oblastReconPanel';
  panel.className = 'oblast-recon-panel';
  panel.innerHTML = `
    <div class="orp-header">
      <div>
        <div class="orp-name">${name}</div>
        <div class="orp-subtitle">✅ Reconstruction projects</div>
      </div>
      <button class="orp-close" aria-label="Close">×</button>
    </div>
    <div class="orp-projects">${projectsHTML}</div>
    ${completed.length > 0 ? `<div class="orp-stats"><span class="orp-stat-n">${completed.length}</span><span class="orp-stat-l"> completed project${completed.length !== 1 ? 's' : ''}</span></div>` : ''}
    <p class="orp-hint">Click the region again to deselect</p>`;

  panel.querySelector('.orp-close').addEventListener('click', () => {
    selectedOblast = null;
    oblastLayer.setStyle(oblastStyle);
    closeReconstructedPanel();
    renderMarkers();
  });

  document.querySelector('.map-layout').appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('visible'));

  const wikiArticle = info?.wiki_article;
  if (wikiArticle) {
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiArticle)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const img = data?.thumbnail?.source;
        if (!img || !document.getElementById('oblastReconPanel')) return;
        const photo = document.createElement('img');
        photo.src = img; photo.className = 'orp-photo'; photo.alt = name;
        panel.querySelector('.orp-header').insertAdjacentElement('afterend', photo);
      })
      .catch(() => {});
  }
}

// ── Oblast boundary layer ─────────────────────────────────────────────────────

// Per-view colour palette  [border, normalFill, crimeaFill, mapBg]
const VIEW_PALETTE = {
  ukraine:       { border: '#4a90d9', fill: '#e8f4fd', crimeaFill: '#b8d4ef', bg: '#eaf2fb' },
  damaged:       { border: '#27ae60', fill: '#b03030', crimeaFill: '#6b0000', bg: '#1a0808' },
  reconstructed: { border: '#c9a227', fill: '#0d2b5e', crimeaFill: '#060e22', bg: '#040e24' },
  development:   { border: '#1a7a2e', fill: '#2d7a3a', crimeaFill: '#1a3a1a', bg: '#071208' },
};

function oblastStyle(feature) {
  const name      = feature.properties?.name ?? '';
  const isCrimea  = name === 'Crimea' || name.includes('Crimea') || feature.properties?.status === 'occupied';
  const isOccupied = OCCUPIED_OBLASTS.has(name) || isCrimea;
  const isPartial  = PARTIALLY_OCCUPIED_OBLASTS.has(name);
  const pal = VIEW_PALETTE[mapViewMode] ?? VIEW_PALETTE.damaged;

  // War mode: occupation status — three tiers with distinct colours
  if (warMode) {
    if (isCrimea) {
      // Occupied since 2014 — deepest tone, solid border
      return { color: '#cc0000', weight: 2.5, fillColor: '#3d0000', fillOpacity: 0.85, dashArray: null };
    }
    if (isOccupied) {
      // Largely occupied since 2022 (Luhansk) — dark red, solid border
      return { color: '#cc2200', weight: 2, fillColor: '#5a0800', fillOpacity: 0.78, dashArray: null };
    }
    if (isPartial) {
      // Contested/partially occupied — burnt orange, dashed border signals fluid frontline
      return { color: '#cc4400', weight: 2, fillColor: '#7a1e08', fillOpacity: 0.60, dashArray: '10, 6' };
    }
  }

  // Ukraine view uses light-map styling (lighter fill, thinner border)
  if (mapViewMode === 'ukraine') {
    return {
      color:       pal.border,
      weight:      1,
      opacity:     0.6,
      fillColor:   isCrimea ? pal.crimeaFill : pal.fill,
      fillOpacity: 0.25,
      dashArray:   isCrimea ? '6, 4' : null,
    };
  }

  return {
    color:       pal.border,
    weight:      1.5,
    fillColor:   isCrimea ? pal.crimeaFill : pal.fill,
    fillOpacity: isCrimea ? 0.55 : 0.68,
    dashArray:   isCrimea ? '6, 4' : null,
  };
}

function toggleWarMode() {
  warMode = !warMode;
  if (oblastLayer) oblastLayer.setStyle(oblastStyle);
  const btn = document.getElementById('warModeBtn');
  if (btn) {
    btn.classList.toggle('war-active', warMode);
    btn.textContent = warMode ? '🗺 Hide occupation' : '🔴 Occupied territories';
  }
  const legend = document.getElementById('warLegend');
  if (legend) legend.hidden = !warMode;
}

async function addOblastLayer() {
  try {
    const geojson = await loadOblastsGeoJSON();
    oblastLayer = L.geoJSON(geojson, {
      style: oblastStyle,
      onEachFeature(feature, layer) {
        const name = feature.properties?.name ?? '';
        const isCrimea = name.includes('Crimea') || feature.properties?.status === 'occupied';
        const isLuhansk  = name === "Luhans'k";
        const isPartialOcc = PARTIALLY_OCCUPIED_OBLASTS.has(name);
        let tooltipText = name;
        if (isCrimea) tooltipText = 'Autonomous Republic of Crimea — occupied since 2014 (UA territory)';
        else if (isLuhansk) tooltipText = 'Luhansk Oblast — largely occupied since 2022 (UA territory)';
        else if (isPartialOcc) tooltipText = `${name} Oblast — contested/partially occupied (UA territory)`;
        if (name) layer.bindTooltip(tooltipText, { permanent: false, sticky: true, className: 'oblast-tooltip' });

        layer.on('mouseover', function () {
          if (selectedOblast !== name) {
            if (mapViewMode === 'ukraine') {
              this.setStyle({ fillColor: '#fff9c4', fillOpacity: 0.55, color: '#c9a227', weight: 2 });
            } else {
              this.setStyle({ fillOpacity: 0.90, weight: 2 });
            }
          }
        });
        layer.on('mouseout', function () {
          if (selectedOblast !== name) oblastLayer.resetStyle(this);
        });
        layer.on('click', function () {
          const info = findOblastInfo(name);
          if (mapViewMode === 'damaged') {
            handleDamagedOblastClick(name, this, layer, info);
          } else if (mapViewMode === 'reconstructed') {
            handleReconstructedOblastClick(name, this, layer, info);
          } else {
            // Ukraine / Development view: animate zoom into the oblast
            oblastLayer.resetStyle();
            this.setStyle({ fillColor: '#fff9c4', fillOpacity: 0.70, weight: 2.5, color: '#c9a227' });
            zoomToOblastFeature(this);
            showOblastPanel(info ?? { name_en: name, name_uk: name }, name);
          }
        });
      }
    }).addTo(map);
    oblastLayer.bringToBack();
  } catch (e) {
    console.warn('Oblast GeoJSON failed to load:', e.message);
  }
}

// ── Map view switching ────────────────────────────────────────────────────────

function setMapView(view) {
  mapViewMode = view;

  // Update tab active state and tint with view accent colour
  const accent = VIEW_PALETTE[view]?.border ?? '#c9a227';
  for (const btn of document.querySelectorAll('.map-view-tab')) {
    const isActive = btn.id === `tab-${view}`;
    btn.classList.toggle('map-view-tab-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.style.color = isActive ? accent : '';
    btn.style.background = isActive ? `${accent}22` : '';
  }

  // Clear any oblast selection when switching views
  selectedOblast = null;
  closeOblastWarPanel();
  closeReconstructedPanel();
  if (oblastLayer) oblastLayer.setStyle(oblastStyle);

  // Swap map background colour to match view palette
  const pal = VIEW_PALETTE[view] ?? VIEW_PALETTE.damaged;
  const mapEl = document.getElementById('map');
  const layoutEl = document.querySelector('.map-layout');
  if (mapEl)    mapEl.style.background    = pal.bg;
  if (layoutEl) layoutEl.style.background = pal.bg;

  // Show/hide filter+asset controls (not useful in ukraine/development views)
  const showControls = view === 'damaged' || view === 'reconstructed';
  const filterBtn = document.getElementById('toggleFilterBtn');
  const assetsBtn = document.getElementById('toggleAssetsBtn');
  if (filterBtn) filterBtn.style.display = showControls ? '' : 'none';
  if (assetsBtn) assetsBtn.style.display = showControls ? '' : 'none';

  // Close open panels when switching away from views that use them
  if (!showControls) {
    const fp = document.getElementById('filterPanel');
    const ap = document.getElementById('assetListPanel');
    if (fp?.classList.contains('panel-open'))  window.uvTogglePanel?.('filterPanel', 'toggleFilterBtn');
    if (ap?.classList.contains('panel-open'))  window.uvTogglePanel?.('assetListPanel', 'toggleAssetsBtn');
  }

  // Show/hide view hint overlay
  let hint = document.getElementById('mapViewHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'mapViewHint';
    hint.className = 'map-view-hint';
    document.querySelector('.map-layout').appendChild(hint);
  }
  const hints = {
    ukraine:       'Click any region to explore',
    damaged:       '',
    reconstructed: 'Showing completed reconstruction projects',
    development:   'Development opportunities — coming soon',
  };
  hint.textContent = hints[view] || '';
  hint.hidden = !hints[view];

  renderMarkers();
  renderCapitalMarkers();
}

// ── Marker layer ──────────────────────────────────────────────────────────────

function renderMarkers() {
  for (const [, marker] of markerMap) map.removeLayer(marker);
  markerMap.clear();

  // Ukraine view: no pins, just the oblast layer
  if (mapViewMode === 'ukraine') {
    updateAssetCount(0);
    renderAssetList([]);
    return;
  }

  // Development view: placeholder, no pins yet
  if (mapViewMode === 'development') {
    updateAssetCount(0);
    renderAssetList([]);
    return;
  }

  let candidates = allAssets.filter(matchesFilters);

  // Reconstructed view: only completed assets, shown in green
  if (mapViewMode === 'reconstructed') {
    candidates = allAssets.filter(a => a.wartime_status?.lifecycle === 'complete');
  }

  // With a selected oblast: filter markers to that region
  if (selectedOblast && (mapViewMode === 'damaged' || mapViewMode === 'reconstructed')) {
    const fullName = OBLAST_INFO_MAP[selectedOblast] ?? selectedOblast;
    candidates = candidates.filter(a => {
      const loc = a.location?.oblast ?? '';
      return loc === fullName || loc === selectedOblast ||
             loc.replace(' Oblast', '') === selectedOblast;
    });
  }

  const visible = candidates;

  for (const asset of visible) {
    const { lat, lon } = asset.location;
    if (!lat || !lon) continue;

    const icon = mapViewMode === 'reconstructed' ? makeCompletedIcon() : makeIcon(asset);
    const marker = L.marker([lat, lon], { icon })
      .bindPopup(makePopupHTML(asset), { maxWidth: 280, className: 'asset-popup' });

    marker.on('click', () => {
      map.setView([lat, lon], Math.max(map.getZoom(), 8));
    });

    marker.addTo(map);
    markerMap.set(asset.asset_id, marker);
  }

  updateAssetCount(visible.length);
  renderAssetList(visible);
  renderAggregation(document.getElementById('aggPanel'), computeAggregation(visible));
}

// ── Asset list panel ──────────────────────────────────────────────────────────

function renderAssetList(assets) {
  const list = document.getElementById('assetList');
  if (!list) return;

  list.innerHTML = '';
  for (const asset of assets) {
    const item    = document.createElement('a');
    item.className = 'asset-list-item';
    item.href     = `/asset.html?id=${encodeURIComponent(asset.asset_id)}`;

    const name    = getName(asset);
    const sector  = t(`sector.${asset.sector}`) || SECTOR_LABELS[asset.sector] || asset.sector;
    const level   = asset.damage?.destruction_level ?? '—';
    const colour  = SECTOR_COLOURS[asset.sector] ?? '#555';
    const reCount = asset.damage?.re_damage_count ?? 0;
    const central = asset.cost_paths?.baseline?.central_usd_m;
    const costStr = central != null ? ` · $${central}M` : '';

    item.innerHTML = `
      <span class="ali-dot" style="background:${colour}"></span>
      <span class="ali-body">
        <span class="ali-name">${name}</span>
        <span class="ali-meta">${sector} · ${level}${costStr}${reCount >= 2 ? ' · ⚠ re-damaged' : ''}</span>
      </span>`;

    item.addEventListener('click', e => {
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
  if (!el) return;
  const lang = getLang();
  if (lang === 'uk') {
    const m10 = n % 10, m100 = n % 100;
    let form = 'активів';
    if (m10 === 1 && m100 !== 11) form = 'актив';
    else if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) form = 'активи';
    el.textContent = `Показано ${n} ${form}`;
  } else {
    el.textContent = `${n} asset${n !== 1 ? 's' : ''} shown`;
  }
}

// ── Filter UI ─────────────────────────────────────────────────────────────────

function initFilters() {
  const sectors = [...new Set(allAssets.map(a => a.sector))].sort();
  initSectorFilter(document.getElementById('sectorFilter'), sectors);

  const oblasts = [...new Set(allAssets.map(a => a.location?.oblast).filter(Boolean))].sort();
  initOblastFilter(document.getElementById('oblastFilter'), oblasts);

  initCostBandFilter(document.getElementById('costBandFilter'));
  initFinancingClassFilter(document.getElementById('financingClassFilter'));

  initToggleChips(
    document.getElementById('rebuildabilityFilter'),
    getActiveFilters().rebuildability
  );

  initToggleChips(
    document.getElementById('lifecycleFilter'),
    getActiveFilters().lifecycle
  );

  initReDamageFilter(document.getElementById('reDamageFilter'));

  document.getElementById('resetFilters')?.addEventListener('click', () => {
    resetAllFilters();
    // Re-sync chip visual state
    for (const btn of document.querySelectorAll('.chip')) {
      const val = btn.dataset.value;
      if (!val) continue;
      const inRebuild = filterState.rebuildability.has(val);
      const inLifecycle = filterState.lifecycle.has(val);
      btn.classList.toggle('active',
        inRebuild || inLifecycle
      );
    }
    // Deactivate all dynamic chips
    for (const btn of document.querySelectorAll('#sectorFilter .chip, #oblastFilter .chip, #costBandFilter .chip, #financingClassFilter .chip')) {
      btn.classList.remove('active');
    }
    document.getElementById('reDamageFilter')?.classList.remove('active');
  });

  document.addEventListener('filtersChanged', renderMarkers);
  document.addEventListener('langChanged', renderMarkers);
}

// ── App version ───────────────────────────────────────────────────────────────

const APP_VERSION  = document.querySelector('meta[name="app-version"]')?.content ?? '0.0.2';
const versionLabel = document.getElementById('versionLabel');
if (versionLabel) versionLabel.textContent = `v${APP_VERSION}`;

// ── Disclaimer ────────────────────────────────────────────────────────────────

function initDisclaimer() {
  const banner = document.getElementById('disclaimerBanner');
  if (!banner) return;
  try {
    if (sessionStorage.getItem('uvidnova_disclaimer')) { banner.remove(); return; }
  } catch { /* storage unavailable — show banner */ }
  document.getElementById('dismissDisclaimer')?.addEventListener('click', () => {
    try { sessionStorage.setItem('uvidnova_disclaimer', '1'); } catch { /* ignore */ }
    banner.style.transition = 'opacity 0.3s ease';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 320);
  });
}

// ── Landing overlay ───────────────────────────────────────────────────────────

function initLanding() {
  // Landing dismiss is handled by the inline <script> immediately after the
  // landing div in index.html — never SW-cached, always runs fresh.
}

// ── Feedback modal ────────────────────────────────────────────────────────────

function initFeedback() {
  const btn    = document.getElementById('feedbackBtn');
  const modal  = document.getElementById('feedbackModal');
  const close  = document.getElementById('closeFeedbackModal');
  const form   = document.getElementById('feedbackForm');
  const sent   = document.getElementById('feedbackSent');
  const submit = document.getElementById('feedbackSubmit');
  if (!btn || !modal) return;

  const openModal  = () => { modal.hidden = false; document.getElementById('fbName')?.focus(); };
  const closeModal = () => { modal.hidden = true; };

  btn.addEventListener('click', openModal);
  close?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit) submit.disabled = true;
    try {
      await fetch('/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams(new FormData(form)).toString(),
      });
      if (sent) sent.hidden = false;
      form.reset();
      setTimeout(closeModal, 2200);
    } catch {
      if (sent) sent.hidden = false;
      setTimeout(closeModal, 2200);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

// ── AI chat panel ─────────────────────────────────────────────────────────────

function initChat() {
  const chatBtn  = document.getElementById('chatBtn');
  const panel    = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('closeChatPanel');
  const messages = document.getElementById('chatMessages');
  const form     = document.getElementById('chatForm');
  const input    = document.getElementById('chatInput');
  const sendBtn  = document.getElementById('chatSend');
  if (!chatBtn || !panel) return;

  const CHAT_HISTORY = [];
  let isWaiting = false;

  const openPanel  = () => { panel.hidden = false; input?.focus(); };
  const closePanel = () => { panel.hidden = true; };

  chatBtn.addEventListener('click', openPanel);
  closeBtn?.addEventListener('click', closePanel);

  function appendMessage(role, text) {
    messages?.querySelector('.chat-welcome')?.remove();
    const div    = document.createElement('div');
    div.className = `chat-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    messages?.appendChild(div);
    messages?.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.id = 'chatTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    messages?.appendChild(div);
    messages?.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
  }
  const hideTyping = () => document.getElementById('chatTyping')?.remove();

  async function sendMessage(content) {
    if (isWaiting || !content.trim()) return;
    isWaiting = true;
    if (sendBtn) sendBtn.disabled = true;

    CHAT_HISTORY.push({ role: 'user', content: content.trim() });
    appendMessage('user', content.trim());
    showTyping();

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: CHAT_HISTORY }),
      });
      const data = await res.json();
      hideTyping();
      if (!res.ok || !data.message) throw new Error(data.error ?? 'No response');
      const reply = data.message.content;
      CHAT_HISTORY.push({ role: 'assistant', content: reply });
      appendMessage('assistant', reply);
    } catch (err) {
      hideTyping();
      appendMessage('error', `AI temporarily unavailable. ${err.message ?? 'Please try again.'}`);
    } finally {
      isWaiting = false;
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  form?.addEventListener('submit', e => {
    e.preventDefault();
    const text = input?.value ?? '';
    if (input) input.value = '';
    sendMessage(text);
  });

  messages?.addEventListener('click', e => {
    const chip = e.target.closest('.chat-suggestion');
    if (chip) sendMessage(chip.textContent);
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  // Set up all UI buttons first — these must never depend on the map or data
  initDisclaimer();
  initFeedback();
  initChat();
  initLangToggle(document.getElementById('langToggle'));
  document.addEventListener('langChanged', applyTranslations);

  // Initialise Leaflet map — CartoDB Positron light tiles
  map = L.map('map', {
    center:             [48.8, 31.5],
    zoom:               6,
    minZoom:            5,
    maxZoom:            12,
    zoomControl:        true,
    attributionControl: true,
    maxBounds:          [[43.5, 21.5], [53.5, 40.5]],
    maxBoundsViscosity: 0.85,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  try {
    const [assets] = await Promise.all([
      loadAllAssets(),
      addOblastLayer(),
      loadOblastInfo()
    ]);

    allAssets = assets;
    initFilters();
    setMapView('damaged');

    if (assets.length > 0) {
      const latlngs = assets
        .filter(a => a.location?.lat && a.location?.lon)
        .map(a => [a.location.lat, a.location.lon]);
      if (latlngs.length > 0) map.fitBounds(L.latLngBounds(latlngs).pad(0.4));
    }
  } catch (err) {
    console.error('uVidNova init error:', err);
    document.getElementById('map').insertAdjacentHTML('afterend',
      `<p class="load-error">Failed to load asset data: ${err.message}</p>`);
  }
}

init();

// Expose stubs for inline onclick handlers
window._appWarToggle   = toggleWarMode;
window._appSetMapView  = setMapView;
window._appFinance     = () => openFinanceWizard(allAssets);

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

// ── Map initialisation ────────────────────────────────────────────────────────

const map = L.map('map', {
  center:           [48.4, 31.5],
  zoom:             6,
  zoomControl:      true,
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
let oblastInfoData = null;

// ── Oblast info panel ─────────────────────────────────────────────────────────

async function loadOblastInfo() {
  try {
    const res = await fetch('/data/oblasts_info.json');
    if (res.ok) oblastInfoData = await res.json();
  } catch { /* non-critical */ }
}

function findOblastInfo(featureName) {
  if (!oblastInfoData) return null;
  const lower = featureName.toLowerCase();
  return oblastInfoData.oblasts.find(o =>
    o.name_en.toLowerCase().includes(lower) ||
    lower.includes(o.name_en.toLowerCase().split(' ')[0].toLowerCase()) ||
    o.name_uk.toLowerCase().includes(lower)
  ) ?? oblastInfoData.oblasts.find(o =>
    featureName.toLowerCase().replace(' oblast', '').trim().length > 3 &&
    o.name_en.toLowerCase().includes(featureName.toLowerCase().replace(' oblast', '').trim())
  ) ?? null;
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

  const wikiFile = info?.wiki_image;
  const imgHTML = wikiFile
    ? `<img src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(wikiFile)}?width=480"
             alt="${name}" class="oblast-photo" loading="lazy" onerror="this.style.display='none'">`
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
}

// ── Oblast boundary layer ─────────────────────────────────────────────────────

async function addOblastLayer() {
  try {
    const geojson = await loadOblastsGeoJSON();
    oblastLayer = L.geoJSON(geojson, {
      style: {
        color:       '#1a3a6b',
        weight:      1.5,
        fillColor:   '#cdd9f0',
        fillOpacity: 0.18
      },
      onEachFeature(feature, layer) {
        const name = feature.properties?.name ?? '';
        if (name) layer.bindTooltip(name, { permanent: false, sticky: true, className: 'oblast-tooltip' });

        layer.on('mouseover', function () {
          this.setStyle({ fillOpacity: 0.38, weight: 2.5 });
        });
        layer.on('mouseout', function () {
          oblastLayer.resetStyle(this);
        });
        layer.on('click', function () {
          oblastLayer.resetStyle();
          this.setStyle({ fillOpacity: 0.45, weight: 2.5, color: '#0a2a5e' });
          const info = findOblastInfo(name);
          showOblastPanel(info ?? { name_en: name, name_uk: name }, name);
        });
      }
    }).addTo(map);
    oblastLayer.bringToBack();
  } catch (e) {
    console.warn('Oblast GeoJSON failed to load:', e.message);
  }
}

// ── Marker layer ──────────────────────────────────────────────────────────────

function renderMarkers() {
  for (const [, marker] of markerMap) map.removeLayer(marker);
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
  if (sessionStorage.getItem('uvidnova_disclaimer')) { banner.remove(); return; }
  document.getElementById('dismissDisclaimer')?.addEventListener('click', () => {
    sessionStorage.setItem('uvidnova_disclaimer', '1');
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
  initLanding();
  initDisclaimer();
  initFeedback();
  initChat();
  initLangToggle(document.getElementById('langToggle'));

  document.addEventListener('langChanged', applyTranslations);

  try {
    const [assets] = await Promise.all([
      loadAllAssets(),
      addOblastLayer(),
      loadOblastInfo()
    ]);

    allAssets = assets;
    initFilters();
    renderMarkers();

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

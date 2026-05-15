/**
 * finance-wizard.js — "Finance It" multi-step financing wizard.
 * Pure deterministic calculations; no AI involvement in numeric output.
 */

import { getName } from './lang.js';
import { SECTOR_LABELS } from './filters.js';
import { loadGrowthSectors, renderWizardSectorPicker, getGreenfieldsTemplates } from './growth-sectors.js';

// ── Tranche definitions ───────────────────────────────────────────────────────

const TRANCHE_DEFS = {
  grant:             { label: 'EU / Donor Grant',           ret: 0,    tenor: null, col: '#27ae60' },
  eu_concessional:   { label: 'EU Concessional Loan',       ret: 1.5,  tenor: 20,   col: '#2980b9' },
  ebrd_concessional: { label: 'EBRD Concessional',          ret: 2.5,  tenor: 15,   col: '#1a6aa1' },
  world_bank:        { label: 'World Bank / IDA',           ret: 1.0,  tenor: 25,   col: '#3498db' },
  eca_guarantee:     { label: 'UKEF / ECA Guaranteed Debt', ret: 3.5,  tenor: 10,   col: '#8e44ad' },
  senior_debt:       { label: 'Senior Commercial Debt',     ret: 9.0,  tenor: 10,   col: '#7f8c8d' },
  mezzanine:         { label: 'Mezzanine / Sub Debt',       ret: 14.0, tenor: 7,    col: '#e67e22' },
  equity:            { label: 'Equity / Private Capital',   ret: 18.0, tenor: null, col: '#e74c3c' },
  reparations:       { label: 'Russian Reparations',        ret: 0,    tenor: null, col: '#9b59b6' },
};

// Confidence levels derived from funding_envelope.json — keyed by tranche type.
// 'high' renders no badge; 'medium' = "~" prefix; 'low' = amber warning.
const TRANCHE_CONFIDENCE = {
  grant:             { level: 'high',   note: 'EU Facility Pillar I and named bilateral envelopes explicit in source documents.' },
  eu_concessional:   { level: 'medium', note: 'Medium confidence — inferred from aggregate pledges' },
  ebrd_concessional: { level: 'medium', note: 'Medium confidence — inferred from aggregate pledges' },
  world_bank:        { level: 'medium', note: 'Medium confidence — World Bank / EBRD / EIB cumulative envelopes inferred from aggregate pledges.' },
  eca_guarantee:     { level: 'high',   note: 'Named ECA envelopes explicit in programme documents.' },
  senior_debt:       { level: 'low',    note: 'Low confidence — estimated from analogues. Verify before citing.' },
  mezzanine:         { level: 'low',    note: 'Low confidence — estimated from analogues. Verify before citing.' },
  equity:            { level: 'low',    note: 'Low confidence — estimated from fund-manager soundings and analogues.' },
  reparations:       { level: 'medium', note: 'Medium confidence — G7 ERA envelope explicit; principal-seizure scenario is low-confidence additive.' },
};

function confidenceBadge(type) {
  const c = TRANCHE_CONFIDENCE[type];
  if (!c || c.level === 'high') return '';
  if (c.level === 'medium') return `<span class="conf-badge-medium" title="${c.note}">~</span>`;
  return `<span class="conf-badge-low" title="${c.note}">⚠</span>`;
}

const KSE_CLAIM_USD_M   = 486000;  // $486B KSE total reparations claim
const FROZEN_USD_M      = 300000;  // ~$300B G7-frozen Russian assets
const TRUST_CORPUS_USD_M = 286000; // ~$286B full frozen corpus for Trust modelling
const TRUST_DRAWDOWN_PCT = 0.04;   // Default 4% drawdown (UNCC model)
const TRUST_RETURN_PCT   = 0.045;  // Default 4.5% annual return (ECB 2026-Q1)
const WAR_PREMIUM       = 2.0;     // % added to commercial tranches during war
const COMMERCIAL_TYPES  = new Set(['senior_debt', 'mezzanine', 'equity']);
const CONCESSIONAL_TYPES = new Set(['eu_concessional', 'ebrd_concessional', 'world_bank', 'eca_guarantee']);

const PATH_LABELS = {
  baseline:          'Baseline reconstruction',
  code_compliant:    'Code-compliant rebuild',
  build_back_better: 'Build Back Better',
};

const PATH_DESC = {
  baseline:          'Restore to pre-war condition',
  code_compliant:    '+15–25% · meets current EU building codes',
  build_back_better: '+30–60% · modern systems, energy efficiency, resilience',
};

const TIMING_LABELS = {
  during: 'During the war',
  after:  'Post-war only',
  phased: 'Phased — start during, close post-war',
};

// ── Wizard state ──────────────────────────────────────────────────────────────

let _assets = [];
let _growthData = null;

let W = {};  // wizard state

// Trust mode per-tranche: Map<tranche_id, 'lump_sum'|'trust'>
let _trustModes = new Map();

function reset(preselected = []) {
  W = {
    step: 1,
    scope: preselected.length === 1 ? 'single' : preselected.length > 1 ? 'group' : 'single',
    selectedIds: new Set(preselected),
    path: 'baseline',
    timing: 'during',
    tranches: [
      { id: 1, type: 'grant',           pct: 40, ret: 0,    tenor: null },
      { id: 2, type: 'eu_concessional', pct: 35, ret: 1.5,  tenor: 20  },
      { id: 3, type: 'equity',          pct: 25, ret: 18.0, tenor: null },
    ],
    nextId: 4,
    greenfield: { sectorId: null, archetypeId: null },
  };
  _trustModes = new Map();
}

/** Annual availability payment from the Trust at 4% drawdown, USD 286B corpus */
function trustAnnualPayment_usd_m() {
  return TRUST_CORPUS_USD_M * TRUST_DRAWDOWN_PCT; // = 11,440 USD M/yr
}

// ── Public entry point ────────────────────────────────────────────────────────

let _onClose = null;

export function openFinanceWizard(assets, preselectedIds = [], onClose = null) {
  _assets  = assets ?? [];
  _onClose = onClose;
  loadGrowthSectors().then(d => { _growthData = d; }).catch(() => {});
  reset(preselectedIds);

  let overlay = document.getElementById('financeWizard');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'financeWizard';
    overlay.className = 'fw-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = shell();
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  overlay.querySelector('#fwClose').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', escClose);

  render();
}

function close() {
  const o = document.getElementById('financeWizard');
  if (o) o.hidden = true;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', escClose);
  if (_onClose) { _onClose(); _onClose = null; }
}

function escClose(e) { if (e.key === 'Escape') close(); }

// ── Shell ─────────────────────────────────────────────────────────────────────

function shell() {
  return `
    <div class="fw-modal" role="dialog" aria-modal="true" aria-label="Finance It wizard">
      <div class="fw-header">
        <div class="fw-header-left">
          <h2 class="fw-title">💰 Finance It</h2>
          <div class="fw-progress" id="fwProgress"></div>
        </div>
        <button class="fw-close" id="fwClose" aria-label="Close wizard">×</button>
      </div>
      <div class="fw-body" id="fwBody"></div>
      <div class="fw-footer">
        <button class="fw-btn fw-btn-back" id="fwBack">← Back</button>
        <span class="fw-step-label" id="fwStepLabel"></span>
        <button class="fw-btn fw-btn-next" id="fwNext">Next →</button>
      </div>
    </div>`;
}

// ── Navigation ────────────────────────────────────────────────────────────────

function render() {
  updateChrome();
  const body = document.getElementById('fwBody');
  if (!body) return;
  switch (W.step) {
    case 1: body.innerHTML = step1HTML(); wireStep1(); break;
    case 2: body.innerHTML = step2HTML(); wireStep2(); break;
    case 3: body.innerHTML = step3HTML(); wireStep3(); break;
    case 4: body.innerHTML = step4HTML(); generateMemo(); break;
  }
}

function updateChrome() {
  const STEPS = ['Scope', 'Scenario', 'Structure', 'Results'];
  const prog = document.getElementById('fwProgress');
  if (prog) {
    prog.innerHTML = STEPS.map((s, i) =>
      `<span class="fw-ps ${W.step === i+1 ? 'fw-ps-active' : W.step > i+1 ? 'fw-ps-done' : ''}">${i+1}. ${s}</span>`
    ).join('');
  }

  const sl = document.getElementById('fwStepLabel');
  if (sl) sl.textContent = `Step ${W.step} of 4`;

  const back = document.getElementById('fwBack');
  const next = document.getElementById('fwNext');
  if (back) back.hidden = W.step === 1;
  if (next) {
    if (W.step === 4) {
      next.textContent = '↗ Export Brief';
      next.onclick = exportBrief;
    } else {
      next.textContent = W.step === 3 ? 'See Results →' : 'Next →';
      next.onclick = goNext;
    }
  }

  const backBtn = document.getElementById('fwBack');
  if (backBtn) backBtn.onclick = goBack;
}

function goNext() {
  if (!validate()) return;
  if (W.step < 4) { W.step++; render(); }
}

function goBack() {
  if (W.step > 1) { W.step--; render(); }
}

function validate() {
  if (W.step === 1 && W.scope !== 'greenfield' && W.selectedIds.size === 0) {
    showError('Select at least one project to continue.');
    return false;
  }
  if (W.step === 1 && W.scope === 'greenfield') {
    if (!W.greenfield.sectorId) { showError('Select a growth sector to continue.'); return false; }
    if (!W.greenfield.archetypeId) { showError('Select a project archetype to continue.'); return false; }
  }
  if (W.step === 3) {
    const sum = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      showError(`Tranche allocations must total 100%. Currently: ${sum.toFixed(1)}%.`);
      return false;
    }
  }
  return true;
}

function showError(msg) {
  let el = document.getElementById('fwError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fwError';
    el.className = 'fw-error';
    document.querySelector('.fw-footer')?.prepend(el);
  }
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { if (el) el.hidden = true; }, 3500);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function selectedAssets() {
  return _assets.filter(a => W.selectedIds.has(a.asset_id));
}

function greenfieldArchetype() {
  if (W.scope !== 'greenfield' || !_growthData) return null;
  const sector = _growthData.sectors.find(s => s.id === W.greenfield.sectorId);
  return sector?.archetypes.find(a => a.id === W.greenfield.archetypeId) ?? null;
}

function greenfieldTemplate() {
  const arch = greenfieldArchetype();
  if (!arch || !_growthData) return null;
  return _growthData.greenfield_templates.find(t => t.template_id === arch.template_id) ?? null;
}

function portfolioCost(path) {
  if (W.scope === 'greenfield') {
    const arch = greenfieldArchetype();
    return arch?.scale_usd_m ?? 0;
  }
  return selectedAssets().reduce((s, a) => s + (a.cost_paths?.[path]?.central_usd_m ?? 0), 0);
}

function fmtM(n) { return n != null ? `$${(+n).toLocaleString()}M` : '—'; }

// ── Step 1: Scope ─────────────────────────────────────────────────────────────

function step1HTML() {
  return `<div class="fw-step">
    <h3 class="fw-sh">What would you like to finance?</h3>
    <div class="fw-scope-row" id="fwScopeRow">
      ${scopeCard('single',     '🏗', 'One project',             'Finance a specific damaged asset')}
      ${scopeCard('group',      '🗂', 'Group of projects',       'Select by region or manually')}
      ${scopeCard('all',        '🇺🇦', 'Entire portfolio',        `All ${_assets.length} documented assets`)}
      ${scopeCard('greenfield', '🌱', 'Growth sector project',   'Model a new greenfield investment')}
    </div>
    <div id="fwScopeDetail"></div>
  </div>`;
}

function scopeCard(val, icon, label, desc) {
  return `<label class="fw-radio-card ${W.scope === val ? 'fw-rc-checked' : ''}">
    <input type="radio" name="scope" value="${val}" ${W.scope === val ? 'checked' : ''} class="fw-sr">
    <span class="fw-rc-icon">${icon}</span>
    <span class="fw-rc-label">${label}</span>
    <span class="fw-rc-desc">${desc}</span>
  </label>`;
}

function wireStep1() {
  document.querySelectorAll('input[name="scope"]').forEach(r => {
    r.addEventListener('change', e => {
      W.scope = e.target.value;
      if (W.scope === 'all') W.selectedIds = new Set(_assets.map(a => a.asset_id));
      else if (W.scope !== e.target.value) W.selectedIds = new Set();
      document.querySelectorAll('#fwScopeRow .fw-radio-card').forEach(c => c.classList.remove('fw-rc-checked'));
      e.target.closest('.fw-radio-card').classList.add('fw-rc-checked');
      renderScopeDetail();
    });
  });
  renderScopeDetail();
}

function renderScopeDetail() {
  const det = document.getElementById('fwScopeDetail');
  if (!det) return;

  if (W.scope === 'all') {
    W.selectedIds = new Set(_assets.map(a => a.asset_id));
    const total = _assets.reduce((s, a) => s + (a.cost_paths?.baseline?.central_usd_m ?? 0), 0);
    det.innerHTML = `<div class="fw-scope-summary"><strong>${_assets.length} assets</strong> across all documented regions — Baseline total: <strong>${fmtM(total)}</strong></div>`;
    return;
  }

  if (W.scope === 'single') {
    det.innerHTML = `
      <div class="fw-field-group">
        <label class="fw-label">Search projects</label>
        <input id="fwSearch" type="text" class="fw-input" placeholder="Type project name…" autocomplete="off">
      </div>
      <div id="fwProjList" class="fw-asset-list"></div>`;
    const inp = document.getElementById('fwSearch');
    inp.addEventListener('input', () => renderSingleList(inp.value));
    renderSingleList('');
    return;
  }

  // Greenfield growth sector
  if (W.scope === 'greenfield') {
    if (!_growthData) {
      det.innerHTML = `<p class="fw-scope-summary">Loading growth sector data…</p>`;
      loadGrowthSectors().then(d => { _growthData = d; renderScopeDetail(); }).catch(() => {
        det.innerHTML = `<p class="fw-scope-summary">Could not load growth sector data.</p>`;
      });
      return;
    }
    const peaceState = window._uvScenario?.peace_state ?? 'pre_armistice';
    det.innerHTML = renderWizardSectorPicker(_growthData, W.greenfield.sectorId, W.greenfield.archetypeId, peaceState);
    det.querySelectorAll('input[name="gsSector"]').forEach(r => {
      r.addEventListener('change', e => {
        W.greenfield.sectorId = e.target.value;
        W.greenfield.archetypeId = null;
        renderScopeDetail();
      });
    });
    det.querySelectorAll('input[name="gsArchetype"]').forEach(r => {
      r.addEventListener('change', e => {
        W.greenfield.archetypeId = e.target.value;
        det.querySelectorAll('.gs-arch-card').forEach(c => c.classList.remove('gs-arch-sel'));
        e.target.closest('.gs-arch-card').classList.add('gs-arch-sel');
      });
    });
    return;
  }

  // Group
  const oblasts = [...new Set(_assets.map(a => a.location?.oblast).filter(Boolean))].sort();
  det.innerHTML = `
    <div class="fw-group-bar">
      <div class="fw-field-group fw-fg-inline">
        <label class="fw-label">Region</label>
        <select id="fwOblastSel" class="fw-select fw-select-sm">
          <option value="">All regions</option>
          ${oblasts.map(o => `<option>${o}</option>`).join('')}
        </select>
      </div>
      <div class="fw-group-links">
        <button class="fw-link-btn" id="fwSelAll">Select all</button>
        <button class="fw-link-btn" id="fwClrAll">Clear all</button>
      </div>
    </div>
    <div id="fwGroupList" class="fw-asset-list"></div>
    <div class="fw-sel-count" id="fwSelCount">${W.selectedIds.size} selected</div>`;

  const oblSel = document.getElementById('fwOblastSel');
  oblSel.addEventListener('change', () => renderGroupList(oblSel.value));
  document.getElementById('fwSelAll').addEventListener('click', () => {
    _assets.filter(a => !oblSel.value || a.location?.oblast === oblSel.value).forEach(a => W.selectedIds.add(a.asset_id));
    renderGroupList(oblSel.value);
    updateSelCount();
  });
  document.getElementById('fwClrAll').addEventListener('click', () => {
    W.selectedIds.clear();
    renderGroupList(oblSel.value);
    updateSelCount();
  });
  renderGroupList('');
}

function updateSelCount() {
  const el = document.getElementById('fwSelCount');
  if (el) el.textContent = `${W.selectedIds.size} selected`;
}

function renderSingleList(q) {
  const list = document.getElementById('fwProjList');
  if (!list) return;
  const filtered = _assets.filter(a => {
    const name = (a.name?.en ?? a.asset_id).toLowerCase();
    return !q || name.includes(q.toLowerCase());
  }).slice(0, 25);
  list.innerHTML = filtered.map(a => {
    const name = a.name?.en ?? a.asset_id;
    const cost = a.cost_paths?.baseline?.central_usd_m;
    const sel = W.selectedIds.has(a.asset_id);
    return `<label class="fw-asset-row ${sel ? 'fw-ar-sel' : ''}">
      <input type="radio" name="singleProj" value="${a.asset_id}" ${sel ? 'checked' : ''} class="fw-sr">
      <span class="fw-ar-name">${name}</span>
      <span class="fw-ar-meta">${a.location?.oblast ?? ''} · ${cost != null ? fmtM(cost) : 'TBD'}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('input[name="singleProj"]').forEach(r => {
    r.addEventListener('change', e => {
      W.selectedIds = new Set([e.target.value]);
      list.querySelectorAll('.fw-asset-row').forEach(row => row.classList.remove('fw-ar-sel'));
      e.target.closest('.fw-asset-row').classList.add('fw-ar-sel');
    });
  });
}

function renderGroupList(oblast) {
  const list = document.getElementById('fwGroupList');
  if (!list) return;
  const filtered = _assets.filter(a => !oblast || a.location?.oblast === oblast);
  list.innerHTML = filtered.map(a => {
    const name = a.name?.en ?? a.asset_id;
    const cost = a.cost_paths?.baseline?.central_usd_m;
    const chk = W.selectedIds.has(a.asset_id);
    return `<label class="fw-asset-row ${chk ? 'fw-ar-sel' : ''}">
      <input type="checkbox" class="fw-grp-cb fw-sr" value="${a.asset_id}" ${chk ? 'checked' : ''}>
      <span class="fw-ar-name">${name}</span>
      <span class="fw-ar-meta">${a.location?.oblast ?? ''} · ${cost != null ? fmtM(cost) : 'TBD'}</span>
    </label>`;
  }).join('');
  list.querySelectorAll('.fw-grp-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      if (e.target.checked) W.selectedIds.add(e.target.value);
      else W.selectedIds.delete(e.target.value);
      e.target.closest('.fw-asset-row').classList.toggle('fw-ar-sel', e.target.checked);
      updateSelCount();
    });
  });
}

// ── Step 2: Scenario ──────────────────────────────────────────────────────────

function step2HTML() {
  if (W.scope === 'greenfield') return step2GreenfieldHTML();

  const sel = selectedAssets();
  const names = sel.map(a => a.name?.en ?? a.asset_id);
  const summary = sel.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${sel.length - 2} more`;
  const costs = { baseline: portfolioCost('baseline'), code_compliant: portfolioCost('code_compliant'), build_back_better: portfolioCost('build_back_better') };

  const pathCards = Object.keys(PATH_LABELS).map(k => `
    <label class="fw-radio-card fw-path-card ${W.path === k ? 'fw-rc-checked' : ''}">
      <input type="radio" name="path" value="${k}" ${W.path === k ? 'checked' : ''} class="fw-sr">
      <span class="fw-rc-label">${PATH_LABELS[k]}</span>
      <span class="fw-rc-desc">${PATH_DESC[k]}</span>
      <span class="fw-rc-cost">${costs[k] > 0 ? fmtM(costs[k]) : 'TBD'}</span>
    </label>`).join('');

  const timingCards = Object.keys(TIMING_LABELS).map(k => `
    <label class="fw-radio-card ${W.timing === k ? 'fw-rc-checked' : ''}">
      <input type="radio" name="timing" value="${k}" ${W.timing === k ? 'checked' : ''} class="fw-sr">
      <span class="fw-rc-label">${TIMING_LABELS[k]}</span>
      <span class="fw-rc-desc">${
        k === 'during' ? `⚡ +${WAR_PREMIUM}% wartime premium on commercial tranches` :
        k === 'after'  ? 'Normal rates; reparations available as a funding source' :
                         'Phased disbursement; reparations close the post-war tranche'
      }</span>
    </label>`).join('');

  return `<div class="fw-step">
    <h3 class="fw-sh">Cost path &amp; financing timeline</h3>
    <div class="fw-selection-pill">${sel.length} project${sel.length !== 1 ? 's' : ''}: ${summary}</div>
    <div class="fw-field-group">
      <label class="fw-label">Reconstruction path</label>
      <div class="fw-radio-row" id="fwPathRow">${pathCards}</div>
    </div>
    <div class="fw-field-group">
      <label class="fw-label">Financing timeline</label>
      <div class="fw-radio-row" id="fwTimingRow">${timingCards}</div>
    </div>
    ${W.timing !== 'during' ? `<div class="fw-info-note">Russian Reparations will be available as a tranche type in Step 3.</div>` : ''}
  </div>`;
}

function step2GreenfieldHTML() {
  // Auto-set path to baseline so downstream code that reads W.path does not break.
  W.path = 'baseline';

  const arch   = greenfieldArchetype();
  const sector = _growthData?.sectors.find(s => s.id === W.greenfield.sectorId);
  const tmpl   = greenfieldTemplate();

  const PEACE_LABELS_LOCAL = {
    pre_armistice:          { label: 'Available now',      cls: 'gs-gate-green' },
    post_armistice_fragile: { label: 'Post ceasefire',     cls: 'gs-gate-amber' },
    post_armistice_durable: { label: 'Durable peace only', cls: 'gs-gate-red'   },
    mixed:                  { label: 'Varies by oblast',   cls: 'gs-gate-amber' },
  };
  const gate = arch ? (PEACE_LABELS_LOCAL[arch.peace_state_gate] ?? PEACE_LABELS_LOCAL.mixed) : null;

  const summaryCard = arch && sector ? `
    <div class="fw-gf-summary-card">
      <div class="fw-gf-summary-header">
        <span class="fw-gf-icon">${sector.icon}</span>
        <div class="fw-gf-summary-titles">
          <span class="fw-gf-sector-name">${sector.label}</span>
          <span class="fw-gf-arch-name">${arch.label}</span>
        </div>
        <span class="gs-gate ${gate.cls} fw-gf-gate">${gate.label}</span>
      </div>
      <div class="fw-gf-summary-body">
        <p class="fw-gf-thesis">${sector.thesis_one_line}</p>
        <div class="fw-gf-meta-row">
          <span class="fw-gf-meta-item"><strong>Project scale:</strong> USD ${arch.scale_usd_m.toLocaleString()}M</span>
          <span class="fw-gf-meta-item"><strong>Capital structure template:</strong> ${arch.template_id}</span>
        </div>
        ${arch.scale_note ? `<p class="fw-gf-scale-note">${arch.scale_note}</p>` : ''}
        ${!tmpl ? `<p class="fw-gf-tmpl-warn">Note: financing template "${arch.template_id}" not found in growth_sectors.json — tranches will use wizard defaults.</p>` : ''}
      </div>
    </div>` : `<p class="fw-gf-no-arch">No archetype selected. Go back to Step 1.</p>`;

  const timingCards = Object.keys(TIMING_LABELS).map(k => `
    <label class="fw-radio-card ${W.timing === k ? 'fw-rc-checked' : ''}">
      <input type="radio" name="timing" value="${k}" ${W.timing === k ? 'checked' : ''} class="fw-sr">
      <span class="fw-rc-label">${TIMING_LABELS[k]}</span>
      <span class="fw-rc-desc">${
        k === 'during' ? `⚡ +${WAR_PREMIUM}% wartime premium on commercial tranches` :
        k === 'after'  ? 'Normal rates; reparations available as a funding source' :
                         'Phased disbursement; reparations close the post-war tranche'
      }</span>
    </label>`).join('');

  return `<div class="fw-step">
    <h3 class="fw-sh">Project overview &amp; financing timeline</h3>
    ${summaryCard}
    <div class="fw-field-group">
      <label class="fw-label">Financing timeline</label>
      <div class="fw-radio-row" id="fwTimingRow">${timingCards}</div>
    </div>
    ${W.timing !== 'during' ? `<div class="fw-info-note">Russian Reparations will be available as a tranche type in Step 3.</div>` : ''}
  </div>`;
}

function wireStep2() {
  document.querySelectorAll('input[name="path"]').forEach(r => {
    r.addEventListener('change', e => {
      W.path = e.target.value;
      document.querySelectorAll('#fwPathRow .fw-radio-card').forEach(c => c.classList.remove('fw-rc-checked'));
      e.target.closest('.fw-radio-card').classList.add('fw-rc-checked');
    });
  });
  document.querySelectorAll('input[name="timing"]').forEach(r => {
    r.addEventListener('change', e => {
      W.timing = e.target.value;
      document.querySelectorAll('#fwTimingRow .fw-radio-card').forEach(c => c.classList.remove('fw-rc-checked'));
      e.target.closest('.fw-radio-card').classList.add('fw-rc-checked');
      render();  // refresh to show/hide reparations note
    });
  });
}

// ── Step 3: Tranche builder ───────────────────────────────────────────────────

function step3HTML() {
  const total = portfolioCost(W.path);
  const sumPct = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
  const blended = W.tranches.reduce((s, t) => s + (+t.pct || 0) * (+t.ret || 0), 0) / 100;
  const grantPct = W.tranches.filter(t => t.type === 'grant' || t.type === 'reparations').reduce((s, t) => s + (+t.pct || 0), 0);
  const privPct  = W.tranches.filter(t => COMMERCIAL_TYPES.has(t.type)).reduce((s, t) => s + (+t.pct || 0), 0);
  const mobRatio = grantPct > 0 ? (privPct / grantPct).toFixed(1) + '×' : 'n/a';
  const ok = Math.abs(sumPct - 100) <= 0.5;

  return `<div class="fw-step">
    <h3 class="fw-sh">Build your financing structure</h3>
    ${W.timing === 'during' ? `<div class="fw-war-note">⚡ Wartime: +${WAR_PREMIUM}% applied to commercial tranches in Results.</div>` : ''}
    <div class="fw-tranche-hdr">
      <span class="fw-total-lbl">Total cost: <strong>${fmtM(total)}</strong> (${PATH_LABELS[W.path]})</span>
      <span class="fw-alloc-sum ${ok ? 'fw-alloc-ok' : 'fw-alloc-warn'}" id="fwAllocSum">Allocated: ${sumPct.toFixed(0)}%</span>
    </div>
    ${allocBar(total)}
    <div id="fwTranches">${W.tranches.map(t => trancheRowHTML(t, total)).join('')}</div>
    ${W.tranches.length < 5 ? `<button class="fw-add-tranche" id="fwAddTranche">+ Add tranche</button>` : ''}
    <div class="fw-metrics-row">
      <div class="fw-mini-metric"><span class="fw-mm-val">${blended.toFixed(2)}%</span><span class="fw-mm-lbl">Blended cost of capital</span></div>
      <div class="fw-mini-metric"><span class="fw-mm-val">${mobRatio}</span><span class="fw-mm-lbl">Private mobilisation ratio</span></div>
    </div>
  </div>`;
}

function allocBar(total) {
  const sumPct = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
  const segs = W.tranches.map(t => {
    const def = TRANCHE_DEFS[t.type] ?? TRANCHE_DEFS.equity;
    return `<div class="fw-bar-seg" style="width:${+t.pct||0}%;background:${def.col}" title="${def.label}: ${t.pct}%"></div>`;
  }).join('');
  const gap = Math.max(0, 100 - sumPct);
  const gapSeg = gap > 0.5 ? `<div class="fw-bar-seg fw-bar-gap" style="width:${gap}%" title="Unfunded gap: ${gap.toFixed(1)}%"></div>` : '';
  return `<div class="fw-alloc-bar">${segs}${gapSeg}</div>`;
}

function trancheRowHTML(t, total) {
  const def = TRANCHE_DEFS[t.type] ?? TRANCHE_DEFS.equity;
  const pct = +t.pct || 0;
  const isTrustMode = _trustModes.get(t.id) === 'trust';

  // For Trust-mode reparations tranches, show Annual payment instead of % of project
  const annualTrust = trustAnnualPayment_usd_m();
  const trustAmt    = total > 0 ? (total * pct / 100).toFixed(1) : '—';
  const displayAmt  = isTrustMode
    ? `Annual: $${annualTrust.toLocaleString()}M/yr`
    : `$${total > 0 ? (total * pct / 100).toFixed(1) : '—'}M`;

  const repNote = t.type === 'reparations' && total > 0 ? (() => {
    const repAmt = total * pct / 100;
    return `<div class="fw-rep-note">= ${(repAmt / KSE_CLAIM_USD_M * 100).toFixed(3)}% of $486B KSE claim · ${(repAmt / FROZEN_USD_M * 100).toFixed(3)}% of $300B frozen assets</div>`;
  })() : '';

  // Trust toggle: only shown when tranche is 'reparations' AND timing allows reparations
  const showTrustToggle = t.type === 'reparations' && W.timing !== 'during';
  const trustToggleHTML = showTrustToggle ? `
    <div class="fw-trust-toggle-row">
      <div class="fw-trust-mode-btns">
        <button type="button" class="fw-trust-mode-btn ${!isTrustMode ? 'active' : ''}"
                data-trust-id="${t.id}" data-trust-mode="lump_sum">
          Lump-sum reparations
        </button>
        <button type="button" class="fw-trust-mode-btn ${isTrustMode ? 'active' : ''}"
                data-trust-id="${t.id}" data-trust-mode="trust">
          Trust availability payment
        </button>
      </div>
      ${isTrustMode ? `
        <div class="fw-trust-computed">
          Annual payment: <strong>USD ${annualTrust.toLocaleString()}M/yr</strong>
          <span style="font-size:0.72rem;color:var(--colour-text-muted)">(4% drawdown · USD 286B corpus)</span>
        </div>
        <p class="fw-trust-note">
          This replaces a single capital contribution with an annual cashflow.
          Useful for debt service rather than equity injection.
          <a href="/trust.html" target="_blank" rel="noopener">See Trust model ↗</a>
        </p>` : ''}
    </div>` : '';

  const typeOptions = Object.entries(TRANCHE_DEFS).map(([k, v]) =>
    `<option value="${k}" ${k === t.type ? 'selected' : ''}>${v.label}</option>`).join('');

  return `<div class="fw-tranche-row" data-id="${t.id}">
    <div class="fw-tr-dot" style="background:${def.col}"></div>
    <div class="fw-tr-fields">
      <div style="display:flex;align-items:center;gap:0.3rem">
        <select class="fw-select fw-tr-type" data-id="${t.id}">${typeOptions}</select>${confidenceBadge(t.type)}
      </div>
      <div class="fw-tr-nums">
        <label class="fw-tr-lbl">Allocation
          <div class="fw-tr-input-wrap">
            <input class="fw-input fw-tr-num fw-tr-pct" type="number" min="0" max="100" step="1" value="${pct}" data-id="${t.id}" data-field="pct">
            <span class="fw-tr-unit">%</span>
          </div>
        </label>
        <label class="fw-tr-lbl">Return
          <div class="fw-tr-input-wrap">
            <input class="fw-input fw-tr-num fw-tr-ret" type="number" min="0" max="50" step="0.1" value="${+t.ret}" data-id="${t.id}" data-field="ret">
            <span class="fw-tr-unit">%</span>
          </div>
        </label>
        ${def.tenor != null ? `<label class="fw-tr-lbl">Tenor
          <div class="fw-tr-input-wrap">
            <input class="fw-input fw-tr-num fw-tr-ten" type="number" min="1" max="40" step="1" value="${t.tenor ?? def.tenor}" data-id="${t.id}" data-field="tenor">
            <span class="fw-tr-unit">yr</span>
          </div>
        </label>` : ''}
        <span class="fw-tr-amt">${displayAmt}</span>
      </div>
      ${repNote}
      ${trustToggleHTML}
    </div>
    <button class="fw-tr-remove" data-id="${t.id}" aria-label="Remove tranche">×</button>
  </div>`;
}

function seedGreenfieldTranches() {
  const tmpl = greenfieldTemplate();
  if (!tmpl) return;  // no template found; leave existing tranches

  // Mapping: template field → tranche type (and optional label override)
  // first_loss_pct absorbed into eu_concessional (blended first-loss facility)
  // diaspora_pct mapped to equity with label override
  const rows = [];
  let nextId = 1;

  function addRow(type, pct, labelOverride) {
    const def = TRANCHE_DEFS[type] ?? TRANCHE_DEFS.equity;
    rows.push({
      id: nextId++,
      type,
      pct,
      ret: def.ret,
      tenor: def.tenor,
      ...(labelOverride ? { _labelOverride: labelOverride } : {}),
    });
  }

  // grant_pct → grant
  if (tmpl.grant_pct > 0) addRow('grant', tmpl.grant_pct);

  // era_pct → reparations (only if > 0)
  if (tmpl.era_pct > 0) addRow('reparations', tmpl.era_pct);

  // first_loss_pct → eu_concessional (absorbed into blended concessional layer)
  const concPct = (tmpl.concessional_pct || 0) + (tmpl.first_loss_pct || 0);
  if (concPct > 0) addRow('eu_concessional', concPct);

  // senior_ifi_pct → world_bank (only if > 0)
  if (tmpl.senior_ifi_pct > 0) addRow('world_bank', tmpl.senior_ifi_pct);

  // eca_pct → eca_guarantee (only if > 0)
  if (tmpl.eca_pct > 0) addRow('eca_guarantee', tmpl.eca_pct);

  // dfi_equity_pct + public_equity_pct → equity (merge if both > 0)
  const dfiEq  = tmpl.dfi_equity_pct    || 0;
  const pubEq  = tmpl.public_equity_pct  || 0;
  const privEq = tmpl.private_equity_pct || 0;
  const diasEq = tmpl.diaspora_pct       || 0;

  if (dfiEq > 0 && pubEq > 0) {
    addRow('equity', dfiEq + pubEq, 'Public/DFI Equity');
  } else if (dfiEq > 0) {
    addRow('equity', dfiEq, 'DFI Equity');
  } else if (pubEq > 0) {
    addRow('equity', pubEq);
  }

  // private_equity_pct → equity (only if > 0)
  if (privEq > 0) addRow('equity', privEq, 'Private Equity');

  // diaspora_pct → equity with label override (only if > 0)
  if (diasEq > 0) addRow('equity', diasEq, 'Diaspora Capital');

  // commercial_bank_debt_pct → senior_debt (only if > 0)
  if (tmpl.commercial_bank_debt_pct > 0) addRow('senior_debt', tmpl.commercial_bank_debt_pct);

  // institutional_debt_pct → mezzanine (only if > 0)
  if (tmpl.institutional_debt_pct > 0) addRow('mezzanine', tmpl.institutional_debt_pct);

  if (rows.length === 0) return;  // nothing to seed

  W.tranches = rows;
  W.nextId   = nextId;
  W._greenfieldTranchesSeed = true;
}

function wireStep3() {
  // Seed tranches from greenfield template on first entry to Step 3
  if (W.scope === 'greenfield' && !W._greenfieldTranchesSeed) {
    seedGreenfieldTranches();
  }

  document.getElementById('fwAddTranche')?.addEventListener('click', () => {
    W.tranches.push({ id: W.nextId++, type: 'equity', pct: 0, ret: 18, tenor: null });
    render();
  });

  document.querySelectorAll('.fw-tr-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = +e.currentTarget.dataset.id;
      if (W.tranches.length <= 1) return;
      W.tranches = W.tranches.filter(t => t.id !== id);
      render();
    });
  });

  document.querySelectorAll('.fw-tr-type').forEach(sel => {
    sel.addEventListener('change', e => {
      const id = +e.target.dataset.id;
      const tr = W.tranches.find(t => t.id === id);
      if (!tr) return;
      tr.type  = e.target.value;
      const def = TRANCHE_DEFS[e.target.value];
      tr.ret   = def.ret;
      tr.tenor = def.tenor;
      render();
    });
  });

  document.querySelectorAll('[data-field]').forEach(inp => {
    if (!inp.dataset.id) return;
    inp.addEventListener('input', e => {
      const id    = +e.target.dataset.id;
      const field = e.target.dataset.field;
      const tr    = W.tranches.find(t => t.id === id);
      if (!tr) return;
      tr[field] = parseFloat(e.target.value) || 0;
      // Lightweight live update: only refresh header + bar
      const total  = portfolioCost(W.path);
      const sumPct = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
      const ok     = Math.abs(sumPct - 100) <= 0.5;
      const allocEl = document.getElementById('fwAllocSum');
      if (allocEl) {
        allocEl.textContent = `Allocated: ${sumPct.toFixed(0)}%`;
        allocEl.className = `fw-alloc-sum ${ok ? 'fw-alloc-ok' : 'fw-alloc-warn'}`;
      }
      const barEl = document.querySelector('.fw-alloc-bar');
      if (barEl) barEl.outerHTML = allocBar(total);
    });
  });

  // Trust mode toggle buttons
  document.querySelectorAll('[data-trust-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id   = +e.currentTarget.dataset.trustId;
      const mode = e.currentTarget.dataset.trustMode;
      _trustModes.set(id, mode);
      render();
    });
  });
}

// ── Step 4: Results ───────────────────────────────────────────────────────────

function computeResults() {
  const sel   = selectedAssets();
  const total = portfolioCost(W.path);
  const low   = sel.reduce((s, a) => s + (a.cost_paths?.[W.path]?.low_usd_m  ?? 0), 0);
  const high  = sel.reduce((s, a) => s + (a.cost_paths?.[W.path]?.high_usd_m ?? 0), 0);
  const isDuring = W.timing === 'during' || W.timing === 'phased';

  const tranches = W.tranches.map(t => {
    const def  = TRANCHE_DEFS[t.type] ?? TRANCHE_DEFS.equity;
    const pct  = +t.pct || 0;
    const amt  = total * pct / 100;
    const effR = (+t.ret || 0) + (COMMERCIAL_TYPES.has(t.type) && isDuring ? WAR_PREMIUM : 0);
    return { ...t, def, pct, amt, effR, annualCost: amt * effR / 100 };
  });

  const grantAmt  = tranches.filter(t => t.type === 'grant').reduce((s, t) => s + t.amt, 0);
  const concAmt   = tranches.filter(t => CONCESSIONAL_TYPES.has(t.type)).reduce((s, t) => s + t.amt, 0);
  const privAmt   = tranches.filter(t => COMMERCIAL_TYPES.has(t.type)).reduce((s, t) => s + t.amt, 0);
  const repAmt    = tranches.filter(t => t.type === 'reparations').reduce((s, t) => s + t.amt, 0);
  const blended   = tranches.reduce((s, t) => s + t.pct * t.effR, 0) / 100;
  const debtSvc   = tranches.filter(t => t.type !== 'grant' && t.type !== 'reparations').reduce((s, t) => s + t.annualCost, 0);
  const pubTotal  = grantAmt + concAmt;
  const mobRatio  = grantAmt > 0 ? (privAmt / grantAmt).toFixed(1) : null;
  const warExtra  = isDuring ? tranches.filter(t => COMMERCIAL_TYPES.has(t.type)).reduce((s, t) => s + t.amt * WAR_PREMIUM / 100, 0) : 0;

  return {
    sel, total, low, high, tranches,
    grantAmt, concAmt, privAmt, repAmt, pubTotal,
    blended, debtSvc, mobRatio, warExtra,
    repPctClaim:  repAmt / KSE_CLAIM_USD_M * 100,
    repPctFrozen: repAmt / FROZEN_USD_M   * 100,
    duringSupport: W.timing === 'after' ? 0 : pubTotal,
    postSupport:   W.timing === 'during' ? 0 : pubTotal,
  };
}

function step4HTML() {
  if (W.scope === 'greenfield') return step4GreenfieldHTML();

  const r = computeResults();

  const trancheRows = r.tranches.map(t => {
    const warTag = COMMERCIAL_TYPES.has(t.type) && (W.timing === 'during' || W.timing === 'phased')
      ? `<span class="fw-war-tag">+${WAR_PREMIUM}% war</span>` : '';
    const isTrustMode = t.type === 'reparations' && _trustModes.get(t.id) === 'trust';
    const trustLabel  = isTrustMode
      ? ` <span class="trust-annual-chip">Annual: USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr †</span>`
      : '';
    const displayPct  = isTrustMode ? '—' : `${t.pct.toFixed(0)}%`;
    const displayAmt  = isTrustMode ? `USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr` : fmtM(t.amt.toFixed(1));
    return `<tr>
      <td><span class="fw-type-dot" style="background:${t.def.col}"></span>${isTrustMode ? 'ERA/Trust — Availability Payment' : t.def.label}${confidenceBadge(t.type)}${trustLabel}</td>
      <td>${displayPct}</td>
      <td>${displayAmt}</td>
      <td>${t.effR.toFixed(1)}% ${warTag}</td>
      <td>${t.tenor ?? '—'}</td>
    </tr>`;
  }).join('');

  const repSection = r.repAmt > 0 && W.timing !== 'during' ? `
    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Russian reparations scenario</h4>
      <p class="fw-rep-ctx">Source: KSE Institute "Russia Will Pay" ($486B total claim); G7-frozen assets ~$300B.</p>
      <div class="fw-rep-bar-wrap">
        <div class="fw-rep-bar-track">
          <div class="fw-rep-bar-fill" style="width:${Math.min(r.repPctFrozen, 100).toFixed(3)}%"></div>
        </div>
        <div class="fw-rep-bar-labels">
          <span>This portfolio: ${fmtM(r.repAmt.toFixed(0))}</span>
          <span>Frozen assets: $300B</span>
        </div>
      </div>
      <div class="fw-rep-stats">
        <span><strong>${r.repPctClaim.toFixed(3)}%</strong> of $486B claim</span>
        <span><strong>${r.repPctFrozen.toFixed(3)}%</strong> of $300B frozen</span>
      </div>
    </div>` : '';

  return `<div class="fw-step fw-results">
    <h3 class="fw-sh">Financing structure analysis</h3>
    <div class="fw-results-meta">${r.sel.length} project${r.sel.length !== 1 ? 's' : ''} · ${PATH_LABELS[W.path]} · ${TIMING_LABELS[W.timing]}</div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Portfolio cost</h4>
      <div class="fw-cost-display">
        <span class="fw-cost-central">${fmtM(r.total)} <span class="fw-cost-lbl">central</span></span>
        <span class="fw-cost-range">Range: ${fmtM(r.low)} – ${fmtM(r.high)}</span>
      </div>
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Capital stack</h4>
      ${allocBar(r.total)}
      <table class="fw-results-table">
        <thead><tr><th>Tranche</th><th>%</th><th>Amount</th><th>Return</th><th>Tenor</th></tr></thead>
        <tbody>${trancheRows}</tbody>
      </table>
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Key metrics</h4>
      <div class="fw-metrics-grid">
        <div class="fw-mc"><span class="fw-mc-val">${r.blended.toFixed(2)}%</span><span class="fw-mc-lbl">Blended cost of capital</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.pubTotal.toFixed(0))}</span><span class="fw-mc-lbl">Public support needed</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.grantAmt.toFixed(0))}</span><span class="fw-mc-lbl">Grant requirement</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.debtSvc.toFixed(1))}/yr</span><span class="fw-mc-lbl">Annual debt service</span></div>
        ${r.mobRatio ? `<div class="fw-mc fw-mc-hl"><span class="fw-mc-val">${r.mobRatio}×</span><span class="fw-mc-lbl">Private mobilisation ratio</span></div>` : ''}
      </div>
      ${r.mobRatio ? `<p class="fw-mob-note">For every $1 of grant, this structure mobilises <strong>$${r.mobRatio}</strong> of private capital.</p>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Support needed by phase</h4>
      <div class="fw-support-row">
        <div class="fw-support-card fw-sc-during">
          <span class="fw-sc-lbl">⚡ During war</span>
          <span class="fw-sc-val">${fmtM(r.duringSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'after' ? 'Deferred to post-war' : 'Grants + concessional required now'}</span>
        </div>
        <div class="fw-support-card fw-sc-after">
          <span class="fw-sc-lbl">🕊 Post-war</span>
          <span class="fw-sc-val">${fmtM(r.postSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'during' ? 'Not modelled' : 'Requires peace settlement'}</span>
        </div>
      </div>
      ${r.warExtra > 0 ? `<p class="fw-war-note">⚡ Wartime premium adds +${fmtM(r.warExtra.toFixed(1))}/yr to annual debt service.</p>` : ''}
    </div>

    ${repSection}

    ${r.tranches.some(t => t.type === 'reparations' && _trustModes.get(t.id) === 'trust') ? `
    <div class="fw-disclaimer trust-footnote">
      † ERA/Trust replaces a lump-sum Russian reparations tranche with annual availability payments
      from a Reconstruction Trust (4% drawdown · USD 286B corpus · ~USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr).
      Annual payment services concessional debt rather than acting as an equity injection.
      <a href="/trust.html" target="_blank" rel="noopener">See full Trust model and corpus trajectory →</a>
    </div>` : ''}

    <div class="fw-disclaimer">
      Cost and financing figures are estimates derived from published benchmarks (RDNA3, KSE Institute). Not guarantees, procurement quotes, or substitutes for transaction-level due diligence.
    </div>

    <!-- AI memo (loaded asynchronously after render) -->
    <div class="fw-results-sect" id="fwMemoSection">
      <h4 class="fw-results-h4">Financing memo</h4>
      <div id="fwMemoContent" class="fw-memo-loading">
        <span class="fw-memo-spinner"></span> Generating institutional financing memo…
      </div>
    </div>

    <div class="fw-results-sect fw-growth-placeholder">
      <h4 class="fw-results-h4">Growth restoration</h4>
      <p class="fw-growth-note">
        Pre-war GDP by sector data not yet loaded. Once added to <code>data/sector_gdp_prewar.json</code>,
        this section will show investment required to restore each sector to its pre-2022 growth trajectory.
      </p>
    </div>
  </div>`;
}

function step4GreenfieldHTML() {
  const r      = computeResults();
  const arch   = greenfieldArchetype();
  const sector = _growthData?.sectors.find(s => s.id === W.greenfield.sectorId);
  const tmpl   = greenfieldTemplate();

  const memoTitle = arch && sector
    ? `${sector.icon} ${arch.label} — Financing Memo`
    : 'Greenfield Project — Financing Memo';

  const trancheRows = r.tranches.map(t => {
    const warTag = COMMERCIAL_TYPES.has(t.type) && (W.timing === 'during' || W.timing === 'phased')
      ? `<span class="fw-war-tag">+${WAR_PREMIUM}% war</span>` : '';
    const isTrustMode = t.type === 'reparations' && _trustModes.get(t.id) === 'trust';
    const trustLabel  = isTrustMode
      ? ` <span class="trust-annual-chip">Annual: USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr †</span>`
      : '';
    // Use _labelOverride for seeded greenfield tranches if present
    const trancheLabel = t._labelOverride ?? (isTrustMode ? 'ERA/Trust — Availability Payment' : t.def.label);
    const displayPct   = isTrustMode ? '—' : `${t.pct.toFixed(0)}%`;
    const displayAmt   = isTrustMode ? `USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr` : fmtM(t.amt.toFixed(1));
    return `<tr>
      <td><span class="fw-type-dot" style="background:${t.def.col}"></span>${trancheLabel}${confidenceBadge(t.type)}${trustLabel}</td>
      <td>${displayPct}</td>
      <td>${displayAmt}</td>
      <td>${t.effR.toFixed(1)}% ${warTag}</td>
      <td>${t.tenor ?? '—'}</td>
    </tr>`;
  }).join('');

  const repSection = r.repAmt > 0 && W.timing !== 'during' ? `
    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Russian reparations scenario</h4>
      <p class="fw-rep-ctx">Source: KSE Institute "Russia Will Pay" ($486B total claim); G7-frozen assets ~$300B.</p>
      <div class="fw-rep-bar-wrap">
        <div class="fw-rep-bar-track">
          <div class="fw-rep-bar-fill" style="width:${Math.min(r.repPctFrozen, 100).toFixed(3)}%"></div>
        </div>
        <div class="fw-rep-bar-labels">
          <span>This project: ${fmtM(r.repAmt.toFixed(0))}</span>
          <span>Frozen assets: $300B</span>
        </div>
      </div>
      <div class="fw-rep-stats">
        <span><strong>${r.repPctClaim.toFixed(3)}%</strong> of $486B claim</span>
        <span><strong>${r.repPctFrozen.toFixed(3)}%</strong> of $300B frozen</span>
      </div>
    </div>` : '';

  return `<div class="fw-step fw-results fw-results-greenfield">
    <h3 class="fw-sh">${memoTitle}</h3>
    <div class="fw-results-meta">Greenfield ${sector ? sector.label : ''} · ${TIMING_LABELS[W.timing]}</div>

    ${sector ? `<p class="fw-gf-results-thesis">${sector.thesis_one_line}</p>` : ''}

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Project type &amp; scale</h4>
      <div class="fw-cost-display">
        <span class="fw-cost-central">${fmtM(r.total)} <span class="fw-cost-lbl">fixed project scale</span></span>
      </div>
      <p class="fw-gf-type-note">Project type: Greenfield ${sector ? sector.label : ''}</p>
      ${tmpl ? `<p class="fw-gf-tmpl-note">Capital structure pre-populated from uVidNova greenfield template ${tmpl.template_id}. Adjust tranches in Step 3.</p>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Capital stack</h4>
      ${allocBar(r.total)}
      <table class="fw-results-table">
        <thead><tr><th>Tranche</th><th>%</th><th>Amount</th><th>Return</th><th>Tenor</th></tr></thead>
        <tbody>${trancheRows}</tbody>
      </table>
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Key metrics</h4>
      <div class="fw-metrics-grid">
        <div class="fw-mc"><span class="fw-mc-val">${r.blended.toFixed(2)}%</span><span class="fw-mc-lbl">Blended cost of capital</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.pubTotal.toFixed(0))}</span><span class="fw-mc-lbl">Public support needed</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.grantAmt.toFixed(0))}</span><span class="fw-mc-lbl">Grant requirement</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.debtSvc.toFixed(1))}/yr</span><span class="fw-mc-lbl">Annual debt service</span></div>
        ${r.mobRatio ? `<div class="fw-mc fw-mc-hl"><span class="fw-mc-val">${r.mobRatio}×</span><span class="fw-mc-lbl">Private mobilisation ratio</span></div>` : ''}
      </div>
      ${r.mobRatio ? `<p class="fw-mob-note">For every $1 of grant, this structure mobilises <strong>$${r.mobRatio}</strong> of private capital.</p>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">Support needed by phase</h4>
      <div class="fw-support-row">
        <div class="fw-support-card fw-sc-during">
          <span class="fw-sc-lbl">⚡ During war</span>
          <span class="fw-sc-val">${fmtM(r.duringSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'after' ? 'Deferred to post-war' : 'Grants + concessional required now'}</span>
        </div>
        <div class="fw-support-card fw-sc-after">
          <span class="fw-sc-lbl">🕊 Post-war</span>
          <span class="fw-sc-val">${fmtM(r.postSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'during' ? 'Not modelled' : 'Requires peace settlement'}</span>
        </div>
      </div>
      ${r.warExtra > 0 ? `<p class="fw-war-note">⚡ Wartime premium adds +${fmtM(r.warExtra.toFixed(1))}/yr to annual debt service.</p>` : ''}
    </div>

    ${repSection}

    ${r.tranches.some(t => t.type === 'reparations' && _trustModes.get(t.id) === 'trust') ? `
    <div class="fw-disclaimer trust-footnote">
      † ERA/Trust replaces a lump-sum Russian reparations tranche with annual availability payments
      from a Reconstruction Trust (4% drawdown · USD 286B corpus · ~USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr).
      Annual payment services concessional debt rather than acting as an equity injection.
      <a href="/trust.html" target="_blank" rel="noopener">See full Trust model and corpus trajectory →</a>
    </div>` : ''}

    <div class="fw-disclaimer">
      Project scale and capital structure are indicative estimates pre-populated from the uVidNova greenfield template library. Not guarantees, procurement quotes, or substitutes for transaction-level due diligence.
    </div>

    <!-- AI memo (loaded asynchronously after render) -->
    <div class="fw-results-sect" id="fwMemoSection">
      <h4 class="fw-results-h4">Financing memo</h4>
      <div id="fwMemoContent" class="fw-memo-loading">
        <span class="fw-memo-spinner"></span> Generating institutional financing memo…
      </div>
    </div>
  </div>`;
}

// ── AI memo generation ────────────────────────────────────────────────────────

async function generateMemo() {
  const r = computeResults();
  const memoEl = document.getElementById('fwMemoContent');
  if (!memoEl) return;

  let payload, prompt;

  if (W.scope === 'greenfield') {
    const arch   = greenfieldArchetype();
    const sector = _growthData?.sectors.find(s => s.id === W.greenfield.sectorId);
    const tmpl   = greenfieldTemplate();

    payload = {
      project_type:              'Greenfield',
      sector:                    sector?.label ?? W.greenfield.sectorId,
      archetype:                 arch?.label ?? W.greenfield.archetypeId,
      thesis_one_line:           sector?.thesis_one_line ?? null,
      capital_structure_template: arch?.template_id ?? null,
      project_scale_usd_m:       r.total,
      timing:                    TIMING_LABELS[W.timing],
      tranches: r.tranches.map(t => ({
        type:               t._labelOverride ?? t.def.label,
        allocation_pct:     t.pct,
        amount_usd_m:       +t.amt.toFixed(1),
        required_return_pct: t.effR,
        tenor_yr:           t.tenor ?? null,
      })),
      blended_coc_pct:             +r.blended.toFixed(2),
      public_support_usd_m:        +r.pubTotal.toFixed(0),
      grant_requirement_usd_m:     +r.grantAmt.toFixed(0),
      annual_debt_service_usd_m:   +r.debtSvc.toFixed(1),
      private_mobilisation_ratio:  r.mobRatio ? +r.mobRatio : null,
      support_during_war_usd_m:    +r.duringSupport.toFixed(0),
      support_post_war_usd_m:      +r.postSupport.toFixed(0),
      reparations_usd_m:           r.repAmt > 0 ? +r.repAmt.toFixed(0) : null,
    };

    prompt = `You are a development finance analyst writing for an institutional investment committee.

Generate a concise 3-paragraph financing memo based ONLY on the figures below. Do NOT invent any numbers or assumptions not in this payload. If a metric is null, omit it.

FINANCING PAYLOAD:
${JSON.stringify(payload, null, 2)}

Structure:
1. Investment thesis — one sentence stating the greenfield project, its sector, and its strategic rationale for Ukraine's reconstruction.
2. Financing structure — describe the capital stack, blended cost of capital, public support requirement, and what the private mobilisation ratio implies for this greenfield archetype.
3. Key risks and timing — address the peace-state dependency and wartime execution risk, the during-war vs post-war public support split, and any reparations dependency. Close with a sentence on the next step for a prospective financier.

Write in formal, economical prose. No bullet points. No markdown formatting.`;
  } else {
    payload = {
      portfolio: r.sel.map(a => a.name?.en ?? a.asset_id).join(', '),
      path: PATH_LABELS[W.path],
      timing: TIMING_LABELS[W.timing],
      total_cost_central_usd_m: r.total,
      cost_range_low_usd_m: r.low,
      cost_range_high_usd_m: r.high,
      tranches: r.tranches.map(t => ({
        type: t.def.label,
        allocation_pct: t.pct,
        amount_usd_m: +t.amt.toFixed(1),
        required_return_pct: t.effR,
        tenor_yr: t.tenor ?? null,
      })),
      blended_coc_pct: +r.blended.toFixed(2),
      public_support_usd_m: +r.pubTotal.toFixed(0),
      grant_requirement_usd_m: +r.grantAmt.toFixed(0),
      annual_debt_service_usd_m: +r.debtSvc.toFixed(1),
      private_mobilisation_ratio: r.mobRatio ? +r.mobRatio : null,
      support_during_war_usd_m: +r.duringSupport.toFixed(0),
      support_post_war_usd_m: +r.postSupport.toFixed(0),
      reparations_usd_m: r.repAmt > 0 ? +r.repAmt.toFixed(0) : null,
      reparations_pct_kse_claim: r.repAmt > 0 ? +r.repPctClaim.toFixed(3) : null,
      reparations_pct_frozen: r.repAmt > 0 ? +r.repPctFrozen.toFixed(3) : null,
    };

    prompt = `You are a development finance analyst writing for an institutional investment committee.

Generate a concise 3-paragraph financing memo based ONLY on the figures below. Do NOT invent any numbers or assumptions not in this payload. If a metric is null, omit it.

FINANCING PAYLOAD:
${JSON.stringify(payload, null, 2)}

Structure:
1. Investment thesis — one sentence stating the project/portfolio and its strategic rationale.
2. Financing structure — describe the capital stack, blended cost of capital, public support requirement, and what the private mobilisation ratio implies.
3. Key risks and timing — address wartime execution risk, the during-war vs post-war public support split, and any reparations dependency. Close with a sentence on the next step for a prospective financier.

Write in formal, economical prose. No bullet points. No markdown formatting.`;
  }

  try {
    const res  = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok || !data.message) throw new Error(data.error ?? 'No response');
    const text = data.message.content ?? data.message;
    if (memoEl) {
      memoEl.className = 'fw-memo-text';
      memoEl.textContent = text;
    }
  } catch (err) {
    if (memoEl) {
      memoEl.className = 'fw-memo-error';
      memoEl.textContent = `Memo unavailable: ${err.message}. You can still download the numeric brief above.`;
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportBrief() {
  const r = computeResults();
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>uVidNova Financing Brief — ${date}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1.5rem;color:#1a1d23;font-size:14px}
  h1{font-size:1.5rem;color:#1a3a6b;margin:0 0 .25rem}
  h2{font-size:.9rem;color:#1a3a6b;margin:1.5rem 0 .4rem;padding-bottom:.3rem;border-bottom:2px solid #eee;text-transform:uppercase;letter-spacing:.04em}
  .meta{font-size:.8rem;color:#5a6272;margin-bottom:1.5rem}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin:.5rem 0 1rem}
  th,td{padding:.35rem .5rem;border:1px solid #d0d8e8;text-align:left}
  th{background:#f4f6f9;font-weight:600}
  .metrics{display:flex;flex-wrap:wrap;gap:.75rem;margin:.5rem 0 1rem}
  .metric{padding:.6rem .9rem;border:1px solid #d0d8e8;border-radius:8px;min-width:130px}
  .metric .val{font-size:1.1rem;font-weight:700;color:#1a3a6b;display:block}
  .metric .lbl{font-size:.7rem;color:#5a6272;text-transform:uppercase;letter-spacing:.04em}
  .support{display:flex;gap:1rem;margin:.5rem 0 1rem}
  .support-card{flex:1;padding:.75rem;border:1px solid #d0d8e8;border-radius:8px}
  .support-card .val{font-size:1.2rem;font-weight:700;display:block;margin:.2rem 0}
  .support-card .lbl{font-size:.75rem;font-weight:600;text-transform:uppercase}
  .support-card .note{font-size:.72rem;color:#5a6272}
  .disclaimer{font-size:.72rem;color:#888;border:1px solid #eee;padding:.6rem;border-radius:4px;margin-top:2rem}
  @media print{body{margin:0}.disclaimer{page-break-inside:avoid}}
</style>
</head>
<body>
<h1>Ukraine Reconstruction Finance Brief</h1>
<p class="meta">Generated by uVidNova &middot; ${date} &middot; ${PATH_LABELS[W.path]} &middot; ${TIMING_LABELS[W.timing]}</p>

<h2>Portfolio</h2>
<p>${r.sel.length} project${r.sel.length !== 1 ? 's' : ''}: ${r.sel.map(a => a.name?.en ?? a.asset_id).join('; ')}</p>
<p>Total cost estimate: <strong>${fmtM(r.total)}</strong> central (range ${fmtM(r.low)} – ${fmtM(r.high)})</p>

<h2>Financing structure</h2>
<table>
  <thead><tr><th>Tranche</th><th>Allocation</th><th>Amount (USD M)</th><th>Required return</th><th>Tenor (yr)</th></tr></thead>
  <tbody>
    ${r.tranches.map(t => `<tr>
      <td>${t.def.label}</td>
      <td>${t.pct.toFixed(0)}%</td>
      <td>${fmtM(t.amt.toFixed(1))}</td>
      <td>${t.effR.toFixed(1)}%${COMMERCIAL_TYPES.has(t.type) && W.timing !== 'after' ? ' (incl. wartime +' + WAR_PREMIUM + '%)' : ''}</td>
      <td>${t.tenor ?? '—'}</td>
    </tr>`).join('')}
  </tbody>
</table>

<h2>Key metrics</h2>
<div class="metrics">
  <div class="metric"><span class="val">${r.blended.toFixed(2)}%</span><span class="lbl">Blended cost of capital</span></div>
  <div class="metric"><span class="val">${fmtM(r.pubTotal.toFixed(0))}</span><span class="lbl">Public support needed</span></div>
  <div class="metric"><span class="val">${fmtM(r.grantAmt.toFixed(0))}</span><span class="lbl">Grant requirement</span></div>
  <div class="metric"><span class="val">${fmtM(r.debtSvc.toFixed(1))}/yr</span><span class="lbl">Annual debt service</span></div>
  ${r.mobRatio ? `<div class="metric"><span class="val">${r.mobRatio}×</span><span class="lbl">Private mobilisation ratio</span></div>` : ''}
</div>

<h2>Support needed by phase</h2>
<div class="support">
  <div class="support-card">
    <span class="lbl">⚡ During war</span>
    <span class="val">${fmtM(r.duringSupport.toFixed(0))}</span>
    <span class="note">${W.timing === 'after' ? 'Deferred to post-war' : 'Grants + concessional required now'}</span>
  </div>
  <div class="support-card">
    <span class="lbl">🕊 Post-war</span>
    <span class="val">${fmtM(r.postSupport.toFixed(0))}</span>
    <span class="note">${W.timing === 'during' ? 'Not modelled in this scenario' : 'Requires peace settlement'}</span>
  </div>
</div>

${r.repAmt > 0 ? `
<h2>Russian reparations scenario</h2>
<p>Reparations tranche: <strong>${fmtM(r.repAmt.toFixed(0))}</strong></p>
<p>= <strong>${r.repPctClaim.toFixed(3)}%</strong> of KSE $486B total reparations claim<br>
= <strong>${r.repPctFrozen.toFixed(3)}%</strong> of G7-frozen Russian assets (~$300B)<br>
Source: KSE Institute "Russia Will Pay" tracker.</p>` : ''}

<div class="disclaimer">Cost and financing-structure figures are estimates derived from published unit-cost benchmarks (RDNA3, KSE Institute) and comparable Ukrainian precedents. They are not guarantees, not procurement quotes, and not a substitute for transaction-level due diligence. uVidNova — atlasvidnova.org</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `uvidnova-finance-brief-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

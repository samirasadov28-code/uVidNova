/**
 * finance-wizard.js — "Finance It" multi-step financing wizard.
 * Pure deterministic calculations; no AI involvement in numeric output.
 */

import { getName, t } from './lang.js';
import { SECTOR_LABELS } from './filters.js';
import { loadGrowthSectors, renderWizardSectorPicker, renderPortfolioGrowthPicker, getGreenfieldsTemplates } from './growth-sectors.js';

// ── Tranche definitions ───────────────────────────────────────────────────────

const TRANCHE_DEFS = {
  reparations:       { label: 'Russian Reparations / ERA Proceeds',   ret: 0,    tenor: null, col: '#9b59b6' },
  grant:             { label: 'Pure grants (EU / Bilateral Donors)',    ret: 0,    tenor: null, col: '#27ae60' },
  first_loss:        { label: 'First-loss / Guarantee Facility',       ret: 0,    tenor: null, col: '#52be80' },
  concessional_ifi:  { label: 'Concessional IFI Loan',                 ret: 1.5,  tenor: 20,   col: '#2980b9' },
  senior_ifi:        { label: 'Senior IFI Near-market',                ret: 3.5,  tenor: 15,   col: '#1a6aa1' },
  eca:               { label: 'ECA Buyer Credit / Direct Lending',     ret: 4.0,  tenor: 10,   col: '#8e44ad' },
  pri_wrap:          { label: 'PRI / War-risk Insurance Wrap',         ret: 1.5,  tenor: null, col: '#e67e22', isFlag: true },
  dfi_equity:        { label: 'DFI equity & quasi-equity',              ret: 8.0,  tenor: null, col: '#5dade2' },
  public_equity:     { label: 'Sovereign & municipal counterpart equity', ret: 0,  tenor: null, col: '#7f8c8d' },
  diaspora:          { label: 'Diaspora / Patriotic Bonds',            ret: 5.0,  tenor: 10,   col: '#a9cce3' },
  commercial_bank:   { label: 'Commercial bank senior debt',            ret: 9.0,  tenor: 10,   col: '#884ea0' },
  institutional_debt:{ label: 'Institutional / Capital Markets Debt',  ret: 6.5,  tenor: 12,   col: '#2c3e50' },
  private_equity:    { label: 'Private equity & infrastructure equity funds', ret: 18.0, tenor: null, col: '#e74c3c' },
};

// Confidence levels derived from funding_envelope.json — keyed by tranche type.
// 'high' renders no badge; 'medium' = "~" prefix; 'low' = amber warning.
const TRANCHE_CONFIDENCE = {
  reparations:       { level: 'medium', note: 'ERA interest (~$3B/yr) available now; principal seizure requires legal framework not yet finalised.' },
  grant:             { level: 'high',   note: 'EU Facility Pillar I and named bilateral envelopes explicit in source documents.' },
  first_loss:        { level: 'medium', note: 'Medium confidence — EU Guarantee Instrument and MIGA first-loss facilities in development.' },
  concessional_ifi:  { level: 'medium', note: 'Medium confidence — inferred from aggregate IFI pledges.' },
  senior_ifi:        { level: 'medium', note: 'Medium confidence — EBRD / IFC near-market windows exist but deal-by-deal approval.' },
  eca:               { level: 'high',   note: 'Named ECA envelopes (UKEF, BpiFrance) explicit in programme documents.' },
  pri_wrap:          { level: 'medium', note: 'MIGA WAR product active; BpiFrance AE and UKEF also have Ukraine war risk programmes.' },
  dfi_equity:        { level: 'medium', note: 'EBRD / IFC equity available deal-by-deal; low confidence for occupied-adjacent assets.' },
  public_equity:     { level: 'high',   note: 'Ukrainian government counterpart equity required under EU co-financing rules.' },
  diaspora:          { level: 'medium', note: 'Diaspora appetite demonstrated; retail distribution infrastructure still developing.' },
  commercial_bank:   { level: 'low',    note: 'Low confidence — wartime bank appetite limited; requires strong de-risking stack.' },
  institutional_debt:{ level: 'low',    note: 'Low confidence — capital markets access contingent on post-armistice credit environment.' },
  private_equity:    { level: 'low',    note: 'Low confidence — fund managers cautious; available for highest-return commercial assets only.' },
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
const COMMERCIAL_TYPES  = new Set(['commercial_bank', 'institutional_debt', 'private_equity', 'dfi_equity']);
const CONCESSIONAL_TYPES = new Set(['concessional_ifi', 'senior_ifi', 'eca', 'diaspora', 'first_loss']);

// Sector revenue yield — estimated annual revenue as % of asset reconstruction cost
// Used for debt service coverage ratio (DSCR) calculation in Results
const SECTOR_REVENUE_YIELD = {
  energy_and_power:             0.09,  // tariff revenues
  healthcare:                   0.02,  // partial user fees / state payments
  education:                    0.005, // minimal user revenues
  residential:                  0.05,  // rental / service charge income
  heritage_and_culture:         0.01,  // tourism / admission
  transport_and_ports:          0.04,  // tolls / port fees
  water_and_sanitation:         0.04,  // utility tariff
  industrial_and_agricultural:  0.10,  // production revenues
  public_administration:        0,     // fully publicly funded
};

const GENERIC_SECTOR_RECOVERY = [
  { sectorId: 'energy',     label: 'Energy & Power',             scale_usd_m: 38700, note: 'RDNA3 energy sector total' },
  { sectorId: 'housing',    label: 'Housing & Residential',      scale_usd_m: 80500, note: 'RDNA3 housing sector total' },
  { sectorId: 'transport',  label: 'Transport & Infrastructure', scale_usd_m: 35400, note: 'RDNA3 transport total' },
  { sectorId: 'social',     label: 'Social Infrastructure',      scale_usd_m: 26200, note: 'RDNA3 social (health+edu) total' },
  { sectorId: 'agriculture',label: 'Agriculture & Food Systems', scale_usd_m: 34600, note: 'RDNA3 agriculture total' },
  { sectorId: 'industry',   label: 'Industrial & Commercial',    scale_usd_m: 11900, note: 'RDNA3 industry sector total' },
  { sectorId: 'water',      label: 'Water & Public Services',    scale_usd_m: 7100,  note: 'RDNA3 water/sanitation total' },
];

const PATH_LABELS = {
  baseline:          t('fw.path.baseline')||'Baseline reconstruction',
  code_compliant:    t('fw.path.code_compliant')||'Code-compliant rebuild',
  build_back_better: t('fw.path.build_back_better')||'Build Back Better',
};

const PATH_DESC = {
  baseline:          t('fw.path.baseline_desc')||'Restore to pre-war condition',
  code_compliant:    t('fw.path.code_compliant_desc')||'+15–25% · meets current EU building codes',
  build_back_better: t('fw.path.build_back_better_desc')||'+30–60% · modern systems, energy efficiency, resilience',
};

const TIMING_LABELS = {
  during: t('fw.timing.during')||'During the war',
  after:  t('fw.timing.after')||'Post-war only',
  phased: t('fw.timing.phased')||'Phased — start during, close post-war',
};

// ── Wizard state ──────────────────────────────────────────────────────────────

const FW_HINT_KEY = 'uvidnova.hint.finance.v1';

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
      { id: 1, type: 'reparations',     pct: 30, ret: 0,    tenor: null },
      { id: 2, type: 'grant',           pct: 40, ret: 0,    tenor: null },
      { id: 3, type: 'concessional_ifi',pct: 20, ret: 1.5,  tenor: 20  },
      { id: 4, type: 'private_equity',  pct: 10, ret: 18.0, tenor: null },
    ],
    nextId: 5,
    greenfield: { sectorId: null, archetypeId: null },
    growthProjects: [],   // Array<{ sectorId, archetypeId, label, sector, scale_usd_m }>
    showGrowthPicker: false,
    growthMode: 'specific',  // 'generic' | 'specific'
    minPrivateReturn: 18,
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
  // Show intro on first-ever open; preselected calls skip it (context is clear)
  W._showIntro = preselectedIds.length === 0 && !safeLS(FW_HINT_KEY);

  let overlay = document.getElementById('financeWizard');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'financeWizard';
    overlay.className = 'fw-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = shell();
  overlay.hidden = false;
  // Small delay so the CSS transition plays from the transformed position
  requestAnimationFrame(() => overlay.classList.add('fw-open'));

  overlay.querySelector('#fwClose').addEventListener('click', close);
  document.addEventListener('keydown', escClose);

  render();
}

function close() {
  const o = document.getElementById('financeWizard');
  if (o) {
    o.classList.remove('fw-open');
    setTimeout(() => { if (o) o.hidden = true; }, 340);
  }
  document.removeEventListener('keydown', escClose);
  if (_onClose) { _onClose(); _onClose = null; }
}

function escClose(e) { if (e.key === 'Escape') close(); }

function safeLS(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function shell() {
  return `
    <div class="fw-modal" role="dialog" aria-modal="true" aria-label="Finance It wizard">
      <div class="fw-header">
        <div class="fw-header-left">
          <h2 class="fw-title">💰 ${t('fw.title') || 'Finance It'}</h2>
          <div class="fw-progress" id="fwProgress"></div>
        </div>
        <button class="fw-close" id="fwClose" aria-label="Close wizard">×</button>
      </div>
      <div class="fw-body" id="fwBody"></div>
      <div class="fw-footer">
        <button class="fw-btn fw-btn-back" id="fwBack">← ${t('fw.back') || 'Back'}</button>
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
  if (W._showIntro) { body.innerHTML = introHTML(); wireIntro(); return; }
  switch (W.step) {
    case 1: body.innerHTML = step1HTML(); wireStep1(); break;
    case 2: body.innerHTML = step2HTML(); wireStep2(); break;
    case 3: body.innerHTML = step3HTML(); wireStep3(); break;
    case 4: body.innerHTML = step4HTML(); generateMemo(); break;
  }
}

function updateChrome() {
  const STEPS = [t('fw.step.scope')||'Scope', t('fw.step.scenario')||'Scenario', t('fw.step.structure')||'Structure', t('fw.step.results')||'Results'];
  const prog = document.getElementById('fwProgress');
  if (prog) {
    prog.innerHTML = STEPS.map((s, i) =>
      `<span class="fw-ps ${W.step === i+1 ? 'fw-ps-active' : W.step > i+1 ? 'fw-ps-done' : ''}">${i+1}. ${s}</span>`
    ).join('');
  }

  const sl = document.getElementById('fwStepLabel');
  if (sl) sl.textContent = `${t('fw.step_label')||'Step'} ${W.step} ${t('fw.step_of')||'of'} 4`;

  const back = document.getElementById('fwBack');
  const next = document.getElementById('fwNext');
  if (back) { back.hidden = W.step === 1 || !!W._showIntro; back.onclick = goBack; }
  if (next) {
    next.hidden = !!W._showIntro;
    if (!W._showIntro) {
      if (W.step === 4) {
        next.textContent = `↗ ${t('fw.export')||'Export Brief'}`;
        next.onclick = exportBrief;
      } else {
        next.textContent = W.step === 3 ? `${t('fw.see_results')||'See Results'} →` : `${t('fw.next')||'Next'} →`;
        next.onclick = goNext;
      }
    }
  }
}

/** Map asset financing_structure keys to wizard tranche types + default returns */
const FS_KEY_TO_TRANCHE = {
  grant_pct:                { type: 'grant',              ret: 0,    tenor: null },
  era_pct:                  { type: 'reparations',        ret: 0,    tenor: null },
  first_loss_pct:           { type: 'first_loss',         ret: 0,    tenor: null },
  concessional_pct:         { type: 'concessional_ifi',   ret: 1.5,  tenor: 20   },
  senior_ifi_pct:           { type: 'senior_ifi',         ret: 3.5,  tenor: 15   },
  eca_pct:                  { type: 'eca',                ret: 4.0,  tenor: 10   },
  dfi_equity_pct:           { type: 'dfi_equity',         ret: 8.0,  tenor: null },
  public_equity_pct:        { type: 'public_equity',      ret: 0,    tenor: null },
  diaspora_pct:             { type: 'diaspora',           ret: 5.0,  tenor: 10   },
  commercial_bank_debt_pct: { type: 'commercial_bank',    ret: 9.0,  tenor: 10   },
  institutional_debt_pct:   { type: 'institutional_debt', ret: 6.5,  tenor: 12   },
  private_equity_pct:       { type: 'private_equity',     ret: 18.0, tenor: null },
};

function seedTranchesFromAssets() {
  const sel = selectedAssets();
  if (sel.length === 0 || W.scope === 'greenfield') return;

  // Weighted average by cost
  const totalCost = sel.reduce((s, a) => s + (a.cost_paths?.[W.path]?.central_usd_m ?? 1), 0);
  const merged = {};
  for (const a of sel) {
    const fs = a.financing_structures?.[W.path];
    if (!fs) continue;
    const weight = (a.cost_paths?.[W.path]?.central_usd_m ?? 1) / totalCost;
    for (const [key, map] of Object.entries(FS_KEY_TO_TRANCHE)) {
      const pct = fs[key] ?? 0;
      if (pct === 0) continue;
      const k = map.type;
      merged[k] = (merged[k] ?? 0) + pct * weight;
    }
  }

  // Convert to tranche list, skip zero entries
  const tranches = [];
  let id = 1;
  for (const [type, pct] of Object.entries(merged)) {
    if (pct < 0.5) continue;
    const def = FS_KEY_TO_TRANCHE[Object.keys(FS_KEY_TO_TRANCHE).find(k => FS_KEY_TO_TRANCHE[k].type === type)] ?? {};
    const defType = TRANCHE_DEFS[type] ?? TRANCHE_DEFS.private_equity;
    tranches.push({ id: id++, type, pct: Math.round(pct * 10) / 10, ret: def.ret ?? defType.ret, tenor: def.tenor ?? defType.tenor });
  }

  // Normalise to 100%
  const sum = tranches.reduce((s, t) => s + t.pct, 0);
  if (sum > 0 && tranches.length > 0) {
    const scale = 100 / sum;
    tranches.forEach(t => { t.pct = Math.round(t.pct * scale * 10) / 10; });
    // Fix rounding to exactly 100
    const diff = 100 - tranches.reduce((s, t) => s + t.pct, 0);
    tranches[0].pct = Math.round((tranches[0].pct + diff) * 10) / 10;
  }

  if (tranches.length > 0) {
    W.tranches = tranches;
    W.nextId = id;
  }
}

function goNext() {
  if (!validate()) return;
  if (W.step === 2 && W.scope !== 'greenfield') seedTranchesFromAssets();
  if (W.step < 4) {
    W.step++;
    render();
    document.querySelector('.fw-body')?.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function goBack() {
  if (W.step > 1) {
    W.step--;
    render();
    document.querySelector('.fw-body')?.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function validate() {
  if (W.step === 1 && W.scope !== 'greenfield' && W.selectedIds.size === 0) {
    showError(t('fw.err.select_project')||'Select at least one project to continue.');
    return false;
  }
  if (W.step === 1 && W.scope === 'greenfield') {
    if (!W.greenfield.sectorId) { showError(t('fw.err.select_sector')||'Select a growth sector to continue.'); return false; }
    if (!W.greenfield.archetypeId) { showError(t('fw.err.select_archetype')||'Select a project archetype to continue.'); return false; }
  }
  if (W.step === 3) {
    const sum = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      showError(`${t('fw.err.tranche_total_prefix')||'Tranche allocations must total 100%. Currently'}: ${sum.toFixed(1)}%.`);
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
  const assetCost  = selectedAssets().reduce((s, a) => s + (a.cost_paths?.[path]?.central_usd_m ?? 0), 0);
  const growthCost = (W.growthProjects ?? []).reduce((s, p) => s + p.scale_usd_m, 0);
  return assetCost + growthCost;
}

function fmtM(n) {
  if (n == null) return '-';
  if (+n >= 10000) {
    const bn = +n / 1000;
    return bn >= 100 ? `$${Math.round(bn).toLocaleString()}B` : `$${bn.toFixed(1)}B`;
  }
  return `$${(+n).toLocaleString()}M`;
}

// ── Intro screen (first open only) ───────────────────────────────────────────

function introHTML() {
  return `<div class="fw-intro">
    <div class="fw-intro-header">
      <span class="fw-intro-icon">💰</span>
      <h3 class="fw-intro-title">${t('fw.intro.title')||'Finance It — how it works'}</h3>
    </div>
    <p class="fw-intro-body">${t('fw.intro.body')||'Build a deterministic capital stack for any damaged asset, group, or the entire 100-asset portfolio. Every figure traces to RDNA3 and KSE benchmarks — no AI-generated numbers.'}</p>
    <div class="fw-intro-steps">
      <div class="fw-intro-step">
        <span class="fw-is-num">1</span>
        <div><strong>${t('fw.step.scope')||'Scope'}</strong> — ${t('fw.intro.step1_desc')||'one project, a region group, or the full portfolio with optional greenfield growth investments'}</div>
      </div>
      <div class="fw-intro-step">
        <span class="fw-is-num">2</span>
        <div><strong>${t('fw.step.scenario')||'Scenario'}</strong> — ${t('fw.intro.step2_desc')||'choose reconstruction path (baseline / code-compliant / build-back-better) and financing timeline'}</div>
      </div>
      <div class="fw-intro-step">
        <span class="fw-is-num">3</span>
        <div><strong>${t('fw.step.structure')||'Structure'}</strong> — ${t('fw.intro.step3_desc')||'pick tranches from the catalog (grants, concessional debt, equity, Russian reparations) and set allocations'}</div>
      </div>
      <div class="fw-intro-step">
        <span class="fw-is-num">4</span>
        <div><strong>${t('fw.step.results')||'Results'}</strong> — ${t('fw.intro.step4_desc')||'full capital stack analysis with blended CoC, mobilisation ratio, and an exportable financing brief'}</div>
      </div>
    </div>
    <button class="fw-btn fw-btn-next fw-intro-start" id="fwIntroStart">${t('fw.intro.start')||'Start — Step 1'} →</button>
  </div>`;
}

function wireIntro() {
  document.getElementById('fwIntroStart')?.addEventListener('click', () => {
    try { localStorage.setItem(FW_HINT_KEY, '1'); } catch { /* ignore */ }
    W._showIntro = false;
    render();
  });
}

// ── Step 1: Scope ─────────────────────────────────────────────────────────────

function step1HTML() {
  return `<div class="fw-step">
    <h3 class="fw-sh">${t('fw.s1.title')||'What would you like to finance?'}</h3>
    <div class="fw-scope-row" id="fwScopeRow">
      ${scopeCard('single',     '🏗', t('fw.s1.single')||'One project',             t('fw.s1.single_desc')||'Finance a specific damaged asset')}
      ${scopeCard('group',      '🗂', t('fw.s1.group')||'Group of projects',       t('fw.s1.group_desc')||'Select by region or manually')}
      ${scopeCard('all',        '🇺🇦', t('fw.s1.all')||'Entire portfolio',        `${t('fw.s1.all_desc_prefix')||'All'} ${_assets.length} ${t('fw.s1.all_desc_suffix')||'documented assets'}`)}
      ${scopeCard('greenfield', '🌱', t('fw.s1.greenfield')||'Growth sector project',   t('fw.s1.greenfield_desc')||'Model a new greenfield investment')}
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
      const prev = W.scope;
      W.scope = e.target.value;
      if (W.scope === 'all') {
        W.selectedIds = new Set(_assets.map(a => a.asset_id));
      } else if (W.scope !== prev) {
        W.selectedIds = new Set();
        W.growthProjects = [];
        W.showGrowthPicker = false;
      }
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
    const assetTotal  = _assets.reduce((s, a) => s + (a.cost_paths?.baseline?.central_usd_m ?? 0), 0);
    const growthTotal = (W.growthProjects ?? []).reduce((s, p) => s + p.scale_usd_m, 0);
    const grandTotal  = assetTotal + growthTotal;
    const growthCount = (W.growthProjects ?? []).length;

    det.innerHTML = `
      <div class="fw-scope-summary">
        <strong>${_assets.length} ${t('fw.scope.damaged_assets')||'damaged assets'}</strong> ${t('fw.scope.all_regions')||'across all documented regions'}
        — ${t('fw.scope.baseline_rehab')||'Baseline rehabilitation'}: <strong>${fmtM(assetTotal)}</strong>
        ${growthCount > 0 ? ` + <strong>${growthCount} ${t('fw.scope.growth_project')||'growth project'}${growthCount !== 1 ? (t('fw.scope.growth_projects_plural_suffix')||'s') : ''}</strong> (${fmtM(growthTotal)}) = <strong>${fmtM(grandTotal)} ${t('fw.scope.total')||'total'}</strong>` : ''}
      </div>
      <button class="fw-growth-toggle-btn" id="fwGrowthToggleBtn">
        ${W.showGrowthPicker ? `▲ ${t('fw.scope.hide_growth')||'Hide growth projects'}` : `＋ ${t('fw.scope.add_growth')||'Add growth sector projects'}${growthCount > 0 ? ` (${growthCount} ${t('fw.scope.selected')||'selected'})` : ''}`}
      </button>
      <div id="fwGrowthPickerWrap" ${W.showGrowthPicker ? '' : 'hidden'}>
        <div class="fw-growth-mode-row">
          <label class="fw-growth-mode-opt ${W.growthMode === 'generic' ? 'fw-gmo-active' : ''}">
            <input type="radio" name="growthMode" value="generic" ${W.growthMode === 'generic' ? 'checked' : ''} class="fw-sr">
            <span class="fw-gmo-icon">🌍</span>
            <span class="fw-gmo-text">
              <strong>${t('fw.scope.generic_recovery')||'Generic sector recovery'}</strong>
              <span class="fw-gmo-sub">${t('fw.scope.generic_recovery_desc')||'Restore pre-war growth trajectory across a whole sector'}</span>
            </span>
          </label>
          <label class="fw-growth-mode-opt ${W.growthMode === 'specific' ? 'fw-gmo-active' : ''}">
            <input type="radio" name="growthMode" value="specific" ${W.growthMode === 'specific' ? 'checked' : ''} class="fw-sr">
            <span class="fw-gmo-icon">📋</span>
            <span class="fw-gmo-text">
              <strong>${t('fw.scope.specific_projects')||'Specific projects'}</strong>
              <span class="fw-gmo-sub">${t('fw.scope.specific_projects_desc')||'Select individual investment archetypes'}</span>
            </span>
          </label>
        </div>
        ${W.growthMode === 'generic' ? renderGenericGrowthPicker() : (_growthData ? renderPortfolioGrowthPicker(_growthData, W.growthProjects ?? []) : `<p class="fw-scope-summary">${t('fw.scope.loading_growth')||'Loading growth sector data…'}</p>`)}
        <div id="fwGrowthChips" class="${W.growthProjects.length > 0 ? 'fw-growth-chips' : 'fw-growth-empty'}">
          ${W.growthProjects.length > 0
            ? W.growthProjects.map(p => {
                const qtyControls = !p.isGeneric ? `
                  <span class="fw-qty-ctrl">
                    <button class="fw-qty-btn fw-growth-qty-down" data-arch-id="${p.archetypeId}" type="button">−</button>
                    <span class="fw-qty-val">×${p.qty || 1}</span>
                    <button class="fw-qty-btn fw-growth-qty-up" data-arch-id="${p.archetypeId}" type="button">+</button>
                  </span>` : '';
                return `<span class="fw-growth-chip">${p.label}${qtyControls} <span class="fw-gc-scale">USD ${(+p.scale_usd_m).toLocaleString()}M</span></span>`;
              }).join('') + `<span class="fw-growth-total-chip">${t('fw.scope.growth_total')||'Growth total'}: <strong>USD ${(W.growthProjects ?? []).reduce((s,p)=>s+p.scale_usd_m,0).toLocaleString()}M</strong></span>`
            : (t('fw.scope.no_growth_selected')||'No growth projects selected yet.')}
        </div>
      </div>`;

    // If renderPortfolioGrowthPicker created its own fwGrowthChips, remove it to avoid duplicates
    if (W.growthMode !== 'generic') {
      const allChips = det.querySelectorAll('#fwGrowthChips');
      if (allChips.length > 1) allChips[0].remove();
    }

    document.getElementById('fwGrowthToggleBtn')?.addEventListener('click', () => {
      W.showGrowthPicker = !W.showGrowthPicker;
      if (W.showGrowthPicker && !_growthData) {
        loadGrowthSectors().then(d => { _growthData = d; renderScopeDetail(); }).catch(() => {});
      }
      renderScopeDetail();
    });

    wireGrowthPicker();
    return;
  }

  if (W.scope === 'single') {
    det.innerHTML = `
      <div class="fw-field-group">
        <label class="fw-label">${t('fw.scope.search_projects')||'Search projects'}</label>
        <input id="fwSearch" type="text" class="fw-input" placeholder="${t('fw.scope.search_placeholder')||'Type project name…'}" autocomplete="off">
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
      det.innerHTML = `<p class="fw-scope-summary">${t('fw.scope.loading_growth')||'Loading growth sector data…'}</p>`;
      loadGrowthSectors().then(d => { _growthData = d; renderScopeDetail(); }).catch(() => {
        det.innerHTML = `<p class="fw-scope-summary">${t('fw.scope.loading_growth_error')||'Could not load growth sector data.'}</p>`;
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
        <label class="fw-label">${t('fw.scope.region')||'Region'}</label>
        <select id="fwOblastSel" class="fw-select fw-select-sm">
          <option value="">${t('fw.scope.all_regions')||'All regions'}</option>
          ${oblasts.map(o => `<option>${o}</option>`).join('')}
        </select>
      </div>
      <div class="fw-group-links">
        <button class="fw-link-btn" id="fwSelAll">${t('fw.scope.select_all')||'Select all'}</button>
        <button class="fw-link-btn" id="fwClrAll">${t('fw.scope.clear_all')||'Clear all'}</button>
      </div>
    </div>
    <div id="fwGroupList" class="fw-asset-list"></div>
    <div class="fw-sel-count" id="fwSelCount">${W.selectedIds.size} ${t('fw.scope.selected')||'selected'}</div>`;

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
  if (el) el.textContent = `${W.selectedIds.size} ${t('fw.scope.selected')||'selected'}`;
}

function renderGenericGrowthPicker() {
  const selected = new Set(W.growthProjects.map(p => p.sectorId));
  return `<div class="fw-generic-sectors">
    <p class="fw-generic-intro">Select sectors to include in pre-war growth recovery envelope (RDNA3 totals):</p>
    ${GENERIC_SECTOR_RECOVERY.map(s => `
      <label class="fw-generic-sector-row ${selected.has(s.sectorId) ? 'fw-gsr-sel' : ''}">
        <input type="checkbox" class="fw-generic-cb" data-sector-id="${s.sectorId}"
               data-label="${s.label}" data-scale="${s.scale_usd_m}" data-note="${s.note}"
               ${selected.has(s.sectorId) ? 'checked' : ''}>
        <span class="fw-gsr-label">${s.label}</span>
        <span class="fw-gsr-scale">USD ${(s.scale_usd_m/1000).toFixed(1)}B</span>
        <span class="fw-gsr-note">${s.note}</span>
      </label>`).join('')}
  </div>`;
}

function wireGrowthPicker() {
  // Growth mode radio buttons
  document.querySelectorAll('input[name="growthMode"]').forEach(r => {
    r.addEventListener('change', e => {
      W.growthMode = e.target.value;
      W.growthProjects = [];
      renderScopeDetail();
    });
  });

  // Generic sector checkboxes
  document.querySelectorAll('.fw-generic-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const { sectorId, label, scale, note } = e.target.dataset;
      if (e.target.checked) {
        if (!W.growthProjects.find(p => p.sectorId === sectorId)) {
          W.growthProjects.push({ sectorId, archetypeId: `generic_${sectorId}`, label, sector: label, scale_usd_m: +scale, isGeneric: true });
        }
      } else {
        W.growthProjects = W.growthProjects.filter(p => p.sectorId !== sectorId);
      }
      renderScopeDetail();
    });
  });

  document.querySelectorAll('.fw-growth-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      const { archId, sectorId, label, sector, scale } = e.target.dataset;
      if (e.target.checked) {
        if (!W.growthProjects.find(p => p.archetypeId === archId)) {
          W.growthProjects.push({ sectorId, archetypeId: archId, label, sector, scale_usd_m: +scale, qty: 1, baseScale: +scale });
        }
      } else {
        W.growthProjects = W.growthProjects.filter(p => p.archetypeId !== archId);
      }
      updateGrowthChips();
    });
  });

  // Quantity +/- for specific projects
  document.querySelectorAll('.fw-growth-qty-up').forEach(btn => {
    btn.addEventListener('click', e => {
      const archId = e.currentTarget.dataset.archId;
      const proj = W.growthProjects.find(p => p.archetypeId === archId);
      if (proj) { proj.qty = (proj.qty || 1) + 1; proj.scale_usd_m = proj.baseScale * proj.qty; }
      updateGrowthChips();
    });
  });
  document.querySelectorAll('.fw-growth-qty-down').forEach(btn => {
    btn.addEventListener('click', e => {
      const archId = e.currentTarget.dataset.archId;
      const proj = W.growthProjects.find(p => p.archetypeId === archId);
      if (proj && proj.qty > 1) { proj.qty -= 1; proj.scale_usd_m = proj.baseScale * proj.qty; updateGrowthChips(); }
    });
  });
}

function updateGrowthChips() {
  const assetTotal  = _assets.reduce((s, a) => s + (a.cost_paths?.baseline?.central_usd_m ?? 0), 0);
  const growthTotal = W.growthProjects.reduce((s, p) => s + p.scale_usd_m, 0);
  const grandTotal  = assetTotal + growthTotal;
  const growthCount = W.growthProjects.length;
  const summaryEl = document.querySelector('.fw-scope-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<strong>${_assets.length} ${t('fw.scope.damaged_assets')||'damaged assets'}</strong> ${t('fw.scope.all_regions')||'across all documented regions'}
      — ${t('fw.scope.baseline_rehab')||'Baseline rehabilitation'}: <strong>${fmtM(assetTotal)}</strong>
      ${growthCount > 0 ? ` + <strong>${growthCount} ${t('fw.scope.growth_project')||'growth project'}${growthCount !== 1 ? (t('fw.scope.growth_projects_plural_suffix')||'s') : ''}</strong> (${fmtM(growthTotal)}) = <strong>${fmtM(grandTotal)} ${t('fw.scope.total')||'total'}</strong>` : ''}`;
  }
  const chipsEl = document.getElementById('fwGrowthChips');
  if (chipsEl) {
    if (W.growthProjects.length > 0) {
      chipsEl.className = 'fw-growth-chips';
      chipsEl.innerHTML = W.growthProjects.map(p => {
        const qtyControls = !p.isGeneric ? `
          <span class="fw-qty-ctrl">
            <button class="fw-qty-btn fw-growth-qty-down" data-arch-id="${p.archetypeId}" type="button">−</button>
            <span class="fw-qty-val">×${p.qty || 1}</span>
            <button class="fw-qty-btn fw-growth-qty-up" data-arch-id="${p.archetypeId}" type="button">+</button>
          </span>` : '';
        return `<span class="fw-growth-chip">${p.label}${qtyControls} <span class="fw-gc-scale">USD ${(+p.scale_usd_m).toLocaleString()}M</span></span>`;
      }).join('') + `<span class="fw-growth-total-chip">${t('fw.scope.growth_total')||'Growth total'}: <strong>USD ${growthTotal.toLocaleString()}M</strong></span>`;
    } else {
      chipsEl.className = 'fw-growth-empty';
      chipsEl.innerHTML = t('fw.scope.no_growth_selected')||'No growth projects selected yet.';
    }
    // Re-wire qty buttons after chips update
    chipsEl.querySelectorAll('.fw-growth-qty-up').forEach(btn => {
      btn.addEventListener('click', e => {
        const archId = e.currentTarget.dataset.archId;
        const proj = W.growthProjects.find(p => p.archetypeId === archId);
        if (proj) { proj.qty = (proj.qty || 1) + 1; proj.scale_usd_m = proj.baseScale * proj.qty; }
        updateGrowthChips();
      });
    });
    chipsEl.querySelectorAll('.fw-growth-qty-down').forEach(btn => {
      btn.addEventListener('click', e => {
        const archId = e.currentTarget.dataset.archId;
        const proj = W.growthProjects.find(p => p.archetypeId === archId);
        if (proj && proj.qty > 1) { proj.qty -= 1; proj.scale_usd_m = proj.baseScale * proj.qty; updateGrowthChips(); }
      });
    });
  }
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
        k === 'during' ? `⚡ +${WAR_PREMIUM}% ${t('fw.s2.timing_during_desc')||'wartime premium on commercial tranches'}` :
        k === 'after'  ? (t('fw.s2.timing_after_desc')||'Normal rates; reparations available as a funding source') :
                         (t('fw.s2.timing_phased_desc')||'Phased disbursement; reparations close the post-war tranche')
      }</span>
    </label>`).join('');

  return `<div class="fw-step">
    <h3 class="fw-sh">${t('fw.s2.title')||'Cost path & financing timeline'}</h3>
    <div class="fw-selection-pill">${sel.length} ${t('fw.s2.project')||'project'}${sel.length !== 1 ? (t('fw.s2.projects_plural_suffix')||'s') : ''}: ${summary}</div>
    <div class="fw-field-group">
      <label class="fw-label">${t('fw.s2.recon_path')||'Reconstruction path'}</label>
      <div class="fw-radio-row" id="fwPathRow">${pathCards}</div>
    </div>
    <div class="fw-field-group">
      <label class="fw-label">${t('fw.s2.fin_timeline')||'Financing timeline'}</label>
      <div class="fw-radio-row" id="fwTimingRow">${timingCards}</div>
    </div>
    <div class="fw-field-group">
      <label class="fw-label">${t('fw.s2.priv_return_label')||'Private capital minimum return (pre-war equivalent)'}</label>
      <div class="fw-radio-row" id="fwPrivRetRow">
        ${['10','15','18','25'].map(v => `
          <label class="fw-radio-card ${(W.minPrivateReturn ?? 18) == v ? 'fw-rc-checked' : ''}">
            <input type="radio" name="minPrivRet" value="${v}" ${(W.minPrivateReturn ?? 18) == v ? 'checked' : ''} class="fw-sr">
            <span class="fw-rc-label">${v}% IRR</span>
            <span class="fw-rc-desc">${v == 10 ? (t('fw.s2.irr_dfi')||'DFI/concessional only') : v == 15 ? (t('fw.s2.irr_conservative')||'Conservative infrastructure') : v == 18 ? (t('fw.s2.irr_wartime')||'Wartime adjusted (default)') : (t('fw.s2.irr_highrisk')||'High-risk private equity')}</span>
          </label>`).join('')}
      </div>
    </div>
    ${W.timing !== 'during' ? `<div class="fw-info-note">${t('fw.s2.reparations_note')||'Russian Reparations will be available as a tranche type in Step 3.'}</div>` : ''}
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
          <span class="fw-gf-meta-item"><strong>${t('fw.s2.gf_project_scale')||'Project scale'}:</strong> USD ${arch.scale_usd_m.toLocaleString()}M</span>
          <span class="fw-gf-meta-item"><strong>${t('fw.s2.gf_cap_template')||'Capital structure template'}:</strong> ${arch.template_id}</span>
        </div>
        ${arch.scale_note ? `<p class="fw-gf-scale-note">${arch.scale_note}</p>` : ''}
        ${!tmpl ? `<p class="fw-gf-tmpl-warn">${t('fw.s2.gf_tmpl_warn_prefix')||'Note: financing template'} "${arch.template_id}" ${t('fw.s2.gf_tmpl_warn_suffix')||'not found in growth_sectors.json — tranches will use wizard defaults.'}</p>` : ''}
      </div>
    </div>` : `<p class="fw-gf-no-arch">${t('fw.s2.gf_no_arch')||'No archetype selected. Go back to Step 1.'}</p>`;

  const timingCards = Object.keys(TIMING_LABELS).map(k => `
    <label class="fw-radio-card ${W.timing === k ? 'fw-rc-checked' : ''}">
      <input type="radio" name="timing" value="${k}" ${W.timing === k ? 'checked' : ''} class="fw-sr">
      <span class="fw-rc-label">${TIMING_LABELS[k]}</span>
      <span class="fw-rc-desc">${
        k === 'during' ? `⚡ +${WAR_PREMIUM}% ${t('fw.s2.timing_during_desc')||'wartime premium on commercial tranches'}` :
        k === 'after'  ? (t('fw.s2.timing_after_desc')||'Normal rates; reparations available as a funding source') :
                         (t('fw.s2.timing_phased_desc')||'Phased disbursement; reparations close the post-war tranche')
      }</span>
    </label>`).join('');

  return `<div class="fw-step">
    <h3 class="fw-sh">${t('fw.s2.gf_title')||'Project overview & financing timeline'}</h3>
    ${summaryCard}
    <div class="fw-field-group">
      <label class="fw-label">${t('fw.s2.fin_timeline')||'Financing timeline'}</label>
      <div class="fw-radio-row" id="fwTimingRow">${timingCards}</div>
    </div>
    ${W.timing !== 'during' ? `<div class="fw-info-note">${t('fw.s2.reparations_note')||'Russian Reparations will be available as a tranche type in Step 3.'}</div>` : ''}
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
  document.querySelectorAll('input[name="minPrivRet"]').forEach(r => {
    r.addEventListener('change', e => {
      W.minPrivateReturn = +e.target.value;
      document.querySelectorAll('#fwPrivRetRow .fw-radio-card').forEach(c => c.classList.remove('fw-rc-checked'));
      e.target.closest('.fw-radio-card').classList.add('fw-rc-checked');
    });
  });
}

// ── Step 3: Tranche builder ───────────────────────────────────────────────────

const TRANCHE_DESCRIPTIONS = {
  reparations:       'Russian state reparations and ERA (Extraordinary Revenue Acceleration) proceeds — G7-frozen $300B assets. Zero cost to Ukraine — sovereign obligation under international law. ERA currently generates ~$3B/yr interest available now; full principal seizure requires peace settlement. The primary mechanism for large-scale reconstruction financing.',
  grant:             'EU Facility (Pillar I), World Bank SURGE grants, bilateral donors (UK, Germany, Nordic, US). Zero cost capital — most competitive for social and public assets. Subject to conditionality and reform milestones under Ukraine Plan. Highest confidence funding source.',
  first_loss:        'First-loss guarantee or credit enhancement facility. Absorbs initial losses to attract senior tranches above. Often provided by IFIs, EU Guarantee Instrument, or MIGA. Reduces risk premium across the capital stack. Typically 5–10% of total. Does not earn return — it is a risk absorber.',
  concessional_ifi:  'Below-market IFI loans (EBRD, EIB, World Bank). 1–2% interest, 15–25yr tenor. Requires sovereign or sub-sovereign guarantee and IFI due diligence. Conditional on reform milestones. Largest available blended-finance instrument for Ukraine.',
  senior_ifi:        'Near-market IFI lending (EBRD, IFC, EIB senior windows). 3–5% interest, 12–15yr tenor. Available for projects with partial commercial revenue. Less concessional than Pillar I grants but faster to mobilise. Bridges IFI concessional and commercial capital.',
  eca:               'Export Credit Agency buyer credit or direct lending (UKEF, BpiFrance, Euler Hermes, KEXIM). Finances equipment and contractor import component at 3–5%, 10yr tenor. Requires home-country export content. Strong pipeline for energy, transport, and industrial reconstruction.',
  pri_wrap:          'Political Risk Insurance and war-risk wrap (MIGA, UKEF, BpiFrance, OPIC). Covers expropriation, currency transfer restrictions, and war/civil disturbance. Not a capital source — a risk-mitigation instrument. Premium: 1–2%/yr of insured amount. Enables commercial lenders to reduce required return by 2–4%; often the key de-risking layer that makes private capital viable.',
  dfi_equity:        'Development Finance Institution equity investment (EBRD, IFC, DEG, Proparco, FMO). Patient capital at 6–10% target return. Signals quality and alignment to private co-investors (cornerstone investor effect). Available for PPP-structured assets with identifiable revenue streams.',
  public_equity:     'Ukrainian government or municipal counterpart equity stake. Zero return expectation — demonstrates public ownership, political commitment, and alignment of interest. Typically 10–20% under EU co-financing conditionality. Keeps the state as an equity partner in strategic assets.',
  diaspora:          'Diaspora and patriotic retail bonds (analogous to Israeli War Bonds). Below-market return willingly accepted by the Ukrainian diaspora (10M+ globally). 3–6% return, 7–10yr tenor. Retail distribution through Ukrainian and diaspora financial institutions. Strong political and reputational signal.',
  commercial_bank:   'Senior commercial bank loans and syndicated facilities. 8–10% during wartime (+2% war premium), normalising to 5–7% post-armistice. Requires solid security package, revenue visibility, and de-risking instruments (PRI wrap, first-loss). Available for revenue-generating assets (energy, transport, commercial real estate).',
  institutional_debt:'Capital markets debt — project bonds, green bonds, social bonds for pension funds, insurance, and asset managers. 5–8% coupon, 10–15yr tenor. Lower cost than bank debt at scale. Requires credit rating, ESG reporting framework, and transparent revenue model. Long-term funding source for post-stabilisation phase.',
  private_equity:    'Private equity and infrastructure fund capital. Target IRR 15–20% (war-risk adjusted). Requires full de-risking stack: PRI wrap, first-loss, concessional co-investment. Available primarily for commercial-grade assets with clear revenue and exit models (energy, industrial, logistics). Brings operational expertise alongside capital.',
};

function step3HTML() {
  const total = portfolioCost(W.path);
  const sumPct = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
  const blended = W.tranches.reduce((s, t) => s + (+t.pct || 0) * (+t.ret || 0), 0) / 100;
  const grantPct = W.tranches.filter(t => t.type === 'grant' || t.type === 'reparations').reduce((s, t) => s + (+t.pct || 0), 0);
  const privPct  = W.tranches.filter(t => COMMERCIAL_TYPES.has(t.type)).reduce((s, t) => s + (+t.pct || 0), 0);
  const mobRatio = grantPct > 0 ? (privPct / grantPct).toFixed(1) + '×' : 'n/a';
  const ok = Math.abs(sumPct - 100) <= 0.5;
  const selectedTypes = new Set(W.tranches.map(t => t.type));

  const catalogHTML = Object.entries(TRANCHE_DEFS).map(([k, def]) => {
    const isSelected = selectedTypes.has(k);
    const desc = TRANCHE_DESCRIPTIONS[k] ?? '';
    const retLabel = k === 'reparations' || k === 'grant' || k === 'first_loss' || k === 'public_equity'
      ? (k === 'reparations' ? (t('fw.s3.no_return_sovereign')||'No return · sovereign obligation') : k === 'first_loss' ? (t('fw.s3.no_return_risk_absorber')||'No return · risk absorber') : (t('fw.s3.no_return')||'No return'))
      : def.isFlag
        ? `${t('fw.s3.help_premium')||'Premium'} ~${def.ret}%/yr · ${t('fw.s3.help_risk_wrap')||'risk wrap'}`
        : `${def.ret}% ${def.tenor ? `· ${def.tenor}yr` : ''}`;
    return `<button class="fw-catalog-card ${isSelected ? 'fw-catalog-active' : ''}${def.isFlag ? ' fw-catalog-flag' : ''}"
              data-tranche-type="${k}" type="button" title="${def.label}">
      <span class="fw-catalog-dot" style="background:${def.col}"></span>
      <span class="fw-catalog-name">${def.label}</span>
      <span class="fw-catalog-ret">${retLabel}</span>
      <span class="fw-catalog-desc">${desc}</span>
      <span class="fw-catalog-check">${isSelected ? '✓' : '+'}</span>
    </button>`;
  }).join('');

  return `<div class="fw-step">
    <div class="fw-step3-header">
      <h3 class="fw-sh">${t('fw.s3.title')||'Capital structure'}</h3>
      <button class="fw-help-btn" id="fwHelpBtn" type="button" title="${t('fw.s3.tranche_guide')||'Tranche guide'}">? ${t('fw.s3.help')||'Help'}</button>
    </div>
    ${W.timing === 'during' ? `<div class="fw-war-note">⚡ ${t('fw.s3.wartime_note_prefix')||'Wartime'}: +${WAR_PREMIUM}% ${t('fw.s3.wartime_note_suffix')||'applied to commercial tranches in Results.'}</div>` : ''}

    <div class="fw-catalog-section">
      <div class="fw-catalog-label">${t('fw.s3.select_tranches')||'Select tranches to include:'}</div>
      <div class="fw-catalog-grid" id="fwCatalogGrid">${catalogHTML}</div>
    </div>

    <div class="fw-tranche-hdr">
      <span class="fw-total-lbl">${t('fw.s3.total_cost')||'Total cost'}: <strong>${fmtM(total)}</strong> (${PATH_LABELS[W.path]})</span>
      <span class="fw-alloc-sum ${ok ? 'fw-alloc-ok' : 'fw-alloc-warn'}" id="fwAllocSum">${t('fw.s3.allocated')||'Allocated'}: ${sumPct.toFixed(0)}%</span>
    </div>
    ${allocBar(total)}
    <div id="fwTranches">${W.tranches.map(t => trancheRowHTML(t, total)).join('')}</div>
    <div class="fw-metrics-row">
      <div class="fw-mini-metric"><span class="fw-mm-val">${blended.toFixed(2)}%</span><span class="fw-mm-lbl">${t('fw.metrics.blended_coc')||'Blended cost of capital'}</span></div>
      <div class="fw-mini-metric"><span class="fw-mm-val">${mobRatio}</span><span class="fw-mm-lbl">${t('fw.metrics.mob_ratio')||'Private mobilisation ratio'}</span></div>
    </div>

    <!-- Tranche help overlay -->
    <div class="fw-help-panel" id="fwHelpPanel" hidden>
      <div class="fw-help-inner">
        <div class="fw-help-hdr"><strong>${t('fw.s3.tranche_guide')||'Tranche Guide'}</strong><button class="fw-help-close" id="fwHelpClose" type="button">×</button></div>
        ${Object.entries(TRANCHE_DEFS).map(([k, def]) => {
          const noRetTypes = new Set(['reparations', 'grant', 'first_loss', 'public_equity']);
          const retStr = noRetTypes.has(k)
            ? ''
            : def.isFlag
              ? ` — ${t('fw.s3.help_premium')||'Premium'} ~${def.ret}%/yr · ${t('fw.s3.help_risk_wrap')||'risk wrap'}`
              : ` — ${def.ret}% ${def.tenor ? `/ ${def.tenor}yr` : ''}`;
          return `
          <div class="fw-help-row">
            <span class="fw-help-dot" style="background:${def.col}"></span>
            <div><strong>${def.label}</strong>${retStr}
              <p>${TRANCHE_DESCRIPTIONS[k]}</p>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

function allocBar(total) {
  const sumPct = W.tranches.reduce((s, t) => s + (+t.pct || 0), 0);
  const segs = W.tranches.map(t => {
    const def = TRANCHE_DEFS[t.type] ?? TRANCHE_DEFS.private_equity;
    return `<div class="fw-bar-seg" style="width:${+t.pct||0}%;background:${def.col}" title="${def.label}: ${t.pct}%"></div>`;
  }).join('');
  const gap = Math.max(0, 100 - sumPct);
  const gapSeg = gap > 0.5 ? `<div class="fw-bar-seg fw-bar-gap" style="width:${gap}%" title="${t('fw.s3.unfunded_gap')||'Unfunded gap'}: ${gap.toFixed(1)}%"></div>` : '';
  return `<div class="fw-alloc-bar">${segs}${gapSeg}</div>`;
}

function trancheRowHTML(t, total) {
  const def = TRANCHE_DEFS[t.type] ?? TRANCHE_DEFS.private_equity;
  const pct = +t.pct || 0;
  const isTrustMode = _trustModes.get(t.id) === 'trust';
  const isPriWrap   = def.isFlag === true;

  // For Trust-mode reparations tranches, show Annual payment instead of % of project
  const annualTrust = trustAnnualPayment_usd_m();
  const displayAmt  = isTrustMode
    ? `${t('fw.s3.annual_label')||'Annual'}: $${annualTrust.toLocaleString()}M/yr`
    : isPriWrap
      ? `${t('fw.s3.coverage')||'Coverage'}: $${total > 0 ? (total * pct / 100).toFixed(1) : '-'}M`
      : `$${total > 0 ? (total * pct / 100).toFixed(1) : '-'}M`;

  const repNote = t.type === 'reparations' && total > 0 ? (() => {
    const repAmt = total * pct / 100;
    return `<div class="fw-rep-note">= ${(repAmt / KSE_CLAIM_USD_M * 100).toFixed(3)}% ${t('fw.s3.of_kse_claim')||'of $486B KSE claim'} · ${(repAmt / FROZEN_USD_M * 100).toFixed(3)}% ${t('fw.s3.of_frozen')||'of $300B frozen assets'}</div>`;
  })() : '';

  const priWrapNote = isPriWrap ? `
    <div class="fw-pri-wrap-note">
      <span class="fw-pri-icon">🛡</span>
      ${t('fw.s3.pri_wrap_note')||'Risk-mitigation instrument — not a capital source. Coverage % = share of portfolio insured.'}
      ${t('fw.s3.pri_wrap_premium_prefix')||'Premium'} ~${def.ret}%/yr · ${t('fw.s3.pri_wrap_premium_suffix')||'reduces senior debt required return by ~2–3%.'}
    </div>` : '';

  // Trust toggle: only shown when tranche is 'reparations' AND timing allows reparations
  const showTrustToggle = t.type === 'reparations' && W.timing !== 'during';
  const trustToggleHTML = showTrustToggle ? `
    <div class="fw-trust-toggle-row">
      <div class="fw-trust-mode-btns">
        <button type="button" class="fw-trust-mode-btn ${!isTrustMode ? 'active' : ''}"
                data-trust-id="${t.id}" data-trust-mode="lump_sum">
          ${t('fw.s3.trust_lump_sum')||'Lump-sum reparations'}
        </button>
        <button type="button" class="fw-trust-mode-btn ${isTrustMode ? 'active' : ''}"
                data-trust-id="${t.id}" data-trust-mode="trust">
          ${t('fw.s3.trust_availability')||'Trust availability payment'}
        </button>
      </div>
      ${isTrustMode ? `
        <div class="fw-trust-computed">
          ${t('fw.s3.trust_annual_payment')||'Annual payment'}: <strong>USD ${annualTrust.toLocaleString()}M/yr</strong>
          <span style="font-size:0.72rem;color:var(--colour-text-muted)">${t('fw.s3.trust_corpus_note')||'(4% drawdown · USD 286B corpus)'}</span>
        </div>
        <p class="fw-trust-note">
          ${t('fw.s3.trust_desc')||'This replaces a single capital contribution with an annual cashflow. Useful for debt service rather than equity injection.'}
          <a href="/trust.html" target="_blank" rel="noopener">${t('fw.s3.trust_link')||'See Trust model ↗'}</a>
        </p>` : ''}
    </div>` : '';

  const isReparations  = t.type === 'reparations';
  const isZeroReturn   = isReparations || t.type === 'grant' || t.type === 'first_loss' || t.type === 'public_equity';
  const allocationLabel = isPriWrap ? (t('fw.s3.coverage')||'Coverage') : (t('fw.s3.allocation')||'Allocation');
  const retLabel = isPriWrap
    ? `<span class="fw-tr-rep-label">${t('fw.s3.pri_wrap_premium_prefix')||'Premium'} ~${def.ret}%/yr · ${t('fw.s3.pri_wrap_ret_suffix')||'reduces senior debt cost by ~2–3%'}</span>`
    : isZeroReturn
      ? `<span class="fw-tr-rep-label">${isReparations ? (t('fw.s3.no_return_sovereign')||'No return · sovereign obligation') : (t('fw.s3.no_return')||'No return')}</span>`
      : `<label class="fw-tr-lbl">${t('fw.s3.return_label')||'Return'}
          <div class="fw-tr-input-wrap">
            <input class="fw-input fw-tr-num fw-tr-ret" type="number" min="0" max="50" step="0.1" value="${+t.ret}" data-id="${t.id}" data-field="ret">
            <span class="fw-tr-unit">%</span>
          </div>
        </label>`;

  return `<div class="fw-tranche-row" data-id="${t.id}">
    <div class="fw-tr-dot" style="background:${def.col}"></div>
    <div class="fw-tr-fields">
      <div class="fw-tr-name">${def.label}${confidenceBadge(t.type)}${isPriWrap ? ` <span class="fw-flag-badge">${t('fw.s3.risk_wrap_badge')||'Risk wrap'}</span>` : ''}</div>
      <div class="fw-tr-nums">
        <label class="fw-tr-lbl">${allocationLabel}
          <div class="fw-tr-input-wrap">
            <input class="fw-input fw-tr-num fw-tr-pct" type="number" min="0" max="100" step="1" value="${pct}" data-id="${t.id}" data-field="pct">
            <span class="fw-tr-unit">%</span>
          </div>
        </label>
        ${retLabel}
        ${def.tenor != null && !isReparations && !isPriWrap ? `<label class="fw-tr-lbl">${t('fw.s3.tenor_label')||'Tenor'}
          <div class="fw-tr-input-wrap">
            <input class="fw-input fw-tr-num fw-tr-ten" type="number" min="1" max="40" step="1" value="${t.tenor ?? def.tenor}" data-id="${t.id}" data-field="tenor">
            <span class="fw-tr-unit">yr</span>
          </div>
        </label>` : ''}
        <span class="fw-tr-amt">${displayAmt}</span>
      </div>
      ${repNote}
      ${priWrapNote}
      ${trustToggleHTML}
    </div>
    <button class="fw-tr-remove" data-id="${t.id}" aria-label="${t('fw.s3.remove_tranche')||'Remove tranche'}">×</button>
  </div>`;
}

function seedGreenfieldTranches() {
  const tmpl = greenfieldTemplate();
  if (!tmpl) return;  // no template found; leave existing tranches

  const rows = [];
  let nextId = 1;

  function addRow(type, pct, labelOverride) {
    const def = TRANCHE_DEFS[type] ?? TRANCHE_DEFS.private_equity;
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

  // first_loss_pct → first_loss (only if > 0)
  if (tmpl.first_loss_pct > 0) addRow('first_loss', tmpl.first_loss_pct);

  // concessional_pct → concessional_ifi (only if > 0)
  if (tmpl.concessional_pct > 0) addRow('concessional_ifi', tmpl.concessional_pct);

  // senior_ifi_pct → senior_ifi (only if > 0)
  if (tmpl.senior_ifi_pct > 0) addRow('senior_ifi', tmpl.senior_ifi_pct);

  // eca_pct → eca (only if > 0)
  if (tmpl.eca_pct > 0) addRow('eca', tmpl.eca_pct);

  // dfi_equity_pct + public_equity_pct → separate tranches
  const dfiEq  = tmpl.dfi_equity_pct    || 0;
  const pubEq  = tmpl.public_equity_pct  || 0;
  const privEq = tmpl.private_equity_pct || 0;
  const diasEq = tmpl.diaspora_pct       || 0;

  if (dfiEq > 0 && pubEq > 0) {
    addRow('dfi_equity', dfiEq);
    addRow('public_equity', pubEq);
  } else if (dfiEq > 0) {
    addRow('dfi_equity', dfiEq);
  } else if (pubEq > 0) {
    addRow('public_equity', pubEq);
  }
  if (privEq > 0) addRow('private_equity', privEq);
  if (diasEq > 0) addRow('diaspora', diasEq);

  // commercial_bank_debt_pct → commercial_bank (only if > 0)
  if (tmpl.commercial_bank_debt_pct > 0) addRow('commercial_bank', tmpl.commercial_bank_debt_pct);

  // institutional_debt_pct → institutional_debt (only if > 0)
  if (tmpl.institutional_debt_pct > 0) addRow('institutional_debt', tmpl.institutional_debt_pct);

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

  // Catalog card toggles
  document.querySelectorAll('.fw-catalog-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.trancheType;
      const existing = W.tranches.findIndex(t => t.type === type);
      if (existing >= 0) {
        // Remove if already there (only if more than 1 tranche)
        if (W.tranches.length > 1) W.tranches.splice(existing, 1);
      } else {
        // Add with default ret = 0 for reparations, def.ret for others
        const def = TRANCHE_DEFS[type] ?? TRANCHE_DEFS.private_equity;
        const ret = type === 'reparations' ? 0 : def.ret;
        W.tranches.push({ id: W.nextId++, type, pct: 0, ret, tenor: def.tenor });
      }
      render();
    });
  });

  // Help panel
  document.getElementById('fwHelpBtn')?.addEventListener('click', () => {
    const p = document.getElementById('fwHelpPanel');
    if (p) p.hidden = !p.hidden;
  });
  document.getElementById('fwHelpClose')?.addEventListener('click', () => {
    const p = document.getElementById('fwHelpPanel');
    if (p) p.hidden = true;
  });

  document.querySelectorAll('.fw-tr-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = +e.currentTarget.dataset.id;
      if (W.tranches.length <= 1) return;
      W.tranches = W.tranches.filter(t => t.id !== id);
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
        allocEl.textContent = `${t('fw.s3.allocated')||'Allocated'}: ${sumPct.toFixed(0)}%`;
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
    const def  = TRANCHE_DEFS[t.type] ?? TRANCHE_DEFS.private_equity;
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

  const growthProjects = W.growthProjects ?? [];
  const growthTotal    = growthProjects.reduce((s, p) => s + p.scale_usd_m, 0);
  const assetTotal     = total - growthTotal;

  // Portfolio revenue estimate from sector yield
  const portfolioRevenue = sel.reduce((s, a) => {
    const yield_ = SECTOR_REVENUE_YIELD[a.sector] ?? 0.03;
    return s + (a.cost_paths?.[W.path]?.central_usd_m ?? 0) * yield_;
  }, 0);

  // Annual debt service on return-bearing tranches (excl. grants, reparations, public equity, first_loss)
  const annualDebtSvc = tranches
    .filter(t => t.effR > 0 && t.type !== 'public_equity' && t.type !== 'first_loss' && !t.def.isFlag)
    .reduce((s, t) => s + t.annualCost, 0);

  const dscr = annualDebtSvc > 0 ? portfolioRevenue / annualDebtSvc : null;

  // Russian funding gap: capitalise any revenue shortfall at trust drawdown rate
  const revenueShortfall   = Math.max(0, annualDebtSvc - portfolioRevenue);
  const extraRussianNeeded = revenueShortfall / TRUST_DRAWDOWN_PCT;
  const totalRussianNeeded = repAmt + extraRussianNeeded;

  return {
    sel, total, low, high, tranches,
    grantAmt, concAmt, privAmt, repAmt, pubTotal,
    blended, debtSvc, mobRatio, warExtra,
    repPctClaim:  repAmt / KSE_CLAIM_USD_M * 100,
    repPctFrozen: repAmt / FROZEN_USD_M   * 100,
    duringSupport: W.timing === 'after' ? 0 : pubTotal,
    postSupport:   W.timing === 'during' ? 0 : pubTotal,
    growthProjects, growthTotal, assetTotal,
    portfolioRevenue, annualDebtSvc, dscr,
    revenueShortfall, extraRussianNeeded, totalRussianNeeded,
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
    const displayPct  = isTrustMode ? '-' : `${t.pct.toFixed(0)}%`;
    const displayAmt  = isTrustMode ? `USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr` : fmtM(t.amt.toFixed(1));
    return `<tr>
      <td><span class="fw-type-dot" style="background:${t.def.col}"></span>${isTrustMode ? 'ERA/Trust — Availability Payment' : t.def.label}${confidenceBadge(t.type)}${trustLabel}</td>
      <td>${displayPct}</td>
      <td>${displayAmt}</td>
      <td>${t.effR.toFixed(1)}% ${warTag}</td>
      <td>${t.tenor ?? '-'}</td>
    </tr>`;
  }).join('');

  const repSection = r.repAmt > 0 && W.timing !== 'during' ? `
    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.rep_scenario_title')||'Russian reparations scenario'}</h4>
      <p class="fw-rep-ctx">${t('fw.s4.rep_source')||'Source: KSE Institute "Russia Will Pay" ($486B total claim); G7-frozen assets ~$300B.'}</p>
      <div class="fw-rep-bar-wrap">
        <div class="fw-rep-bar-track">
          <div class="fw-rep-bar-fill" style="width:${Math.min(r.repPctFrozen, 100).toFixed(3)}%"></div>
        </div>
        <div class="fw-rep-bar-labels">
          <span>${t('fw.s4.this_portfolio')||'This portfolio'}: ${fmtM(r.repAmt.toFixed(0))}</span>
          <span>${t('fw.s4.frozen_assets')||'Frozen assets'}: $300B</span>
        </div>
      </div>
      <div class="fw-rep-stats">
        <span><strong>${r.repPctClaim.toFixed(3)}%</strong> ${t('fw.s4.of_kse_claim_short')||'of $486B claim'}</span>
        <span><strong>${r.repPctFrozen.toFixed(3)}%</strong> ${t('fw.s4.of_frozen_short')||'of $300B frozen'}</span>
      </div>
    </div>` : '';

  const nonRepTotal  = r.total - r.repAmt;
  const toRaise      = Math.max(0, nonRepTotal);
  const russiaPct    = r.total > 0 ? (r.repAmt / r.total * 100).toFixed(0) : 0;

  return `<div class="fw-step fw-results">
    <h3 class="fw-sh">${t('fw.s4.title')||'Financing structure analysis'}</h3>
    <div class="fw-results-meta">${r.sel.length} ${t('fw.s2.project')||'project'}${r.sel.length !== 1 ? (t('fw.s2.projects_plural_suffix')||'s') : ''} · ${PATH_LABELS[W.path]} · ${TIMING_LABELS[W.timing]}</div>

    <!-- Russian obligation headline box — the key output -->
    ${r.totalRussianNeeded > 0 ? `
    <div class="fw-russia-headline">
      <div class="fw-rh-row">
        <div class="fw-rh-item fw-rh-russia">
          <span class="fw-rh-label">🇷🇺 ${t('fw.s4.russia_must_contribute')||'Russia must contribute'}</span>
          <span class="fw-rh-value">${fmtM(r.totalRussianNeeded.toFixed(0))}</span>
          <span class="fw-rh-sub">${r.repPctFrozen.toFixed(2)}% ${t('fw.s4.of_frozen_short')||'of $300B frozen'} · ${(r.totalRussianNeeded / KSE_CLAIM_USD_M * 100).toFixed(2)}% ${t('fw.s4.of_kse_claim_short')||'of $486B claim'}</span>
        </div>
        <div class="fw-rh-item fw-rh-dscr">
          <span class="fw-rh-label">📊 ${t('fw.s4.can_projects_deliver')||'Can projects deliver returns?'}</span>
          <span class="fw-rh-value" style="color:${r.dscr == null ? '#888' : r.dscr >= 1.2 ? '#27ae60' : r.dscr >= 0.8 ? '#e67e22' : '#e74c3c'}">${r.dscr != null ? r.dscr.toFixed(2) + '× DSCR' : 'N/A'}</span>
          <span class="fw-rh-sub">${r.dscr == null ? (t('fw.s4.dscr_no_tranches')||'No return-bearing tranches') : r.dscr >= 1.2 ? (t('fw.s4.dscr_sustaining')||'Self-sustaining — revenues cover debt service') : r.dscr >= 0.8 ? (t('fw.s4.dscr_marginal')||'Marginal — needs concessional support') : (t('fw.s4.dscr_not_sustaining')||'Not self-sustaining — Russian reparations bridge the gap')}</span>
        </div>
        <div class="fw-rh-item fw-rh-market">
          <span class="fw-rh-label">💼 ${t('fw.s4.market_donor_raise')||'Market / donor raise'}</span>
          <span class="fw-rh-value">${fmtM((r.total - r.repAmt).toFixed(0))}</span>
          <span class="fw-rh-sub">${t('fw.s4.grants_conc_private')||'Grants + concessional + private capital'}</span>
        </div>
      </div>
      ${r.revenueShortfall > 0 ? `<div class="fw-rh-gap-note">⚠ ${t('fw.s4.revenue_shortfall_prefix')||'Revenue shortfall of'} ${fmtM(r.revenueShortfall.toFixed(0))}/yr → ${t('fw.s4.revenue_shortfall_suffix')||'needs additional'} ${fmtM(r.extraRussianNeeded.toFixed(0))} ${t('fw.s4.russian_rep_service')||'Russian reparations to service debt'}</div>` : `<div class="fw-rh-gap-note fw-rh-ok">✓ ${t('fw.s4.revenue_ok')||'Selected projects generate enough revenue to service the capital stack — Russian reparations are structural, not required for debt service'}</div>`}
    </div>` : `
    <div class="fw-russia-headline fw-rh-no-russia">
      <span class="fw-rh-label">💼 ${t('fw.s4.no_russia_tranche')||'No Russian reparations tranche — market/donor raise only'}</span>
      <span class="fw-rh-value">${fmtM(r.total)}</span>
      ${r.dscr != null ? `<span class="fw-rh-sub">DSCR: ${r.dscr.toFixed(2)}× — ${r.dscr >= 1.2 ? (t('fw.s4.dscr_self_sustaining')||'Projects are self-sustaining') : (t('fw.s4.dscr_need_conc')||'Projects need concessional support')}</span>` : ''}
    </div>`}

    <!-- Summary banner -->
    <div class="fw-summary-banner">
      <div class="fw-sb-item fw-sb-raise">
        <span class="fw-sb-label">${t('fw.s4.total_to_raise')||'Total to raise'}</span>
        <span class="fw-sb-value">${fmtM(r.total)}</span>
        <span class="fw-sb-sub">${t('fw.s4.range')||'Range'}: ${fmtM(r.low)} – ${fmtM(r.high)}</span>
      </div>
      ${r.repAmt > 0 ? `
      <div class="fw-sb-item fw-sb-russia">
        <span class="fw-sb-label">${t('fw.s4.russia_must_pay')||'Russia must pay'}</span>
        <span class="fw-sb-value">${fmtM(r.repAmt.toFixed(0))}</span>
        <span class="fw-sb-sub">${russiaPct}% ${t('fw.s4.of_total')||'of total'} · ${r.repPctFrozen.toFixed(2)}% ${t('fw.s4.of_frozen_short')||'of $300B frozen'}</span>
      </div>
      <div class="fw-sb-item fw-sb-market">
        <span class="fw-sb-label">${t('fw.s4.market_donor_raise')||'Market / donor raise'}</span>
        <span class="fw-sb-value">${fmtM(toRaise.toFixed(0))}</span>
        <span class="fw-sb-sub">${t('fw.s4.grants_conc_private_short')||'Grants + concessional + private'}</span>
      </div>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.portfolio_cost')||'Portfolio cost'}</h4>
      <div class="fw-cost-display">
        <span class="fw-cost-central">${fmtM(r.total)} <span class="fw-cost-lbl">${t('fw.s4.central')||'central'}</span></span>
        <span class="fw-cost-range">${t('fw.s4.range')||'Range'}: ${fmtM(r.low)} – ${fmtM(r.high)}</span>
      </div>
      ${r.growthProjects.length > 0 ? `
      <div class="fw-cost-breakdown">
        <div class="fw-cb-row">
          <span class="fw-cb-lbl">🔴 ${t('fw.s4.damage_rehab')||'Damage rehabilitation'} (${r.sel.length} ${t('fw.s4.assets')||'assets'})</span>
          <span class="fw-cb-val">${fmtM(r.assetTotal)}</span>
        </div>
        ${r.growthProjects.map(p => `
        <div class="fw-cb-row fw-cb-growth">
          <span class="fw-cb-lbl">🌱 ${p.label} <span class="fw-cb-sector">${p.sector}</span></span>
          <span class="fw-cb-val">${fmtM(p.scale_usd_m)}</span>
        </div>`).join('')}
        <div class="fw-cb-row fw-cb-total">
          <span class="fw-cb-lbl">${t('fw.s4.total_investment')||'Total investment programme'}</span>
          <span class="fw-cb-val">${fmtM(r.total)}</span>
        </div>
      </div>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.capital_stack')||'Capital stack'}</h4>
      ${allocBar(r.total)}
      <table class="fw-results-table">
        <thead><tr><th>${t('fw.s4.th_tranche')||'Tranche'}</th><th>%</th><th>${t('fw.s4.th_amount')||'Amount'}</th><th>${t('fw.s4.th_return')||'Return'}</th><th>${t('fw.s4.th_tenor')||'Tenor'}</th></tr></thead>
        <tbody>${trancheRows}</tbody>
      </table>
    </div>

    ${(() => {
      const { dscr, portfolioRevenue, annualDebtSvc, revenueShortfall, extraRussianNeeded, repAmt: repAmtV, totalRussianNeeded } = r;
      const dscrColor = dscr == null ? '#888' : dscr >= 1.2 ? '#27ae60' : dscr >= 0.8 ? '#e67e22' : '#e74c3c';
      const dscrLabel = dscr == null ? 'N/A' : dscr >= 1.2 ? (t('fw.s4.dscr_viable')||'Commercially viable') : dscr >= 0.8 ? (t('fw.s4.dscr_marginal_short')||'Marginal — needs support') : (t('fw.s4.dscr_not_sustaining_short')||'Not self-sustaining');
      return `
    <div class="fw-results-sect fw-viability-sect">
      <h4 class="fw-results-h4">${t('fw.s4.viability_title')||'Return viability & Russian funding requirement'}</h4>
      <div class="fw-viability-grid">
        <div class="fw-vg-item">
          <span class="fw-vg-val">${fmtM(portfolioRevenue.toFixed(0))}/yr</span>
          <span class="fw-vg-lbl">${t('fw.s4.portfolio_revenue')||'Est. portfolio annual revenue'}</span>
          <span class="fw-vg-note">${t('fw.s4.portfolio_revenue_note')||'Based on sector revenue yield assumptions'}</span>
        </div>
        <div class="fw-vg-item">
          <span class="fw-vg-val">${fmtM(annualDebtSvc.toFixed(0))}/yr</span>
          <span class="fw-vg-lbl">${t('fw.s4.annual_debt_svc')||'Required annual debt service'}</span>
          <span class="fw-vg-note">${t('fw.s4.annual_debt_svc_note')||'Return-bearing tranches only'}</span>
        </div>
        ${dscr != null ? `<div class="fw-vg-item fw-vg-dscr">
          <span class="fw-vg-val" style="color:${dscrColor}">${dscr.toFixed(2)}×</span>
          <span class="fw-vg-lbl">DSCR</span>
          <span class="fw-vg-note" style="color:${dscrColor}">${dscrLabel}</span>
        </div>` : ''}
      </div>
      ${extraRussianNeeded > 0 ? `
      <div class="fw-russia-gap">
        <div class="fw-rg-header">${t('fw.s4.shortfall_header')||'Revenue shortfall → additional Russian contribution needed'}</div>
        <div class="fw-rg-calc">
          ${t('fw.s4.shortfall_label')||'Shortfall'}: <strong>${fmtM(revenueShortfall.toFixed(0))}/yr</strong>
          ${t('fw.s4.capitalised_at')||'capitalised at'} ${(TRUST_DRAWDOWN_PCT*100).toFixed(0)}% =
          <strong class="fw-rg-extra">${fmtM(extraRussianNeeded.toFixed(0))}</strong> ${t('fw.s4.additional_reparations')||'additional reparations'}
        </div>
        <div class="fw-rg-total">
          ${t('fw.s4.total_russian_obligation')||'Total Russian obligation for this portfolio'}:
          <strong class="fw-rg-total-val">${fmtM(totalRussianNeeded.toFixed(0))}</strong>
          <span class="fw-rg-breakdown">(${fmtM(repAmtV.toFixed(0))} ${t('fw.s4.allocated')||'allocated'} + ${fmtM(extraRussianNeeded.toFixed(0))} ${t('fw.s4.gap_coverage')||'gap coverage'})</span>
        </div>
      </div>` : `
      <div class="fw-russia-gap fw-rg-green">
        <div class="fw-rg-header">✓ ${t('fw.s4.revenue_sufficient')||'Project revenues sufficient to service selected tranches'}</div>
        ${repAmtV > 0 ? `<div class="fw-rg-calc">${t('fw.s4.rep_structural_prefix')||'Russian reparations allocated'} (${fmtM(repAmtV.toFixed(0))}) ${t('fw.s4.rep_structural_suffix')||'are structural, not required for debt service in this scenario.'}</div>` : ''}
      </div>`}
    </div>`;
    })()}

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.key_metrics')||'Key metrics'}</h4>
      <div class="fw-metrics-grid">
        <div class="fw-mc"><span class="fw-mc-val">${r.blended.toFixed(2)}%</span><span class="fw-mc-lbl">${t('fw.metrics.blended_coc')||'Blended cost of capital'}</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.pubTotal.toFixed(0))}</span><span class="fw-mc-lbl">${t('fw.metrics.public_support')||'Public support needed'}</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.grantAmt.toFixed(0))}</span><span class="fw-mc-lbl">${t('fw.metrics.grant_req')||'Grant requirement'}</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.debtSvc.toFixed(1))}/yr</span><span class="fw-mc-lbl">${t('fw.metrics.annual_debt_svc')||'Annual debt service'}</span></div>
        ${r.mobRatio ? `<div class="fw-mc fw-mc-hl"><span class="fw-mc-val">${r.mobRatio}×</span><span class="fw-mc-lbl">${t('fw.metrics.mob_ratio')||'Private mobilisation ratio'}</span></div>` : ''}
      </div>
      ${r.mobRatio ? `<p class="fw-mob-note">${t('fw.s4.mob_note_prefix')||'For every $1 of grant, this structure mobilises'} <strong>$${r.mobRatio}</strong> ${t('fw.s4.mob_note_suffix')||'of private capital.'}</p>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.support_by_phase')||'Support needed by phase'}</h4>
      <div class="fw-support-row">
        <div class="fw-support-card fw-sc-during">
          <span class="fw-sc-lbl">⚡ ${t('fw.s4.during_war')||'During war'}</span>
          <span class="fw-sc-val">${fmtM(r.duringSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'after' ? (t('fw.s4.deferred_post_war')||'Deferred to post-war') : (t('fw.s4.grants_required_now')||'Grants + concessional required now')}</span>
        </div>
        <div class="fw-support-card fw-sc-after">
          <span class="fw-sc-lbl">🕊 ${t('fw.s4.post_war')||'Post-war'}</span>
          <span class="fw-sc-val">${fmtM(r.postSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'during' ? (t('fw.s4.not_modelled')||'Not modelled') : (t('fw.s4.requires_peace')||'Requires peace settlement')}</span>
        </div>
      </div>
      ${r.warExtra > 0 ? `<p class="fw-war-note">⚡ ${t('fw.s4.war_premium_note_prefix')||'Wartime premium adds'} +${fmtM(r.warExtra.toFixed(1))}/yr ${t('fw.s4.war_premium_note_suffix')||'to annual debt service.'}</p>` : ''}
    </div>

    ${repSection}

    ${r.tranches.some(t => t.type === 'reparations' && _trustModes.get(t.id) === 'trust') ? `
    <div class="fw-disclaimer trust-footnote">
      ${t('fw.s4.trust_footnote')||`† ERA/Trust replaces a lump-sum Russian reparations tranche with annual availability payments from a Reconstruction Trust (4% drawdown · USD 286B corpus · ~USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr). Annual payment services concessional debt rather than acting as an equity injection.`}
      <a href="/trust.html" target="_blank" rel="noopener">${t('fw.s4.trust_link_full')||'See full Trust model and corpus trajectory →'}</a>
    </div>` : ''}

    <div class="fw-disclaimer">
      ${t('fw.s4.disclaimer')||'Cost and financing figures are estimates derived from published benchmarks (RDNA3, KSE Institute). Not guarantees, procurement quotes, or substitutes for transaction-level due diligence.'}
    </div>

    <!-- AI memo (loaded asynchronously after render) -->
    <div class="fw-results-sect" id="fwMemoSection">
      <h4 class="fw-results-h4">${t('fw.s4.financing_memo')||'Financing memo'}</h4>
      <div id="fwMemoContent" class="fw-memo-loading">
        <span class="fw-memo-spinner"></span> ${t('fw.s4.memo_generating')||'Generating institutional financing memo…'}
      </div>
    </div>

  </div>`;
}

function step4GreenfieldHTML() {
  const r      = computeResults();
  const arch   = greenfieldArchetype();
  const sector = _growthData?.sectors.find(s => s.id === W.greenfield.sectorId);
  const tmpl   = greenfieldTemplate();

  const memoTitle = arch && sector
    ? `${sector.icon} ${arch.label} — ${t('fw.s4.financing_memo')||'Financing Memo'}`
    : (t('fw.s4.gf_financing_memo')||'Greenfield Project — Financing Memo');

  const trancheRows = r.tranches.map(t => {
    const warTag = COMMERCIAL_TYPES.has(t.type) && (W.timing === 'during' || W.timing === 'phased')
      ? `<span class="fw-war-tag">+${WAR_PREMIUM}% war</span>` : '';
    const isTrustMode = t.type === 'reparations' && _trustModes.get(t.id) === 'trust';
    const trustLabel  = isTrustMode
      ? ` <span class="trust-annual-chip">Annual: USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr †</span>`
      : '';
    // Use _labelOverride for seeded greenfield tranches if present
    const trancheLabel = t._labelOverride ?? (isTrustMode ? 'ERA/Trust — Availability Payment' : t.def.label);
    const displayPct   = isTrustMode ? '-' : `${t.pct.toFixed(0)}%`;
    const displayAmt   = isTrustMode ? `USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr` : fmtM(t.amt.toFixed(1));
    return `<tr>
      <td><span class="fw-type-dot" style="background:${t.def.col}"></span>${trancheLabel}${confidenceBadge(t.type)}${trustLabel}</td>
      <td>${displayPct}</td>
      <td>${displayAmt}</td>
      <td>${t.effR.toFixed(1)}% ${warTag}</td>
      <td>${t.tenor ?? '-'}</td>
    </tr>`;
  }).join('');

  const repSection = r.repAmt > 0 && W.timing !== 'during' ? `
    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.rep_scenario_title')||'Russian reparations scenario'}</h4>
      <p class="fw-rep-ctx">${t('fw.s4.rep_source')||'Source: KSE Institute "Russia Will Pay" ($486B total claim); G7-frozen assets ~$300B.'}</p>
      <div class="fw-rep-bar-wrap">
        <div class="fw-rep-bar-track">
          <div class="fw-rep-bar-fill" style="width:${Math.min(r.repPctFrozen, 100).toFixed(3)}%"></div>
        </div>
        <div class="fw-rep-bar-labels">
          <span>${t('fw.s4.this_project')||'This project'}: ${fmtM(r.repAmt.toFixed(0))}</span>
          <span>${t('fw.s4.frozen_assets')||'Frozen assets'}: $300B</span>
        </div>
      </div>
      <div class="fw-rep-stats">
        <span><strong>${r.repPctClaim.toFixed(3)}%</strong> ${t('fw.s4.of_kse_claim_short')||'of $486B claim'}</span>
        <span><strong>${r.repPctFrozen.toFixed(3)}%</strong> ${t('fw.s4.of_frozen_short')||'of $300B frozen'}</span>
      </div>
    </div>` : '';

  return `<div class="fw-step fw-results fw-results-greenfield">
    <h3 class="fw-sh">${memoTitle}</h3>
    <div class="fw-results-meta">${t('fw.s4.gf_meta_prefix')||'Greenfield'} ${sector ? sector.label : ''} · ${TIMING_LABELS[W.timing]}</div>

    ${sector ? `<p class="fw-gf-results-thesis">${sector.thesis_one_line}</p>` : ''}

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.gf_project_type_scale')||'Project type & scale'}</h4>
      <div class="fw-cost-display">
        <span class="fw-cost-central">${fmtM(r.total)} <span class="fw-cost-lbl">${t('fw.s4.fixed_project_scale')||'fixed project scale'}</span></span>
      </div>
      <p class="fw-gf-type-note">${t('fw.s4.project_type_prefix')||'Project type: Greenfield'} ${sector ? sector.label : ''}</p>
      ${tmpl ? `<p class="fw-gf-tmpl-note">${t('fw.s4.gf_tmpl_note_prefix')||'Capital structure pre-populated from uVidNova greenfield template'} ${tmpl.template_id}. ${t('fw.s4.gf_tmpl_note_suffix')||'Adjust tranches in Step 3.'}</p>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.capital_stack')||'Capital stack'}</h4>
      ${allocBar(r.total)}
      <table class="fw-results-table">
        <thead><tr><th>${t('fw.s4.th_tranche')||'Tranche'}</th><th>%</th><th>${t('fw.s4.th_amount')||'Amount'}</th><th>${t('fw.s4.th_return')||'Return'}</th><th>${t('fw.s4.th_tenor')||'Tenor'}</th></tr></thead>
        <tbody>${trancheRows}</tbody>
      </table>
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.key_metrics')||'Key metrics'}</h4>
      <div class="fw-metrics-grid">
        <div class="fw-mc"><span class="fw-mc-val">${r.blended.toFixed(2)}%</span><span class="fw-mc-lbl">${t('fw.metrics.blended_coc')||'Blended cost of capital'}</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.pubTotal.toFixed(0))}</span><span class="fw-mc-lbl">${t('fw.metrics.public_support')||'Public support needed'}</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.grantAmt.toFixed(0))}</span><span class="fw-mc-lbl">${t('fw.metrics.grant_req')||'Grant requirement'}</span></div>
        <div class="fw-mc"><span class="fw-mc-val">${fmtM(r.debtSvc.toFixed(1))}/yr</span><span class="fw-mc-lbl">${t('fw.metrics.annual_debt_svc')||'Annual debt service'}</span></div>
        ${r.mobRatio ? `<div class="fw-mc fw-mc-hl"><span class="fw-mc-val">${r.mobRatio}×</span><span class="fw-mc-lbl">${t('fw.metrics.mob_ratio')||'Private mobilisation ratio'}</span></div>` : ''}
      </div>
      ${r.mobRatio ? `<p class="fw-mob-note">${t('fw.s4.mob_note_prefix')||'For every $1 of grant, this structure mobilises'} <strong>$${r.mobRatio}</strong> ${t('fw.s4.mob_note_suffix')||'of private capital.'}</p>` : ''}
    </div>

    <div class="fw-results-sect">
      <h4 class="fw-results-h4">${t('fw.s4.support_by_phase')||'Support needed by phase'}</h4>
      <div class="fw-support-row">
        <div class="fw-support-card fw-sc-during">
          <span class="fw-sc-lbl">⚡ ${t('fw.s4.during_war')||'During war'}</span>
          <span class="fw-sc-val">${fmtM(r.duringSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'after' ? (t('fw.s4.deferred_post_war')||'Deferred to post-war') : (t('fw.s4.grants_required_now')||'Grants + concessional required now')}</span>
        </div>
        <div class="fw-support-card fw-sc-after">
          <span class="fw-sc-lbl">🕊 ${t('fw.s4.post_war')||'Post-war'}</span>
          <span class="fw-sc-val">${fmtM(r.postSupport.toFixed(0))}</span>
          <span class="fw-sc-note">${W.timing === 'during' ? (t('fw.s4.not_modelled')||'Not modelled') : (t('fw.s4.requires_peace')||'Requires peace settlement')}</span>
        </div>
      </div>
      ${r.warExtra > 0 ? `<p class="fw-war-note">⚡ ${t('fw.s4.war_premium_note_prefix')||'Wartime premium adds'} +${fmtM(r.warExtra.toFixed(1))}/yr ${t('fw.s4.war_premium_note_suffix')||'to annual debt service.'}</p>` : ''}
    </div>

    ${repSection}

    ${r.tranches.some(t => t.type === 'reparations' && _trustModes.get(t.id) === 'trust') ? `
    <div class="fw-disclaimer trust-footnote">
      ${t('fw.s4.trust_footnote')||`† ERA/Trust replaces a lump-sum Russian reparations tranche with annual availability payments from a Reconstruction Trust (4% drawdown · USD 286B corpus · ~USD ${trustAnnualPayment_usd_m().toLocaleString()}M/yr). Annual payment services concessional debt rather than acting as an equity injection.`}
      <a href="/trust.html" target="_blank" rel="noopener">${t('fw.s4.trust_link_full')||'See full Trust model and corpus trajectory →'}</a>
    </div>` : ''}

    <div class="fw-disclaimer">
      ${t('fw.s4.gf_disclaimer')||'Project scale and capital structure are indicative estimates pre-populated from the uVidNova greenfield template library. Not guarantees, procurement quotes, or substitutes for transaction-level due diligence.'}
    </div>

    <!-- AI memo (loaded asynchronously after render) -->
    <div class="fw-results-sect" id="fwMemoSection">
      <h4 class="fw-results-h4">${t('fw.s4.financing_memo')||'Financing memo'}</h4>
      <div id="fwMemoContent" class="fw-memo-loading">
        <span class="fw-memo-spinner"></span> ${t('fw.s4.memo_generating')||'Generating institutional financing memo…'}
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
      ...(r.growthProjects.length > 0 ? {
        growth_projects: r.growthProjects.map(p => ({ label: p.label, sector: p.sector, scale_usd_m: p.scale_usd_m })),
        asset_rehabilitation_usd_m: r.assetTotal,
        growth_investment_usd_m: r.growthTotal,
      } : {}),
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
      memoEl.textContent = `${t('fw.s4.memo_error_prefix')||'Memo unavailable'}: ${err.message}. ${t('fw.s4.memo_error_suffix')||'You can still download the numeric brief above.'}`;
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
      <td>${t.tenor ?? '-'}</td>
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

<div class="disclaimer">Cost and financing-structure figures are estimates derived from published unit-cost benchmarks (RDNA3, KSE Institute) and comparable Ukrainian precedents. They are not guarantees, not procurement quotes, and not a substitute for transaction-level due diligence. uVidNova — uvidnova.netlify.app</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `uvidnova-finance-brief-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * trust-page.js — VidNova Trust interactive module orchestrator.
 * 7 interactive modules. No LLM involvement in any numeric output.
 * State persisted to localStorage under key 'uvidnova.trust_model.state.v1'.
 *
 * Dependencies: Chart.js (loaded from CDN in trust.html), trust-calculator.js
 */

import {
  simulateNavTrajectory,
  computeAnnualAP,
  computeSupportableDebt,
  computeTotalMobilised,
  computeTrustTrajectory,
  computeDepletionYears,
  fmtBn,
  fmtM
} from '/js/trust-calculator.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'uvidnova.trust_model.state.v1';

const NAVY   = '#1a3a6b';
const GOLD   = '#c9a227';
const GOLD_L = '#f5c842';

// Channel colours (must match allocation_defaults.json)
const CH_COLOURS = {
  grants:               '#27ae60',
  concessional:         '#2980b9',
  equity:               '#8e44ad',
  availability_payments:'#f0a500',
  endowment_reserve:    '#1a3a6b'
};

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  scenario:         'A',
  nav_usd_bn:       75,
  real_return_pct:  4.0,
  deployment_rate_pct: 6.0,
  horizon_years:    30,
  recycling_rate_pct: 15,

  // Capital sources (Scenario A)
  sources_A: {
    frozen_russian_assets: 300,
    g7_era_loan:           50,
    eu_ukraine_facility:   54,
    bilateral_donors:      20,
    diaspora_bonds:         5,
    privatisation:          0
  },
  // Capital sources (Scenario B)
  sources_B: {
    reparations_direct:   200,
    frozen_asset_transfer:150,
    eu_successor:          30,
    bilateral_donors_b:    25,
    diaspora_bonds_b:      10,
    privatisation_b:       15
  },

  // Allocation channel percentages (must sum to 100)
  allocation: {
    grants:               20,
    concessional:         30,
    equity:               25,
    availability_payments:15,
    endowment_reserve:    10
  },

  // Leverage: selected instrument id
  leverage_selected: 'isif_direct',
  leverage_capital_usd_bn: 10,

  // Module collapsed state
  collapsed: {}
};

// ── Application state ─────────────────────────────────────────────────────────

let state = loadState();
let capitalSourcesData  = null;
let scenariosData       = null;
let returnData          = null;
let allocationData      = null;
let leverageData        = null;
let strategicData       = null;
let precedentsData      = null;
let assetsIndex         = null;

// Chart.js instances (destroyed and recreated on update)
let growthChart     = null;
let allocationChart = null;

// ── Persistence ───────────────────────────────────────────────────────────────

function loadState() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      return Object.assign({}, DEFAULT_STATE, JSON.parse(stored));
    }
  } catch (_) { /* ignore */ }
  return Object.assign({}, DEFAULT_STATE);
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (_) { /* ignore */ }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadAll() {
  const paths = [
    '/data/trust_model/capital_sources.json',
    '/data/trust_model/scenarios.json',
    '/data/trust_model/return_assumptions.json',
    '/data/trust_model/allocation_defaults.json',
    '/data/trust_model/leverage_multipliers.json',
    '/data/trust_model/strategic_assets.json',
    '/data/trust_model/precedents.json',
    '/data/assets/index.json'
  ];

  const results = await Promise.allSettled(paths.map(p => fetch(p).then(r => r.json())));

  capitalSourcesData = results[0].value ?? null;
  scenariosData      = results[1].value ?? null;
  returnData         = results[2].value ?? null;
  allocationData     = results[3].value ?? null;
  leverageData       = results[4].value ?? null;
  strategicData      = results[5].value ?? null;
  precedentsData     = results[6].value ?? null;
  assetsIndex        = results[7].value ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(n) {
  return `${n.toFixed(1)}%`;
}

function fmtBnDisplay(n) {
  return fmtBn(n);
}

function allocSum() {
  return Object.values(state.allocation).reduce((a, b) => a + b, 0);
}

function currentSources() {
  return state.scenario === 'A' ? state.sources_A : state.sources_B;
}

function computeTotalNav() {
  // NAV = sum of active sources for the selected scenario (values are in USD bn)
  const src = currentSources();
  return Object.values(src).reduce((a, b) => a + b, 0);
}

// ── Module 1: Capital Formation ───────────────────────────────────────────────

function renderCapitalFormation() {
  const container = document.getElementById('m1-body');
  if (!container || !capitalSourcesData) return;

  const scenarioKey = `scenario_${state.scenario.toLowerCase()}`;
  const sources = capitalSourcesData.sources[scenarioKey] ?? [];

  const activeSrc = state.scenario === 'A' ? state.sources_A : state.sources_B;

  let html = `
    <div class="trust-two-col">
      <div>
        <div class="trust-scenario-toggle" id="scenarioToggle">
          <button class="trust-scenario-btn ${state.scenario === 'A' ? 'active' : ''}" data-scenario="A">
            Scenario A<br><small>Wartime</small>
          </button>
          <button class="trust-scenario-btn ${state.scenario === 'B' ? 'active' : ''}" data-scenario="B">
            Scenario B<br><small>Hague + Post-War</small>
          </button>
        </div>
        <div class="trust-infobox">
          <strong>${state.scenario === 'A' ? 'Scenario A — Wartime (ERA + Multilateral)' : 'Scenario B — Hague Reparations + Full Asset Transfer'}</strong>
          ${state.scenario === 'A'
            ? 'Trust capitalised from instruments legally available during active conflict. ~$280B in frozen Russian assets remain in G7/EU custodians; their windfall interest (~$3B/yr) backs the ERA loan. Multilateral and EU Facility pledges complete the corpus. Russia\'s principal liability is acknowledged — not yet transferred.'
            : 'Trust capitalised post-ceasefire from two parallel tracks: (1) direct reparations from Russia awarded by the ICJ / Hague tribunal (Ukraine\'s documented claim: $486B per RDNA3); (2) full transfer of the frozen $280B principal under the US REPO Act and G7 framework. Larger corpus — mobilisation timeline 2–5 years from ceasefire.'}
        </div>
        <div class="trust-sliders" id="m1-sliders">`;

  for (const src of sources) {
    const val = activeSrc[src.id] ?? src.default_usd_bn;
    html += `
          <div class="trust-slider-row">
            <div>
              <span class="trust-slider-label">${src.label}</span>
              <span class="trust-slider-source">Source: ${src.source_label}</span>
            </div>
            <input type="range" class="trust-range"
              data-source="${src.id}"
              min="${src.range_min_usd_bn}"
              max="${src.range_max_usd_bn}"
              step="${src.step_usd_bn}"
              value="${val}"
              aria-label="${src.label}">
            <span class="trust-range-val" id="m1-val-${src.id}">${fmtBn(val)}</span>
          </div>`;
  }

  html += `
        </div>
      </div>
      <div>
        <div class="trust-total-nav" id="m1-total-nav">${fmtBn(computeTotalNav())}</div>
        <div class="trust-total-label">Total Trust NAV at formation</div>
        <div class="trust-stack-bar" id="m1-stack-bar"></div>
        <div class="trust-stack-legend" id="m1-stack-legend"></div>
      </div>
    </div>`;

  container.innerHTML = html;

  // Wire scenario toggle
  container.querySelectorAll('.trust-scenario-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.scenario = btn.dataset.scenario;
      // Sync NAV from computed total
      state.nav_usd_bn = Math.round(computeTotalNav() * 10) / 10;
      saveState();
      renderCapitalFormation();
      renderNavBand();
      renderGrowthTrajectory();
    });
  });

  // Wire source sliders
  container.querySelectorAll('.trust-range[data-source]').forEach(input => {
    input.addEventListener('input', () => {
      const id  = input.dataset.source;
      const val = parseFloat(input.value);
      if (state.scenario === 'A') state.sources_A[id] = val;
      else                        state.sources_B[id] = val;

      const label = document.getElementById(`m1-val-${id}`);
      if (label) label.textContent = `${fmtBn(val)}`;

      state.nav_usd_bn = Math.round(computeTotalNav() * 10) / 10;
      saveState();

      const totalEl = document.getElementById('m1-total-nav');
      if (totalEl) totalEl.textContent = `${fmtBn(computeTotalNav())}`;

      renderStackBar();
      renderNavBand();
      renderGrowthTrajectory();
    });
  });

  renderStackBar();
}

function renderStackBar() {
  const bar    = document.getElementById('m1-stack-bar');
  const legend = document.getElementById('m1-stack-legend');
  if (!bar || !capitalSourcesData) return;

  const scenarioKey = `scenario_${state.scenario.toLowerCase()}`;
  const sources     = capitalSourcesData.sources[scenarioKey] ?? [];
  const activeSrc   = state.scenario === 'A' ? state.sources_A : state.sources_B;
  const total       = Object.values(activeSrc).reduce((a, b) => a + b, 0) || 1;

  bar.innerHTML = sources.map(src => {
    const val = activeSrc[src.id] ?? 0;
    const pct = (val / total * 100).toFixed(1);
    return `<div class="trust-stack-segment" style="width:${pct}%;background:${src.colour}" title="${src.label}: ${fmtBn(val)}">
      ${pct > 8 ? `${fmtBn(val)}` : ''}
    </div>`;
  }).join('');

  legend.innerHTML = sources.map(src => {
    const val = activeSrc[src.id] ?? 0;
    return `<span class="trust-stack-legend-item">
      <span class="trust-stack-legend-swatch" style="background:${src.colour}"></span>
      ${src.label} — ${fmtBn(val)}
    </span>`;
  }).join('');
}

// ── Module 2: Growth Trajectory ───────────────────────────────────────────────

function renderGrowthTrajectory() {
  const container = document.getElementById('m2-body');
  if (!container) return;

  const returnScenarios = returnData?.scenarios ?? [];
  const selectedReturn  = returnScenarios.find(s => s.real_return_pct === state.real_return_pct)
    ?? { id: 'baseline', label: 'Baseline', real_return_pct: 4.0 };

  if (!document.getElementById('m2-inner')) {
    container.innerHTML = `
      <div id="m2-inner">
        <div class="trust-two-col">
          <div class="trust-sliders">
            <div class="trust-slider-row">
              <div>
                <span class="trust-slider-label">Real return (%)</span>
                <span class="trust-slider-source">Source: NORGES_BANK_IM long-run 4%; TEMASEK 7%</span>
              </div>
              <input type="range" class="trust-range" id="m2-return"
                min="2" max="8" step="0.5" value="${state.real_return_pct}"
                aria-label="Real return">
              <span class="trust-range-val" id="m2-return-val">${state.real_return_pct.toFixed(1)}%</span>
            </div>
            <div class="trust-slider-row">
              <div>
                <span class="trust-slider-label">Deployment rate (%/yr)</span>
                <span class="trust-slider-source">Source: ISIF 2014 mandate; RDNA3 pacing estimate</span>
              </div>
              <input type="range" class="trust-range" id="m2-deploy"
                min="2" max="12" step="0.5" value="${state.deployment_rate_pct}"
                aria-label="Deployment rate">
              <span class="trust-range-val" id="m2-deploy-val">${state.deployment_rate_pct.toFixed(1)}%</span>
            </div>
            <div class="trust-slider-row">
              <div>
                <span class="trust-slider-label">Horizon (years)</span>
                <span class="trust-slider-source">Source: Norway GPFG perpetual mandate; ISIF 10-yr review</span>
              </div>
              <input type="range" class="trust-range" id="m2-horizon"
                min="10" max="50" step="5" value="${state.horizon_years}"
                aria-label="Horizon years">
              <span class="trust-range-val" id="m2-horizon-val">${state.horizon_years} yrs</span>
            </div>
            <div class="trust-slider-row">
              <div>
                <span class="trust-slider-label">Recycling rate (%/yr)</span>
                <span class="trust-slider-source">Source: ISIF portfolio repayment model 2023</span>
              </div>
              <input type="range" class="trust-range" id="m2-recycle"
                min="5" max="30" step="5" value="${state.recycling_rate_pct}"
                aria-label="Recycling rate">
              <span class="trust-range-val" id="m2-recycle-val">${state.recycling_rate_pct.toFixed(0)}%</span>
            </div>
          </div>
          <div>
            <div class="trust-chart-container">
              <canvas id="growthChart" class="trust-canvas"></canvas>
            </div>
          </div>
        </div>
        <div class="trust-infobox" id="m2-infobox"></div>
      </div>`;

    // Wire sliders
    wireGrowthSliders();
  }

  drawGrowthChart();
  updateM2Infobox();
}

function wireGrowthSliders() {
  const sliders = [
    { id: 'm2-return',  valId: 'm2-return-val',  key: 'real_return_pct',    fmt: v => `${v.toFixed(1)}%` },
    { id: 'm2-deploy',  valId: 'm2-deploy-val',  key: 'deployment_rate_pct', fmt: v => `${v.toFixed(1)}%` },
    { id: 'm2-horizon', valId: 'm2-horizon-val', key: 'horizon_years',       fmt: v => `${v} yrs` },
    { id: 'm2-recycle', valId: 'm2-recycle-val', key: 'recycling_rate_pct',  fmt: v => `${v.toFixed(0)}%` }
  ];

  sliders.forEach(({ id, valId, key, fmt }) => {
    const input = document.getElementById(id);
    const label = document.getElementById(valId);
    if (!input) return;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      state[key] = v;
      if (label) label.textContent = fmt(v);
      saveState();
      drawGrowthChart();
      updateM2Infobox();
      renderNavBand();
    });
  });
}

function drawGrowthChart() {
  const canvas = document.getElementById('growthChart');
  if (!canvas || !window.Chart) return;

  const traj = simulateNavTrajectory({
    initialNav_usd_bn:   state.nav_usd_bn,
    realReturn_pct:      state.real_return_pct,
    deploymentRate_pct:  state.deployment_rate_pct,
    recyclingRate_pct:   state.recycling_rate_pct,
    horizonYears:        state.horizon_years,
    deploymentHorizon:   Math.round(state.horizon_years / 2)
  });

  // Baseline: 4% return, same scenario
  const baseline = simulateNavTrajectory({
    initialNav_usd_bn:   state.nav_usd_bn,
    realReturn_pct:      4.0,
    deploymentRate_pct:  6.0,
    recyclingRate_pct:   15,
    horizonYears:        state.horizon_years,
    deploymentHorizon:   Math.round(state.horizon_years / 2)
  });

  const labels     = traj.map(r => `Y${r.year}`);
  const navData    = traj.map(r => r.nav);
  const baseData   = baseline.map(r => r.nav);
  const deployData = traj.map(r => r.deployed_cumulative);

  if (growthChart) {
    growthChart.destroy();
    growthChart = null;
  }

  growthChart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Your scenario — NAV',
          data: navData,
          borderColor: NAVY,
          backgroundColor: 'rgba(26,58,107,0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'Baseline (4% return, 6% deploy)',
          data: baseData,
          borderColor: '#aaa',
          borderWidth: 1.5,
          borderDash: [5, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 3
        },
        {
          label: 'Cumulative deployed',
          data: deployData,
          borderColor: GOLD,
          backgroundColor: 'rgba(201,162,39,0.07)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmtBn(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxTicksLimit: 10 },
          grid: { color: '#eef1f5' }
        },
        y: {
          ticks: {
            font: { size: 10 },
            callback: v => fmtBn(v)
          },
          grid: { color: '#eef1f5' }
        }
      }
    }
  });
}

function updateM2Infobox() {
  const box = document.getElementById('m2-infobox');
  if (!box) return;

  const traj    = simulateNavTrajectory({
    initialNav_usd_bn:   state.nav_usd_bn,
    realReturn_pct:      state.real_return_pct,
    deploymentRate_pct:  state.deployment_rate_pct,
    recyclingRate_pct:   state.recycling_rate_pct,
    horizonYears:        state.horizon_years,
    deploymentHorizon:   Math.round(state.horizon_years / 2)
  });

  const last         = traj[traj.length - 1];
  const totalDeployed = traj.reduce((s, r) => s + r.deployment, 0);
  const annualAP     = computeAnnualAP(state.nav_usd_bn, state.allocation.availability_payments, state.deployment_rate_pct);
  const suppDebt     = computeSupportableDebt(annualAP);

  box.innerHTML = `
    <strong>Key outcomes at Year ${state.horizon_years}</strong>
    NAV: <strong>${fmtBn(last.nav)}</strong> ·
    Total deployed: <strong>${fmtBn(totalDeployed)}</strong> ·
    Annual AP budget: <strong>${fmtBn(annualAP)}</strong> ·
    Supportable concessional debt: <strong>${fmtBn(suppDebt)}</strong>
    <span class="trust-source">Sources: RDNA3, KSE, NORGES_BANK_IM (4% rule), ISIF (1.6× leverage)</span>`;
}

// ── Module 3: Allocation Strategy ────────────────────────────────────────────

function renderAllocation() {
  const container = document.getElementById('m3-body');
  if (!container || !allocationData) return;

  const channels = allocationData.channels;

  container.innerHTML = `
    <div class="trust-allocation-layout">
      <div>
        <div class="trust-donut-wrap">
          <canvas id="allocChart" class="trust-canvas" width="200" height="200"></canvas>
        </div>
      </div>
      <div>
        <div class="trust-channel-list" id="m3-channels"></div>
        <div class="trust-alloc-warning" id="m3-warning">Allocations must sum to 100% (currently <span id="m3-sum">—</span>%)</div>
        <div class="trust-infobox gold" style="margin-top:0.75rem" id="m3-ap-box"></div>
      </div>
    </div>`;

  renderChannelSliders(channels);
  drawAllocationChart(channels);
  updateAPBox();
}

function renderChannelSliders(channels) {
  const list = document.getElementById('m3-channels');
  if (!list) return;

  list.innerHTML = channels.map(ch => {
    const val = state.allocation[ch.id] ?? ch.default_pct;
    return `
      <div class="trust-channel-row">
        <div class="trust-channel-swatch" style="background:${CH_COLOURS[ch.id] ?? '#ccc'}"></div>
        <span class="trust-channel-label" title="${ch.description}">${ch.label}</span>
        <input type="range" class="trust-channel-range"
          data-channel="${ch.id}"
          min="${ch.min_pct}" max="${ch.max_pct}" step="5"
          value="${val}"
          aria-label="${ch.label} allocation">
        <span class="trust-channel-val" id="m3-val-${ch.id}">${val}%</span>
      </div>`;
  }).join('');

  list.querySelectorAll('.trust-channel-range').forEach(input => {
    input.addEventListener('input', () => {
      const id  = input.dataset.channel;
      const val = parseInt(input.value, 10);
      state.allocation[id] = val;
      const label = document.getElementById(`m3-val-${id}`);
      if (label) label.textContent = `${val}%`;

      saveState();
      validateAlloc();
      drawAllocationChart(allocationData?.channels ?? []);
      updateAPBox();
      renderGrowthTrajectory(); // AP slice change → update growth chart
      renderNavBand();
    });
  });
}

function validateAlloc() {
  const sum     = allocSum();
  const warning = document.getElementById('m3-warning');
  const sumEl   = document.getElementById('m3-sum');
  if (!warning) return;
  if (sumEl) sumEl.textContent = sum;
  warning.classList.toggle('visible', sum !== 100);
}

function drawAllocationChart(channels) {
  const canvas = document.getElementById('allocChart');
  if (!canvas || !window.Chart) return;

  const labels = channels.map(ch => ch.label);
  const data   = channels.map(ch => state.allocation[ch.id] ?? ch.default_pct);
  const colours = channels.map(ch => CH_COLOURS[ch.id] ?? '#ccc');

  if (allocationChart) {
    allocationChart.destroy();
    allocationChart = null;
  }

  allocationChart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colours,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${ctx.parsed}%`
          }
        }
      },
      cutout: '62%'
    }
  });
}

function updateAPBox() {
  const box = document.getElementById('m3-ap-box');
  if (!box) return;
  const apPct   = state.allocation.availability_payments;
  const annualAP = computeAnnualAP(state.nav_usd_bn, apPct, state.deployment_rate_pct);
  const suppDebt = computeSupportableDebt(annualAP);
  box.innerHTML = `
    <strong>Availability Payment channel (${apPct}%)</strong>
    Annual AP budget: <strong>${fmtBn(annualAP)}</strong> supports
    <strong>${fmtBn(suppDebt)}</strong> of 15-yr concessional debt at 2.5% coupon.
    <span class="trust-source">Source: Standard project finance debt service constant — EBRD_CASE</span>`;
}

// ── Module 4: Project Support Mapping ────────────────────────────────────────

const TAB_CHANNELS = ['all', 'grants', 'concessional', 'equity', 'availability_payments'];

let activeTab = 'all';

function renderProjectSupport() {
  const container = document.getElementById('m4-body');
  if (!container) return;

  const assets = flattenAssets();

  container.innerHTML = `
    <div class="trust-tabs" id="m4-tabs">
      ${TAB_CHANNELS.map(ch => `
        <button class="trust-tab-btn ${ch === activeTab ? 'active' : ''}" data-tab="${ch}">
          ${ch === 'all' ? 'All Assets' : ch === 'availability_payments' ? 'Availability Payments' : capitalise(ch)}
          <small style="margin-left:4px;color:#aaa">(${filterAssets(assets, ch).length})</small>
        </button>`).join('')}
    </div>
    <div class="trust-asset-grid" id="m4-grid"></div>`;

  container.querySelectorAll('.trust-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      container.querySelectorAll('.trust-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
      renderAssetGrid(assets, activeTab);
    });
  });

  renderAssetGrid(assets, activeTab);
}

function flattenAssets() {
  if (!assetsIndex) return [];
  // assetsIndex may be array or { assets: [] }
  const list = Array.isArray(assetsIndex) ? assetsIndex : (assetsIndex.assets ?? []);
  return list;
}

function filterAssets(assets, tab) {
  if (tab === 'all') return assets;
  return assets.filter(a => {
    const fs = a.financing_structures ?? {};
    const paths = Object.values(fs);
    if (tab === 'grants')      return paths.some(p => (p.grant_pct ?? 0) > 0);
    if (tab === 'concessional')return paths.some(p => (p.concessional_pct ?? 0) > 0);
    if (tab === 'equity')      return paths.some(p => (p.private_pct ?? 0) > 0 || (p.public_equity_pct ?? 0) > 0);
    if (tab === 'availability_payments') return a.wartime_status?.de_risking?.includes('MIGA_WAR') ||
      a.wartime_status?.de_risking?.includes('EBRD_RSF');
    return true;
  });
}

function renderAssetGrid(assets, tab) {
  const grid = document.getElementById('m4-grid');
  if (!grid) return;

  const filtered = filterAssets(assets, tab);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="trust-loading">No assets match this filter.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(asset => {
    const name     = asset.name?.en ?? asset.asset_id ?? 'Unknown asset';
    const sector   = (asset.sector ?? '').replace(/_/g, ' ');
    const oblast   = asset.location?.oblast ?? '';
    const cost     = asset.cost_paths?.build_back_better?.central_usd_m
                  ?? asset.cost_paths?.baseline?.central_usd_m;
    const dl       = asset.damage?.destruction_level ?? '';
    const deRisk   = asset.wartime_status?.de_risking ?? [];

    // Tags
    const tags = [];
    const fs   = Object.values(asset.financing_structures ?? {});
    if (fs.some(p => (p.grant_pct ?? 0) > 0))           tags.push('<span class="trust-asset-tag grant">Grant</span>');
    if (fs.some(p => (p.concessional_pct ?? 0) > 0))     tags.push('<span class="trust-asset-tag concessional">Concessional</span>');
    if (fs.some(p => (p.private_pct ?? 0) > 0))          tags.push('<span class="trust-asset-tag equity">Equity</span>');
    if (deRisk.includes('MIGA_WAR') || deRisk.includes('EBRD_RSF')) tags.push('<span class="trust-asset-tag ap">AP</span>');

    return `
      <div class="trust-asset-card">
        <div class="trust-asset-name">${name}</div>
        <div class="trust-asset-meta">${tags.join('')}</div>
        <div class="trust-asset-cost">
          <strong>${oblast}</strong> · ${capitalise(sector.split('.').pop() ?? sector)}<br>
          ${dl ? `Damage: <strong>${capitalise(dl)}</strong>` : ''}
          ${cost ? ` · Cost: <strong>$${Math.round(cost).toLocaleString()}M</strong>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── Module 5: Leverage Multiplier ─────────────────────────────────────────────

function renderLeverage() {
  const container = document.getElementById('m5-body');
  if (!container || !leverageData) return;

  const instruments = leverageData.instruments;

  container.innerHTML = `
    <div class="trust-two-col">
      <div>
        <div class="trust-slider-row" style="margin-bottom:1rem">
          <div>
            <span class="trust-slider-label">Trust capital deployed ($M)</span>
            <span class="trust-slider-source">Source: ISIF directed mandate 2014</span>
          </div>
          <input type="range" class="trust-range" id="m5-capital"
            min="1" max="50" step="1" value="${state.leverage_capital_usd_bn}"
            aria-label="Trust capital deployed">
          <span class="trust-range-val" id="m5-capital-val">${fmtBn(state.leverage_capital_usd_bn)}</span>
        </div>
        <div class="trust-leverage-grid" id="m5-instruments"></div>
      </div>
      <div>
        <div class="trust-leverage-result" id="m5-result">
          <div class="trust-leverage-result-label">Total capital mobilised</div>
          <div class="trust-leverage-result-val" id="m5-total">—</div>
          <div class="trust-leverage-result-range" id="m5-range">—</div>
          <div style="margin-top:0.75rem;font-size:0.75rem;color:rgba(255,255,255,0.6)" id="m5-source"></div>
        </div>
        <div class="trust-infobox" style="margin-top:0.75rem" id="m5-desc"></div>
      </div>
    </div>`;

  renderInstrumentCards(instruments);
  updateLeverageResult(instruments);

  document.getElementById('m5-capital')?.addEventListener('input', (e) => {
    state.leverage_capital_usd_bn = parseFloat(e.target.value);
    const lbl = document.getElementById('m5-capital-val');
    if (lbl) lbl.textContent = `${fmtBn(state.leverage_capital_usd_bn)}`;
    saveState();
    updateLeverageResult(instruments);
  });
}

function renderInstrumentCards(instruments) {
  const grid = document.getElementById('m5-instruments');
  if (!grid) return;

  grid.innerHTML = instruments.map(ins => `
    <div class="trust-leverage-card ${ins.id === state.leverage_selected ? 'selected' : ''}"
         data-ins="${ins.id}" role="button" tabindex="0">
      <div class="trust-leverage-name">${ins.label}</div>
      <div class="trust-leverage-mult">${ins.multiplier_central}×</div>
      <div class="trust-leverage-range">${ins.multiplier_low}× – ${ins.multiplier_high}×</div>
      <div class="trust-leverage-desc">${ins.description}</div>
    </div>`).join('');

  grid.querySelectorAll('.trust-leverage-card').forEach(card => {
    const select = () => {
      state.leverage_selected = card.dataset.ins;
      saveState();
      grid.querySelectorAll('.trust-leverage-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.ins === state.leverage_selected));
      updateLeverageResult(instruments);
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') select(); });
  });
}

function updateLeverageResult(instruments) {
  const ins = instruments.find(i => i.id === state.leverage_selected);
  if (!ins) return;

  const cap         = state.leverage_capital_usd_bn;
  const totalLow    = computeTotalMobilised(cap, ins.multiplier_low);
  const totalCentral= computeTotalMobilised(cap, ins.multiplier_central);
  const totalHigh   = computeTotalMobilised(cap, ins.multiplier_high);

  const totalEl  = document.getElementById('m5-total');
  const rangeEl  = document.getElementById('m5-range');
  const srcEl    = document.getElementById('m5-source');
  const descEl   = document.getElementById('m5-desc');

  if (totalEl)  totalEl.textContent  = fmtBn(totalCentral);
  if (rangeEl)  rangeEl.textContent  = `Range: ${fmtBn(totalLow)} – ${fmtBn(totalHigh)}`;
  if (srcEl)    srcEl.textContent    = `Source: ${ins.source_label}`;
  if (descEl)   descEl.innerHTML     = `<strong>${ins.mechanism}</strong><br><span class="trust-source">Applicable channels: ${ins.applicable_channels.join(', ')}</span>`;
}

// ── Module 6: Strategic Equity ────────────────────────────────────────────────

function renderStrategicEquity() {
  const container = document.getElementById('m6-body');
  if (!container || !strategicData) return;

  const assets = strategicData.assets;
  const total  = strategicData.total_trust_equity_usd_bn;

  container.innerHTML = `
    <div class="trust-infobox" style="margin-bottom:1rem">
      <strong>Total indicative Trust equity portfolio: ${fmtBn(total)} across ${assets.length} strategic assets</strong>
      Equity stakes preserve Ukrainian public interest while mobilising private co-investment under ISIF-style mandate.
      All valuations are indicative modelling estimates — not offers or guarantees.
      <span class="trust-source">Source: RDNA3 sector assessments, KSE Institute, EBRD Ukraine strategy 2023</span>
    </div>
    <div class="trust-equity-grid">${assets.map(renderEquityCard).join('')}</div>`;
}

function renderEquityCard(asset) {
  const statusClass = getStatusClass(asset.status);
  return `
    <div class="trust-equity-card">
      <div class="trust-equity-header">
        <div class="trust-equity-name">${asset.name}</div>
        <div class="trust-equity-stake">${asset.indicative_equity_stake_pct}% stake</div>
      </div>
      <span class="trust-equity-sector">${capitalise(asset.sector)}</span>
      <p class="trust-equity-desc">${asset.description}</p>
      <div class="trust-equity-row">
        <span class="trust-equity-row-label">Indicative valuation</span>
        <span class="trust-equity-row-val">${fmtBn(asset.indicative_valuation_usd_bn)}</span>
      </div>
      <div class="trust-equity-row">
        <span class="trust-equity-row-label">Trust equity</span>
        <span class="trust-equity-row-val">${fmtBn(asset.trust_equity_usd_bn)}</span>
      </div>
      <div class="trust-equity-row">
        <span class="trust-equity-row-label">Co-investors</span>
        <span class="trust-equity-row-val" style="font-size:0.72rem">${asset.co_investor_target}</span>
      </div>
      <div class="trust-equity-status ${statusClass}">${asset.status}</div>
    </div>`;
}

function getStatusClass(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s.includes('damage') || s.includes('destroy')) return 'damaged';
  if (s.includes('operational')) return 'operational';
  if (s.includes('closed')) return 'closed';
  if (s.includes('occup')) return 'occupied';
  return '';
}

// ── Module 7: Precedent Comparison ───────────────────────────────────────────

function renderPrecedents() {
  const container = document.getElementById('m7-body');
  if (!container || !precedentsData) return;

  const precs = precedentsData.precedents;

  container.innerHTML = `
    <div class="trust-precedent-grid">
      ${precs.map(renderPrecedentCard).join('')}
    </div>`;
}

function renderPrecedentCard(p) {
  const isTrust   = p.is_trust === true;
  const initStr   = p.initial_capitalisation_usd_bn != null
    ? fmtBn(p.initial_capitalisation_usd_bn) : '-';
  const currentStr= p.current_aum_usd_bn != null
    ? fmtBn(p.current_aum_usd_bn) : isTrust ? `${fmtBn(state.nav_usd_bn)} (initial)` : '-';
  const returnStr = p.real_return_pct != null
    ? `${p.real_return_pct}% real` : 'N/A (grant vehicle)';
  const splitStr  = p.portfolio_split ?? '-';
  const drawStr   = p.drawdown_rule ?? '-';

  return `
    <div class="trust-precedent-card ${isTrust ? 'is-trust' : ''}">
      <div class="trust-precedent-bar" style="background:${p.colour ?? '#ccc'}"></div>
      <div class="trust-precedent-head">
        <div class="trust-precedent-name">${p.name}</div>
        <div class="trust-precedent-country">${p.country} · Est. ${p.established}</div>
      </div>
      <div class="trust-precedent-body">
        <div class="trust-precedent-stat">
          <span class="trust-precedent-stat-label">Initial capitalisation</span>
          <span class="trust-precedent-stat-val">${initStr}</span>
        </div>
        <div class="trust-precedent-stat">
          <span class="trust-precedent-stat-label">Current AUM</span>
          <span class="trust-precedent-stat-val">${currentStr}</span>
        </div>
        <div class="trust-precedent-stat">
          <span class="trust-precedent-stat-label">Real return</span>
          <span class="trust-precedent-stat-val">${returnStr}</span>
        </div>
        <div class="trust-precedent-stat" style="flex-direction:column;gap:0.1rem;align-items:flex-start">
          <span class="trust-precedent-stat-label">Portfolio</span>
          <span class="trust-precedent-stat-val" style="font-size:0.72rem;font-weight:500;color:#1a1d23">${splitStr}</span>
        </div>
        <div class="trust-precedent-stat" style="flex-direction:column;gap:0.1rem;align-items:flex-start">
          <span class="trust-precedent-stat-label">Drawdown rule</span>
          <span class="trust-precedent-stat-val" style="font-size:0.72rem;font-weight:500;color:#1a1d23">${drawStr}</span>
        </div>
      </div>
      <div class="trust-precedent-lesson">${p.key_lesson}</div>
    </div>`;
}

// ── NAV band (persists across all modules) ────────────────────────────────────

function renderNavBand() {
  const band = document.getElementById('trust-nav-band');
  if (!band) return;

  const traj = simulateNavTrajectory({
    initialNav_usd_bn:   state.nav_usd_bn,
    realReturn_pct:      state.real_return_pct,
    deploymentRate_pct:  state.deployment_rate_pct,
    recyclingRate_pct:   state.recycling_rate_pct,
    horizonYears:        state.horizon_years,
    deploymentHorizon:   Math.round(state.horizon_years / 2)
  });

  const annualAP     = computeAnnualAP(state.nav_usd_bn, state.allocation.availability_payments, state.deployment_rate_pct);
  const suppDebt     = computeSupportableDebt(annualAP);
  const last         = traj[traj.length - 1];
  const totalDeployed = traj.reduce((s, r) => s + r.deployment, 0);

  band.innerHTML = `
    <div class="trust-nav-item">
      <span class="trust-nav-val" id="nav-val">${fmtBn(state.nav_usd_bn)}</span>
      <span class="trust-nav-lbl">Initial NAV · Scenario ${state.scenario}</span>
    </div>
    <div class="trust-nav-separator"></div>
    <div class="trust-nav-item">
      <span class="trust-nav-val">${fmtBn(annualAP)}/yr</span>
      <span class="trust-nav-lbl">Annual AP budget</span>
    </div>
    <div class="trust-nav-separator"></div>
    <div class="trust-nav-item">
      <span class="trust-nav-val">${fmtBn(suppDebt)}</span>
      <span class="trust-nav-lbl">Supportable concessional debt</span>
    </div>
    <div class="trust-nav-separator"></div>
    <div class="trust-nav-item">
      <span class="trust-nav-val">${fmtBn(totalDeployed)}</span>
      <span class="trust-nav-lbl">Total deployed · ${state.horizon_years}yr horizon</span>
    </div>
    <div class="trust-nav-separator"></div>
    <div class="trust-nav-item">
      <span class="trust-nav-val">${fmtBn(last.nav)}</span>
      <span class="trust-nav-lbl">NAV at Year ${state.horizon_years}</span>
    </div>`;
}

// ── Module collapse toggle ────────────────────────────────────────────────────

function wireModuleToggles() {
  document.querySelectorAll('.trust-module-header').forEach(header => {
    header.addEventListener('click', () => {
      const mod = header.closest('.trust-module');
      if (!mod) return;
      mod.classList.toggle('collapsed');
      const id = mod.id;
      if (!state.collapsed) state.collapsed = {};
      state.collapsed[id] = mod.classList.contains('collapsed');
      saveState();
    });
  });
}

// ── Hero stat card update ─────────────────────────────────────────────────────

function renderHeroStats() {
  const annualAP = computeAnnualAP(state.nav_usd_bn, state.allocation.availability_payments, state.deployment_rate_pct);
  const el = document.getElementById('hero-ap-val');
  if (el) el.textContent = `${fmtBn(annualAP)}/yr`;
  const note = document.getElementById('hero-ap-note');
  if (note) note.textContent = `Scenario ${state.scenario} · ${state.real_return_pct}% real return · ${state.allocation.availability_payments}% AP channel`;

  const navEl = document.getElementById('hero-nav-val');
  if (navEl) navEl.textContent = fmtBn(state.nav_usd_bn);
}

// ── Master render ─────────────────────────────────────────────────────────────

function renderAll() {
  renderHeroStats();
  renderNavBand();
  renderCapitalFormation();
  renderGrowthTrajectory();
  renderAllocation();
  renderProjectSupport();
  renderLeverage();
  renderStrategicEquity();
  renderPrecedents();
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  await loadAll();

  // Compute initial NAV from default sources
  state.nav_usd_bn = Math.round(computeTotalNav() * 10) / 10;

  // Restore collapsed state (mod-4 collapses by default — it's long)
  const defaultCollapsed = { 'mod-4': true };
  const collapsedState = Object.assign({}, defaultCollapsed, state.collapsed ?? {});
  Object.entries(collapsedState).forEach(([id, collapsed]) => {
    const mod = document.getElementById(id);
    if (mod) mod.classList.toggle('collapsed', collapsed);
  });

  wireModuleToggles();

  // Lang toggle
  import('/js/lang.js').then(({ initLangToggle }) => {
    const btn = document.getElementById('langToggle');
    if (btn) initLangToggle(btn);
  }).catch(() => {});

  renderAll();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Wait for Chart.js then boot ───────────────────────────────────────────────

function waitForChart(cb, maxMs = 5000) {
  const start = Date.now();
  const check = () => {
    if (window.Chart) { cb(); return; }
    if (Date.now() - start > maxMs) { cb(); return; } // boot anyway
    setTimeout(check, 50);
  };
  check();
}

waitForChart(boot);

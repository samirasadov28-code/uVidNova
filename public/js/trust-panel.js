/**
 * trust-panel.js — Lightweight "Create Vidnova Trust" side panel.
 * Opens inline next to the map (same overlay pattern as finance-wizard.js).
 * Imports pure-math helpers from trust-calculator.js.
 * No Chart.js — uses simple numeric output tables.
 */

import { simulateNavTrajectory, computeAnnualAP, computeSupportableDebt, computeTotalMobilised } from './trust-calculator.js';

const FROZEN_TOTAL_BN = 300;   // G7-frozen Russian assets
const RDNA3_TOTAL_BN  = 486;   // KSE total reparations claim / reconstruction need
const EBRD_TERMS = { rate: 0.015, tenor: 20 };  // concessional debt terms

let _state = {
  corpus_usd_bn:       75,
  reparations_usd_bn:  0,
  drawdown_pct:        4.0,
  return_pct:          4.5,
  recycling_pct:       15,
  horizon_years:       30,
};

function fmtBn(v) {
  if (v == null || isNaN(v)) return '-';
  if (v === 0) return '$0';
  if (v >= 100) return `$${Math.round(v).toLocaleString()}B`;
  if (v >= 1)   return `$${v.toFixed(1)}B`;
  return `$${Math.round(v * 1000).toLocaleString()}M`; // sub-$1B
}

function fmtM(v) {
  if (v == null || isNaN(v)) return '-';
  if (v >= 10000) {
    const bn = v / 1000;
    return bn >= 100 ? `$${Math.round(bn).toLocaleString()}B` : `$${bn.toFixed(1)}B`;
  }
  return `$${Math.round(v).toLocaleString()}M`;
}

function calc() {
  const { corpus_usd_bn, reparations_usd_bn, drawdown_pct, return_pct, recycling_pct, horizon_years } = _state;
  const totalCorpus_bn   = corpus_usd_bn + reparations_usd_bn;
  const annualPayment_bn = totalCorpus_bn * (drawdown_pct / 100);
  const annualReturn_bn  = totalCorpus_bn * (return_pct  / 100);

  const traj = simulateNavTrajectory({
    initialNav_usd_bn:   totalCorpus_bn,
    realReturn_pct:      return_pct,
    deploymentRate_pct:  drawdown_pct,
    recyclingRate_pct:   recycling_pct,
    horizonYears:        horizon_years,
  });

  const navAt = (yr) => traj.find(t => t.year === yr)?.nav ?? null;
  const deployedAt = (yr) => traj.find(t => t.year === yr)?.deployed_cumulative ?? 0;

  const supportableDebt_bn = annualPayment_bn / EBRD_TERMS.rate * (1 - Math.pow(1 + EBRD_TERMS.rate, -EBRD_TERMS.tenor));
  const totalMobilised_bn  = totalCorpus_bn + supportableDebt_bn;
  const coveragePct        = (totalMobilised_bn / RDNA3_TOTAL_BN * 100);

  return {
    totalCorpus_bn,
    annualPayment_bn,
    annualReturn_bn,
    supportableDebt_bn,
    totalMobilised_bn,
    coveragePct,
    navAt,
    deployedAt,
    depletionYear: traj.find(t => t.nav <= 0)?.year ?? null,
    traj,
  };
}

function sliderRow(id, label, min, max, step, value, fmt) {
  return `
    <div class="tp-slider-row">
      <div class="tp-sl-top">
        <label class="tp-sl-label" for="${id}">${label}</label>
        <span class="tp-sl-val" id="${id}Val">${fmt(value)}</span>
      </div>
      <input class="tp-slider" id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <div class="tp-sl-ends"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>
    </div>`;
}

function renderPanel() {
  const r = calc();
  const panel = document.getElementById('trustPanel');
  if (!panel) return;

  panel.querySelector('#tpBody').innerHTML = `
    <div class="tp-section">
      <h4 class="tp-sh">Corpus &amp; deployment inputs</h4>
      ${sliderRow('tpCorpus',       'Frozen assets mobilised',          0, 300,  5,  _state.corpus_usd_bn,       v => fmtBn(v))}
      ${sliderRow('tpReparations',  'Russian reparations contribution',  0, 2000, 50, _state.reparations_usd_bn, v => fmtBn(v))}
      ${sliderRow('tpDrawdown',     'Annual deployment rate',            2,   8,  0.5, _state.drawdown_pct,      v => v + '%')}
      ${sliderRow('tpReturn',       'Annual real return on NAV',         2,   7,  0.5, _state.return_pct,        v => v + '%')}
      <div class="tp-corpus-total">Total corpus: <strong>${fmtBn(r.totalCorpus_bn)}</strong></div>
    </div>

    <div class="tp-section tp-outputs">
      <h4 class="tp-sh">Key outputs</h4>
      <div class="tp-metrics">
        <div class="tp-metric tp-m-primary">
          <span class="tp-m-val">${fmtBn(r.annualPayment_bn)}/yr</span>
          <span class="tp-m-lbl">Annual availability payment</span>
          <span class="tp-m-note">${(_state.drawdown_pct)}% × ${fmtBn(r.totalCorpus_bn)} corpus</span>
        </div>
        <div class="tp-metric">
          <span class="tp-m-val">${fmtBn(r.supportableDebt_bn)}</span>
          <span class="tp-m-lbl">Supportable concessional debt</span>
          <span class="tp-m-note">EBRD terms: 1.5% / 20yr</span>
        </div>
        <div class="tp-metric tp-m-total">
          <span class="tp-m-val">${fmtBn(r.totalMobilised_bn)}</span>
          <span class="tp-m-lbl">Total capital mobilised</span>
          <span class="tp-m-note">Corpus + leveraged debt</span>
        </div>
        <div class="tp-metric">
          <span class="tp-m-val">${r.coveragePct.toFixed(1)}%</span>
          <span class="tp-m-lbl">Coverage of $486B reconstruction claim</span>
          <span class="tp-m-note">KSE Institute baseline (RDNA3)</span>
        </div>
      </div>
    </div>

    <div class="tp-section">
      <h4 class="tp-sh">NAV trajectory</h4>
      <table class="tp-traj-table">
        <thead><tr><th>Year</th><th>NAV</th><th>Deployed (cum.)</th></tr></thead>
        <tbody>
          ${[1,3,5,10,15,20,25,30].map(yr => {
            const n = r.navAt(yr);
            const d = r.deployedAt(yr);
            return `<tr${n != null && n < r.totalCorpus_bn * 0.3 ? ' class="tp-tr-low"' : ''}><td>Yr ${yr}</td><td>${n != null ? fmtBn(n) : '-'}</td><td>${fmtBn(d)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      ${r.depletionYear ? `<p class="tp-depletion-note">⚠ At current rates corpus depletes at year ${r.depletionYear}. Reduce deployment rate or increase return to sustain.</p>` : `<p class="tp-ok-note">✓ Corpus remains positive across ${_state.horizon_years}-year horizon.</p>`}
    </div>

    <div class="tp-section tp-context">
      <h4 class="tp-sh">Russia's obligation in context</h4>
      <div class="tp-ctx-bar-wrap">
        <div class="tp-ctx-bar-track">
          <div class="tp-ctx-bar-fill" style="width:${Math.min(r.coveragePct, 100).toFixed(1)}%"></div>
        </div>
        <div class="tp-ctx-bar-labels">
          <span>This corpus: ${fmtBn(r.totalCorpus_bn)}</span>
          <span>Reconstruction claim: ${fmtBn(RDNA3_TOTAL_BN)}</span>
        </div>
      </div>
      <p class="tp-ctx-note">
        Frozen assets ${fmtBn(_state.corpus_usd_bn)} (${(_state.corpus_usd_bn / FROZEN_TOTAL_BN * 100).toFixed(0)}% of $300B G7-frozen)${_state.reparations_usd_bn > 0 ? ` + reparations ${fmtBn(_state.reparations_usd_bn)}` : ''} = ${fmtBn(r.totalCorpus_bn)} total corpus.
        At ${_state.drawdown_pct}% deployment the Trust generates ${fmtBn(r.annualPayment_bn)}/yr —
        enough to service ${fmtBn(r.supportableDebt_bn)} of concessional debt, bringing total mobilised to ${fmtBn(r.totalMobilised_bn)}.
      </p>
    </div>

    <div class="tp-footer">
      <a href="/trust.html" class="tp-full-btn">Open full Trust model analysis →</a>
      <p class="tp-disclaimer">Corpus and return figures are deterministic estimates from published benchmarks. Not guarantees or legal obligations. Russian reparations are a sovereign obligation under international law — disbursement timeline contingent on peace settlement.</p>
    </div>
  `;

  wireSliders();
}

function wireSliders() {
  const sliders = [
    { id: 'tpCorpus',       key: 'corpus_usd_bn',      fmt: v => fmtBn(v) },
    { id: 'tpReparations',  key: 'reparations_usd_bn', fmt: v => fmtBn(v) },
    { id: 'tpDrawdown',     key: 'drawdown_pct',        fmt: v => v + '%'  },
    { id: 'tpReturn',       key: 'return_pct',          fmt: v => v + '%'  },
  ];
  sliders.forEach(({ id, key, fmt }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
      _state[key] = +e.target.value;
      const valEl = document.getElementById(id + 'Val');
      if (valEl) valEl.textContent = fmt(_state[key]);
      renderResults();
    });
  });
}

function renderResults() {
  const r = calc();
  const panel = document.getElementById('trustPanel');
  if (!panel) return;

  // Update metric values without re-rendering sliders
  const upd = (sel, val) => { const el = panel.querySelector(sel); if (el) el.textContent = val; };
  upd('.tp-m-primary .tp-m-val',  fmtBn(r.annualPayment_bn) + '/yr');
  upd('.tp-m-primary .tp-m-note', `${_state.drawdown_pct}% × ${fmtBn(r.totalCorpus_bn)} corpus`);

  // Full re-render is fine since it's just DOM — no chart to preserve
  renderPanel();
}

function close() {
  const panel = document.getElementById('trustPanel');
  if (!panel) return;
  panel.classList.remove('tp-open');
  setTimeout(() => { panel.hidden = true; }, 320);
}

export function openTrustPanel() {
  let panel = document.getElementById('trustPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'trustPanel';
    panel.className = 'tp-overlay fw-overlay';
    panel.innerHTML = `
      <div class="fw-modal tp-modal" role="dialog" aria-modal="true" aria-label="Create Vidnova Trust">
        <div class="fw-header">
          <div class="fw-header-left">
            <h2 class="fw-title">🏛 Create Vidnova Trust</h2>
            <span class="fw-header-sub">Russian frozen assets → annual reconstruction payments</span>
          </div>
          <button class="fw-close" id="tpClose" aria-label="Close">×</button>
        </div>
        <div class="fw-body" id="tpBody"></div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('#tpClose').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add('tp-open', 'fw-open'));
  renderPanel();
}

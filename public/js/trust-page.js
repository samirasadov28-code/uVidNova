/**
 * trust-page.js — Interactive Trust portfolio builder and 50-year trajectory chart.
 * Pure deterministic calculations. No LLM involvement in any numeric output.
 *
 * The "Trust" is a modelled sovereign-wealth-fund structure where Russia's frozen
 * assets are managed as an endowment, paying a fixed drawdown pct each year as an
 * "availability payment" to service concessional reconstruction debt.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

// Principal scenarios (USD millions)
const PRINCIPAL_SCENARIOS = {
  era:  50_000,   // ~USD 50B committed ERA proceeds
  full: 286_000,  // ~USD 286B full frozen assets principal
};

// Drawdown rates for the three comparison columns
const DRAWDOWN_RATES = [0.025, 0.04, 0.05];

// Debt service constant for 15-year loan at 2.5% coupon: r / (1 − (1+r)^-n)
const DSC_15Y_2_5PCT = (() => {
  const r = 0.025;
  const n = 15;
  return r / (1 - Math.pow(1 + r, -n));
})(); // ≈ 0.07665

// Debt service ratio for pipeline sizing: 8% of annual payment → 12.5× pipeline
const PIPELINE_DS_RATIO = 0.08;

// ── Core math (standalone — no dependency on trust-calculator.js) ─────────────

/**
 * Annual availability payment = principal × drawdownPct
 * (Gross, before operating costs — operating costs are held in reserve from yield)
 *
 * @param {number} principal_usd_m
 * @param {number} drawdownPct   e.g. 0.05 for 5%
 * @returns {number} annual payment in USD millions
 */
function computeAvailabilityPayment(principal_usd_m, drawdownPct) {
  return principal_usd_m * drawdownPct;
}

/**
 * Years until corpus depletion, given drawdown > return.
 * If drawdown <= return, corpus never depletes (perpetual).
 * Formula: n = -ln(1 - drawdownPct/returnPct) / ln(1+returnPct)
 * Approximated via simulation for accuracy across non-linear ranges.
 *
 * @returns {number|null} years, or null if perpetual
 */
function computeDepletionYears(principal_usd_m, drawdownPct, annualReturnPct) {
  if (drawdownPct <= annualReturnPct) return null; // perpetual
  let corpus = principal_usd_m;
  const annualPayment = principal_usd_m * drawdownPct;
  for (let year = 1; year <= 200; year++) {
    corpus = corpus * (1 + annualReturnPct) - annualPayment;
    if (corpus <= 0) return year;
  }
  return 200;
}

/**
 * Year-by-year corpus balance array (50 data points, index 0 = year 0 = initial).
 *
 * @returns {number[]} corpus balance in USD millions for years 0–50
 */
function computeTrustTrajectory(principal_usd_m, drawdownPct, annualReturnPct, years = 50) {
  const annualPayment = principal_usd_m * drawdownPct;
  const result = [principal_usd_m];
  let corpus = principal_usd_m;
  for (let y = 1; y <= years; y++) {
    corpus = Math.max(0, corpus * (1 + annualReturnPct) - annualPayment);
    result.push(corpus);
  }
  return result;
}

/**
 * Concessional debt supportable by an annual availability payment,
 * assuming 15-year tenor at 2.5% coupon (DSC ≈ 7.665%).
 *
 * @param {number} annualPayment_usd_m
 * @returns {number} supportable senior debt in USD millions
 */
function concDebtSupportable(annualPayment_usd_m) {
  return annualPayment_usd_m / DSC_15Y_2_5PCT;
}

/**
 * Implied project pipeline given annual payment and an assumed 8% debt service ratio.
 * i.e. a project pool where total capex × 8% = annual payment.
 *
 * @param {number} annualPayment_usd_m
 * @returns {number} implied pipeline in USD millions
 */
function impliedPipeline(annualPayment_usd_m) {
  return annualPayment_usd_m / PIPELINE_DS_RATIO;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtB(usd_m) {
  if (usd_m >= 1000) return `USD ${(usd_m / 1000).toFixed(1)}B`;
  return `USD ${usd_m.toFixed(0)}M`;
}

function fmtM(usd_m) {
  return `USD ${usd_m.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}M`;
}

// ── State ─────────────────────────────────────────────────────────────────────

let _principal = 'era';  // 'era' | 'full'
let _return    = 0.045;  // annual nominal return

// ── Render: stat cards ────────────────────────────────────────────────────────

function renderStatCards() {
  const principal = PRINCIPAL_SCENARIOS[_principal];
  const payment5  = computeAvailabilityPayment(principal, 0.05);
  const card      = document.getElementById('trustAvailCard');
  const val       = document.getElementById('trustAvailVal');
  const note      = document.getElementById('trustAvailNote');
  if (val)  val.textContent  = fmtB(payment5) + '/yr';
  if (note) note.textContent = `${_principal === 'full' ? 'Full corpus (~USD 286B)' : 'ERA proceeds corpus (~USD 50B)'} · ${(_return * 100).toFixed(2)}% annual return`;
}

// ── Render: comparison table ──────────────────────────────────────────────────

function renderCompareTable() {
  const principal = PRINCIPAL_SCENARIOS[_principal];
  const tbody     = document.getElementById('trustCompareBody');
  if (!tbody) return;

  const rows = DRAWDOWN_RATES.map(dr => {
    const payment    = computeAvailabilityPayment(principal, dr);
    const pipeline   = impliedPipeline(payment);
    const concDebt   = concDebtSupportable(payment);
    const depletion  = computeDepletionYears(principal, dr, _return);
    return { dr, payment, pipeline, concDebt, depletion };
  });

  // Row labels and their formatter
  const metrics = [
    {
      label: 'Corpus (principal)',
      cells: rows.map(r => `<td>${fmtB(PRINCIPAL_SCENARIOS[_principal])}</td>`).join('')
    },
    {
      label: 'Annual availability payment',
      cells: rows.map(r => `<td class="trust-highlight-val">${fmtB(r.payment)}</td>`).join('')
    },
    {
      label: 'Implied project pipeline',
      cells: rows.map(r => `<td>${fmtB(r.pipeline)}</td>`).join('')
    },
    {
      label: 'Years to corpus depletion',
      cells: rows.map(r => r.depletion === null
        ? `<td class="perpetual">Perpetual</td>`
        : `<td>${r.depletion} years</td>`
      ).join('')
    },
    {
      label: 'Concessional debt supportable<br><small style="font-weight:400">(15yr, 2.5% coupon)</small>',
      cells: rows.map(r => `<td>${fmtB(r.concDebt)}/yr</td>`).join('')
    },
  ];

  tbody.innerHTML = metrics.map(m => `
    <tr>
      <td class="trust-row-label">${m.label}</td>
      ${m.cells}
    </tr>`).join('');
}

// ── Render: SVG chart ─────────────────────────────────────────────────────────

const CHART_W  = 700;
const CHART_H  = 260;
const PAD      = { top: 16, right: 30, bottom: 44, left: 68 };
const PLOT_W   = CHART_W - PAD.left - PAD.right;
const PLOT_H   = CHART_H - PAD.top  - PAD.bottom;
const YEARS    = 50;

const SERIES_COLOURS = ['#1a3a6b', '#f0a500', '#e67e22'];
const SERIES_CLASSES = ['trust-series trust-series-2', 'trust-series trust-series-4', 'trust-series trust-series-5'];

function renderChart() {
  const svg = document.getElementById('trustChart');
  if (!svg) return;

  const principal = PRINCIPAL_SCENARIOS[_principal];

  // Generate trajectories
  const trajectories = DRAWDOWN_RATES.map(dr =>
    computeTrustTrajectory(principal, dr, _return, YEARS)
  );

  // Y-axis max: highest starting point × 1.1, rounded up to nice number
  const yMax = Math.ceil(principal * 1.1 / 10000) * 10000; // round to nearest $10B

  function xScale(year)   { return PAD.left + (year / YEARS) * PLOT_W; }
  function yScale(val_m)  { return PAD.top  + PLOT_H - (val_m / yMax) * PLOT_H; }

  // Grid lines: 6 Y steps
  const ySteps = 6;
  const yStep  = yMax / ySteps;
  const gridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = i * yStep;
    const y   = yScale(val);
    const label = val >= 1000 ? `$${(val / 1000).toFixed(0)}B` : `$${val.toFixed(0)}M`;
    return `
      <line x1="${PAD.left}" y1="${y}" x2="${PAD.left + PLOT_W}" y2="${y}"
            stroke="#e0e5ef" stroke-width="1" ${i === 0 ? '' : 'stroke-dasharray="4,3"'}/>
      <text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end"
            font-size="10" fill="#888">${label}</text>`;
  }).join('');

  // X-axis ticks: every 10 years
  const xTicks = [0, 10, 20, 30, 40, 50].map(yr => {
    const x = xScale(yr);
    return `
      <line x1="${x}" y1="${PAD.top + PLOT_H}" x2="${x}" y2="${PAD.top + PLOT_H + 5}"
            stroke="#aaa" stroke-width="1"/>
      <text x="${x}" y="${PAD.top + PLOT_H + 16}" text-anchor="middle"
            font-size="10" fill="#888">Year ${yr}</text>`;
  }).join('');

  // Axis labels
  const xLabel = `<text x="${PAD.left + PLOT_W / 2}" y="${CHART_H - 3}"
    text-anchor="middle" font-size="11" fill="#666">Years from Trust establishment</text>`;
  const yLabel = `<text x="11" y="${PAD.top + PLOT_H / 2}"
    text-anchor="middle" font-size="11" fill="#666"
    transform="rotate(-90, 11, ${PAD.top + PLOT_H / 2})">Corpus (USD)</text>`;

  // Polylines for each series — rebuilt each render to force CSS re-animation
  const polylines = trajectories.map((traj, i) => {
    const pts = traj.map((val, yr) => `${xScale(yr).toFixed(1)},${yScale(val).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" class="${SERIES_CLASSES[i]}"
               stroke="${SERIES_COLOURS[i]}" fill="none"
               style="animation-name:trust-draw;animation-duration:0.8s;animation-timing-function:ease-out;animation-fill-mode:forwards;animation-delay:${i * 80}ms;stroke-dasharray:4000;stroke-dashoffset:4000"/>`;
  }).join('');

  svg.innerHTML = `
    <rect x="0" y="0" width="${CHART_W}" height="${CHART_H}" fill="#fff" rx="0"/>
    ${gridLines}
    ${xTicks}
    ${xLabel}
    ${yLabel}
    <!-- Plot area border -->
    <rect x="${PAD.left}" y="${PAD.top}" width="${PLOT_W}" height="${PLOT_H}"
          fill="none" stroke="#d0d8e8" stroke-width="1"/>
    ${polylines}`;
}

// ── Master update ─────────────────────────────────────────────────────────────

function updateAll() {
  renderStatCards();
  renderCompareTable();
  renderChart();
}

// ── Wire inputs ───────────────────────────────────────────────────────────────

function wireInputs() {
  // Principal scenario radios
  document.querySelectorAll('input[name="trustPrincipal"]').forEach(r => {
    r.addEventListener('change', e => {
      _principal = e.target.value;
      updateAll();
    });
  });

  // Return slider
  const slider = document.getElementById('trustReturnSlider');
  const valEl  = document.getElementById('trustReturnVal');
  if (slider) {
    slider.addEventListener('input', () => {
      _return = parseFloat(slider.value) / 100;
      if (valEl) valEl.textContent = parseFloat(slider.value).toFixed(2);
      updateAll();
    });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

wireInputs();
updateAll();

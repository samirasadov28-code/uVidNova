/**
 * trust-calculator.js
 * Pure ES module — no side effects, no I/O.
 * All functions are deterministic: numeric output comes from the asset record and
 * trustConfig lookup tables, never from an LLM.
 */

/**
 * Compute the annual Trust availability payment required to service the
 * supportable senior debt for a single project.
 *
 * Formula:
 *   debt_service_factor = r / (1 - (1 + r)^-n)   [standard mortgage factor]
 *   annual_debt_service  = supportable_debt * debt_service_factor
 *   annual_payment       = annual_debt_service * dscr
 *
 * @param {Object} asset      - Full asset record (must have reparations_layer)
 * @param {Object} trustConfig - Loaded trust_config.json
 * @returns {{ annual_payment_usd_m: number, debt_service_usd_m: number, supportable_debt_usd_m: number } | null}
 */
export function computeProjectAvailabilityPayment(asset, trustConfig) {
  const rl = asset.reparations_layer;
  if (!rl || rl.applies === false) return null;

  const debt    = rl.supportable_debt_usd_m;
  const tenor   = rl.tenor_years            ?? trustConfig.default_tenor_years;
  const coupon  = rl.coupon_pct             ?? trustConfig.default_coupon_pct;
  const dscr    = rl.dscr                   ?? trustConfig.default_dscr;

  if (debt == null || debt <= 0) return null;

  const r = coupon / 100;
  const n = tenor;

  const debt_service_factor = r / (1 - Math.pow(1 + r, -n));
  const debt_service_usd_m  = debt * debt_service_factor;
  const annual_payment_usd_m = debt_service_usd_m * dscr;

  return {
    annual_payment_usd_m:  Math.round(annual_payment_usd_m  * 1000) / 1000,
    debt_service_usd_m:    Math.round(debt_service_usd_m    * 1000) / 1000,
    supportable_debt_usd_m: debt
  };
}

/**
 * Build a year-by-year portfolio payout schedule.
 * Each year's payment_out is the sum of annual_payment_usd_m for every project
 * whose commissioning_year <= that year.
 *
 * @param {Array}  selectedAssets - Array of asset records with reparations_layer.applies === true
 * @param {Object} trustConfig    - Loaded trust_config.json
 * @returns {Array<{ year: number, payment_out_usd_m: number, project_breakdown: Array }>}
 */
export function computePortfolioPayoutSchedule(selectedAssets, trustConfig) {
  const projects = selectedAssets
    .map(asset => {
      const rl = asset.reparations_layer;
      if (!rl || rl.applies === false) return null;
      const payment = computeProjectAvailabilityPayment(asset, trustConfig);
      if (!payment) return null;
      return {
        asset_id:              asset.asset_id,
        name_en:               asset.name?.en ?? asset.asset_id,
        commissioning_year:    rl.commissioning_year,
        annual_payment_usd_m:  payment.annual_payment_usd_m
      };
    })
    .filter(Boolean);

  if (projects.length === 0) return [];

  const horizonYears = trustConfig.default_horizon_years ?? 25;
  const minYear = Math.min(...projects.map(p => p.commissioning_year));
  const maxYear = Math.max(...projects.map(p => p.commissioning_year));
  const endYear = maxYear + horizonYears;

  const schedule = [];
  for (let year = minYear; year <= endYear; year++) {
    const active = projects.filter(p => p.commissioning_year <= year);
    const payment_out_usd_m = active.reduce((s, p) => s + p.annual_payment_usd_m, 0);
    schedule.push({
      year,
      payment_out_usd_m: Math.round(payment_out_usd_m * 1000) / 1000,
      project_breakdown: active.map(p => ({
        asset_id:             p.asset_id,
        name_en:              p.name_en,
        payment_usd_m:        p.annual_payment_usd_m
      }))
    });
  }

  return schedule;
}

/**
 * Compute the initial endowment corpus required to fund the payout schedule
 * under one of three drawdown policies.
 *
 * @param {Array}  payoutSchedule - Output of computePortfolioPayoutSchedule
 * @param {string} drawdownPolicy - "full_drawdown" | "perpetuity" | "terminal_residual"
 * @param {Object} yieldParams    - { nominal_yield_pct, inflation_pct, horizon_years, residual_fraction }
 * @returns {{ initial_corpus_usd_m: number, policy_used: string, terminal_corpus_usd_m: number,
 *             steady_state_payment_usd_m: number, real_yield: number }}
 */
export function computeRequiredCorpus(payoutSchedule, drawdownPolicy, yieldParams) {
  const {
    nominal_yield_pct,
    inflation_pct,
    horizon_years,
    residual_fraction
  } = yieldParams;

  const nominalRate = nominal_yield_pct / 100;
  const inflationRate = inflation_pct / 100;
  const r = ((1 + nominalRate) / (1 + inflationRate)) - 1;
  const n = horizon_years;

  const steadyState = Math.max(...payoutSchedule.map(y => y.payment_out_usd_m));

  const annuityFactor = (1 - Math.pow(1 + r, -n)) / r;

  let initial_corpus_usd_m;
  const policy = drawdownPolicy ?? 'terminal_residual';

  if (policy === 'full_drawdown') {
    initial_corpus_usd_m = steadyState * annuityFactor;
  } else if (policy === 'perpetuity') {
    initial_corpus_usd_m = steadyState / r;
  } else {
    // terminal_residual: corpus shrinks to residual_fraction of initial at end of horizon
    const denominator = 1 - (residual_fraction / Math.pow(1 + r, n));
    initial_corpus_usd_m = (steadyState * annuityFactor) / denominator;
  }

  // Approximate terminal corpus: initial grown at real yield minus annuity drawdowns
  const terminal_corpus_usd_m =
    policy === 'perpetuity'
      ? initial_corpus_usd_m
      : Math.max(0, initial_corpus_usd_m * residual_fraction);

  return {
    initial_corpus_usd_m:       Math.round(initial_corpus_usd_m    * 10) / 10,
    policy_used:                policy,
    terminal_corpus_usd_m:      Math.round(terminal_corpus_usd_m   * 10) / 10,
    steady_state_payment_usd_m: Math.round(steadyState             * 10) / 10,
    real_yield:                 Math.round(r * 10000) / 10000
  };
}

/**
 * Simulate year-by-year corpus trajectory from initial endowment.
 * Nominal yield is credited first; then scheduled payment is deducted.
 * Stops when corpus reaches zero or schedule ends.
 *
 * @param {number} initialCorpus  - Starting corpus in USD millions
 * @param {Array}  payoutSchedule - Output of computePortfolioPayoutSchedule
 * @param {Object} yieldParams    - { nominal_yield_pct, inflation_pct }
 * @returns {Array<{ year: number, corpus_usd_m: number, yield_earned_usd_m: number,
 *                   payment_out_usd_m: number, net_change_usd_m: number, depleted: boolean }>}
 */
export function simulateCorpusTrajectory(initialCorpus, payoutSchedule, yieldParams) {
  const nominalRate = yieldParams.nominal_yield_pct / 100;

  let corpus = initialCorpus;
  const trajectory = [];

  for (const row of payoutSchedule) {
    if (corpus <= 0) {
      trajectory.push({
        year:               row.year,
        corpus_usd_m:       0,
        yield_earned_usd_m: 0,
        payment_out_usd_m:  row.payment_out_usd_m,
        net_change_usd_m:   -row.payment_out_usd_m,
        depleted:           true
      });
      continue;
    }

    const yield_earned = corpus * nominalRate;
    const payment_out  = row.payment_out_usd_m;
    const net_change   = yield_earned - payment_out;
    corpus = Math.max(0, corpus + net_change);

    trajectory.push({
      year:               row.year,
      corpus_usd_m:       Math.round(corpus     * 10) / 10,
      yield_earned_usd_m: Math.round(yield_earned * 10) / 10,
      payment_out_usd_m:  Math.round(payment_out  * 10) / 10,
      net_change_usd_m:   Math.round(net_change   * 10) / 10,
      depleted:           corpus <= 0
    });
  }

  return trajectory;
}

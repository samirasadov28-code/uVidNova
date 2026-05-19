/**
 * trust-calculator.js
 * Pure ES module — no side effects, no I/O.
 * All functions are deterministic: numeric output comes from the asset record and
 * trustConfig lookup tables, never from an LLM.
 *
 * Core NAV iteration formula (from spec §math):
 *   NAV_{t+1} = NAV_t × (1 + r) - deployment_t + recycling_t + new_contributions_t
 */

'use strict';

// ── NAV trajectory ───────────────────────────────────────────────────────────

/**
 * Simulate year-by-year NAV trajectory for the Trust.
 *
 * NAV_{t+1} = NAV_t × (1 + r) - deployment_t + recycling_t + new_contributions_t
 *
 * During the deployment phase (years 1–deploymentHorizon):
 *   deployment_t  = NAV_t × deploymentRate
 *   recycling_t   = cumulative_deployed_t-1 × recyclingRate   (repayments + returns flow back)
 *   contributions = 0 (corpus is fixed at T=0)
 *
 * After deployment horizon: endowment mode (deployment stops; only returns and recycling).
 *
 * @param {Object} params
 * @param {number} params.initialNav_usd_bn   - Starting NAV in USD billions
 * @param {number} params.realReturn_pct       - Real annual return (e.g. 4.0 for 4%)
 * @param {number} params.deploymentRate_pct   - Annual deployment as % of NAV (e.g. 6.0)
 * @param {number} params.recyclingRate_pct    - Recycling as % of cumulative deployed (e.g. 15)
 * @param {number} params.horizonYears         - Total simulation horizon
 * @param {number} [params.deploymentHorizon]  - Years of active deployment (default: horizonYears/2)
 * @returns {Array<{year, nav, deployed_cumulative, deployment, recycling, net_return}>}
 */
export function simulateNavTrajectory(params) {
  const {
    initialNav_usd_bn,
    realReturn_pct,
    deploymentRate_pct,
    recyclingRate_pct,
    horizonYears,
    deploymentHorizon = Math.round(horizonYears / 2)
  } = params;

  const r      = realReturn_pct    / 100;
  const dRate  = deploymentRate_pct / 100;
  const rcRate = recyclingRate_pct  / 100;

  let nav                = initialNav_usd_bn;
  let deployedCumulative = 0;

  const trajectory = [{
    year:                 0,
    nav:                  round2(nav),
    deployed_cumulative:  0,
    deployment:           0,
    recycling:            0,
    net_return:           0
  }];

  for (let t = 1; t <= horizonYears; t++) {
    const net_return  = nav * r;
    const deployment  = t <= deploymentHorizon ? nav * dRate : 0;
    const recycling   = deployedCumulative * rcRate;

    deployedCumulative = Math.max(0, deployedCumulative + deployment - recycling);
    nav = Math.max(0, nav + net_return - deployment + recycling);

    trajectory.push({
      year:                 t,
      nav:                  round2(nav),
      deployed_cumulative:  round2(deployedCumulative),
      deployment:           round2(deployment),
      recycling:            round2(recycling),
      net_return:           round2(net_return)
    });
  }

  return trajectory;
}

/**
 * Compute the annual availability payment from the AP channel allocation.
 *
 * AP_annual = NAV × (ap_channel_pct / 100) × (deploymentRate / 100)
 *
 * The AP channel receives its slice of each year's deployment; this is the
 * predictable annual stream available to service concessional debt.
 *
 * @param {number} nav_usd_bn        - Current NAV
 * @param {number} apAlloc_pct       - Percentage of deployment allocated to AP channel
 * @param {number} deploymentRate_pct
 * @returns {number} Annual AP in USD billions
 */
export function computeAnnualAP(nav_usd_bn, apAlloc_pct, deploymentRate_pct) {
  return nav_usd_bn * (apAlloc_pct / 100) * (deploymentRate_pct / 100);
}

/**
 * Concessional debt supportable by an annual availability payment.
 * Formula: AP / debt_service_constant
 * where DSC = r / (1 - (1+r)^-n) for 15yr @ 2.5%
 *
 * @param {number} annualAP_usd_bn
 * @param {number} [tenorYears=15]
 * @param {number} [couponPct=2.5]
 * @returns {number} Supportable senior debt in USD billions
 */
export function computeSupportableDebt(annualAP_usd_bn, tenorYears = 15, couponPct = 2.5) {
  const r = couponPct / 100;
  const n = tenorYears;
  const dsc = r / (1 - Math.pow(1 + r, -n));
  return annualAP_usd_bn / dsc;
}

/**
 * Total capital mobilised (Trust capital + crowded-in) given a leverage multiplier.
 *
 * @param {number} trustCapital_usd_bn
 * @param {number} multiplierCentral  - e.g. 1.6 for ISIF
 * @returns {number} Total mobilised in USD billions
 */
export function computeTotalMobilised(trustCapital_usd_bn, multiplierCentral) {
  return trustCapital_usd_bn * multiplierCentral;
}

/**
 * Compute baseline scenario NAV for stat cards (Scenario A default).
 * Returns Year 1 and Year 10 and Year 30 values.
 *
 * @param {number} initialNav_usd_bn
 * @param {number} realReturn_pct
 * @param {number} deploymentRate_pct
 * @param {number} recyclingRate_pct
 */
export function computeKeyMilestones(initialNav_usd_bn, realReturn_pct, deploymentRate_pct, recyclingRate_pct) {
  const traj = simulateNavTrajectory({
    initialNav_usd_bn,
    realReturn_pct,
    deploymentRate_pct,
    recyclingRate_pct,
    horizonYears: 30,
    deploymentHorizon: 15
  });

  return {
    year0:  traj[0]?.nav  ?? initialNav_usd_bn,
    year10: traj[10]?.nav ?? null,
    year30: traj[30]?.nav ?? null,
    totalDeployed30: round2(traj.reduce((s, r) => s + r.deployment, 0))
  };
}

// ── Original project-level AP math (retained for asset detail page) ───────────

/**
 * Compute the annual Trust availability payment for a single project.
 * Retained from v1 for per-asset detail page compatibility.
 */
export function computeProjectAvailabilityPayment(asset, trustConfig) {
  const rl = asset.reparations_layer;
  if (!rl || rl.applies === false) return null;

  const debt   = rl.supportable_debt_usd_m;
  const tenor  = rl.tenor_years  ?? trustConfig.default_tenor_years;
  const coupon = rl.coupon_pct   ?? trustConfig.default_coupon_pct;
  const dscr   = rl.dscr         ?? trustConfig.default_dscr;

  if (debt == null || debt <= 0) return null;

  const r = coupon / 100;
  const n = tenor;
  const dsc = r / (1 - Math.pow(1 + r, -n));
  const debt_service_usd_m  = debt * dsc;
  const annual_payment_usd_m = debt_service_usd_m * dscr;

  return {
    annual_payment_usd_m:   Math.round(annual_payment_usd_m  * 1000) / 1000,
    debt_service_usd_m:     Math.round(debt_service_usd_m    * 1000) / 1000,
    supportable_debt_usd_m: debt
  };
}

/**
 * Simulate corpus trajectory from a fixed drawdown rate (legacy portfolio builder).
 *
 * @param {number} initialCorpus_usd_m  - USD millions
 * @param {number} drawdownPct          - e.g. 0.05
 * @param {number} annualReturnPct      - e.g. 0.045
 * @param {number} years
 * @returns {number[]} corpus in USD millions, index 0 = year 0
 */
export function computeTrustTrajectory(initialCorpus_usd_m, drawdownPct, annualReturnPct, years = 50) {
  const annualPayment = initialCorpus_usd_m * drawdownPct;
  const result = [initialCorpus_usd_m];
  let corpus = initialCorpus_usd_m;
  for (let y = 1; y <= years; y++) {
    corpus = Math.max(0, corpus * (1 + annualReturnPct) - annualPayment);
    result.push(corpus);
  }
  return result;
}

/**
 * Years until corpus depletion (drawdown > return case).
 * @returns {number|null} years or null if perpetual
 */
export function computeDepletionYears(principal_usd_m, drawdownPct, annualReturnPct) {
  if (drawdownPct <= annualReturnPct) return null;
  let corpus = principal_usd_m;
  const annualPayment = principal_usd_m * drawdownPct;
  for (let year = 1; year <= 200; year++) {
    corpus = corpus * (1 + annualReturnPct) - annualPayment;
    if (corpus <= 0) return year;
  }
  return 200;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Format a USD billion value for display.
 * @param {number} usd_bn
 * @returns {string}
 */
export function fmtBn(usd_bn) {
  if (usd_bn >= 1000) return `$${(usd_bn / 1000).toFixed(1)}T`;
  if (usd_bn >= 100)  return `$${Math.round(usd_bn)}B`;
  if (usd_bn >= 10)   return `$${usd_bn.toFixed(1)}B`;
  return `$${usd_bn.toFixed(2)}B`;
}

/**
 * Format a USD million value for display.
 * @param {number} usd_m
 * @returns {string}
 */
export function fmtM(usd_m) {
  if (usd_m >= 1000) return `$${(usd_m / 1000).toFixed(1)}B`;
  return `$${usd_m.toFixed(0)}M`;
}

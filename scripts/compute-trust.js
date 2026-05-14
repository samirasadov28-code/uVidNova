#!/usr/bin/env node
/**
 * compute-trust.js
 * Dev/CI validation tool. Loads all assets and trust_config.json, computes
 * the full portfolio payout schedule and all three corpus sizes, prints a
 * summary table to stdout.
 *
 * Usage: node scripts/compute-trust.js
 *
 * Pure deterministic arithmetic — no AI involvement in numeric output.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Inline pure functions (mirrors public/js/trust-calculator.js) ─────────────
function computeProjectAvailabilityPayment(asset, trustConfig) {
  const rl = asset.reparations_layer;
  if (!rl || rl.applies === false) return null;

  const debt   = rl.supportable_debt_usd_m;
  const tenor  = rl.tenor_years  ?? trustConfig.default_tenor_years;
  const coupon = rl.coupon_pct   ?? trustConfig.default_coupon_pct;
  const dscr   = rl.dscr         ?? trustConfig.default_dscr;

  if (debt == null || debt <= 0) return null;

  const r = coupon / 100;
  const n = tenor;
  const debt_service_factor = r / (1 - Math.pow(1 + r, -n));
  const debt_service_usd_m  = debt * debt_service_factor;
  const annual_payment_usd_m = debt_service_usd_m * dscr;

  return {
    annual_payment_usd_m:   Math.round(annual_payment_usd_m  * 1000) / 1000,
    debt_service_usd_m:     Math.round(debt_service_usd_m    * 1000) / 1000,
    supportable_debt_usd_m: debt
  };
}

function computePortfolioPayoutSchedule(assets, trustConfig) {
  const projects = assets
    .map(asset => {
      const rl = asset.reparations_layer;
      if (!rl || rl.applies === false) return null;
      const payment = computeProjectAvailabilityPayment(asset, trustConfig);
      if (!payment) return null;
      return {
        asset_id:             asset.asset_id,
        name_en:              asset.name?.en ?? asset.asset_id,
        commissioning_year:   rl.commissioning_year,
        annual_payment_usd_m: payment.annual_payment_usd_m
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
      project_count: active.length
    });
  }
  return schedule;
}

function computeRequiredCorpus(payoutSchedule, drawdownPolicy, yieldParams) {
  const { nominal_yield_pct, inflation_pct, horizon_years, residual_fraction } = yieldParams;
  const r = ((1 + nominal_yield_pct / 100) / (1 + inflation_pct / 100)) - 1;
  const n = horizon_years;
  const steadyState = Math.max(...payoutSchedule.map(y => y.payment_out_usd_m));
  const annuityFactor = (1 - Math.pow(1 + r, -n)) / r;

  let initial;
  const policy = drawdownPolicy ?? 'terminal_residual';
  if (policy === 'full_drawdown') {
    initial = steadyState * annuityFactor;
  } else if (policy === 'perpetuity') {
    initial = steadyState / r;
  } else {
    const denom = 1 - (residual_fraction / Math.pow(1 + r, n));
    initial = (steadyState * annuityFactor) / denom;
  }

  const terminal = policy === 'perpetuity'
    ? initial
    : Math.max(0, initial * residual_fraction);

  return {
    initial_corpus_usd_m:       Math.round(initial    * 10) / 10,
    policy_used:                policy,
    terminal_corpus_usd_m:      Math.round(terminal   * 10) / 10,
    steady_state_payment_usd_m: Math.round(steadyState * 10) / 10,
    real_yield:                 Math.round(r * 10000) / 10000
  };
}

function simulateCorpusTrajectory(initialCorpus, payoutSchedule, yieldParams) {
  const nominalRate = yieldParams.nominal_yield_pct / 100;
  let corpus = initialCorpus;
  return payoutSchedule.map(row => {
    if (corpus <= 0) {
      return { year: row.year, corpus_usd_m: 0, yield_earned_usd_m: 0,
               payment_out_usd_m: row.payment_out_usd_m,
               net_change_usd_m: -row.payment_out_usd_m, depleted: true };
    }
    const yield_earned = corpus * nominalRate;
    const payment_out  = row.payment_out_usd_m;
    corpus = Math.max(0, corpus + yield_earned - payment_out);
    return {
      year:               row.year,
      corpus_usd_m:       Math.round(corpus      * 10) / 10,
      yield_earned_usd_m: Math.round(yield_earned * 10) / 10,
      payment_out_usd_m:  Math.round(payment_out  * 10) / 10,
      net_change_usd_m:   Math.round((yield_earned - payment_out) * 10) / 10,
      depleted:           corpus <= 0
    };
  });
}

// ── Load data ─────────────────────────────────────────────────────────────────
const trustConfigPath = join(root, 'data', 'trust', 'trust_config.json');
if (!existsSync(trustConfigPath)) {
  console.error('ERROR: data/trust/trust_config.json not found.');
  process.exit(1);
}
const trustConfig = JSON.parse(readFileSync(trustConfigPath, 'utf8'));

const assetsDir = join(root, 'public', 'data', 'assets');
if (!existsSync(assetsDir)) {
  console.error('ERROR: public/data/assets/ not found.');
  process.exit(1);
}

const assets = readdirSync(assetsDir)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .sort()
  .map(f => JSON.parse(readFileSync(join(assetsDir, f), 'utf8')));

const eligible = assets.filter(a => a.reparations_layer?.applies === true);

// ── Per-project table ─────────────────────────────────────────────────────────
console.log('\n=== UKRAINE RECONSTRUCTION TRUST — PROJECT PAYMENT TABLE ===\n');
console.log(
  `${'ASSET_ID'.padEnd(46)} ${'BBB_CENTRAL'.padStart(11)} ${'DEBT_USD_M'.padStart(10)} ${'COUPON'.padStart(7)} ${'TENOR'.padStart(5)} ${'ANN_PMT'.padStart(8)} ${'COMMISS'.padStart(7)}`
);
console.log('─'.repeat(100));

let totalDebt = 0;
let totalPayment = 0;

for (const asset of eligible) {
  const rl = asset.reparations_layer;
  const bbb = asset.cost_paths?.build_back_better?.central_usd_m ?? 0;
  const pmt = computeProjectAvailabilityPayment(asset, trustConfig);
  if (!pmt) continue;

  totalDebt    += rl.supportable_debt_usd_m;
  totalPayment += pmt.annual_payment_usd_m;

  console.log(
    `${asset.asset_id.padEnd(46)} ${String(bbb).padStart(11)} ${String(rl.supportable_debt_usd_m).padStart(10)} ${String(rl.coupon_pct + '%').padStart(7)} ${String(rl.tenor_years + 'y').padStart(5)} ${String(pmt.annual_payment_usd_m.toFixed(1)).padStart(8)} ${String(rl.commissioning_year).padStart(7)}`
  );
}

console.log('─'.repeat(100));
console.log(
  `${'PORTFOLIO TOTAL'.padEnd(46)} ${' '.repeat(11)} ${String(Math.round(totalDebt * 10) / 10).padStart(10)} ${''.padStart(7)} ${''.padStart(5)} ${String(Math.round(totalPayment * 10) / 10).padStart(8)}`
);

// ── Payout schedule summary ───────────────────────────────────────────────────
const schedule = computePortfolioPayoutSchedule(eligible, trustConfig);

console.log('\n=== ANNUAL PAYOUT SCHEDULE (first 10 years) ===\n');
console.log(`${'YEAR'.padStart(5)}  ${'PAYMENT_OUT_USD_M'.padStart(18)}  ${'ACTIVE_PROJECTS'.padStart(15)}`);
console.log('─'.repeat(45));
for (const row of schedule.slice(0, 10)) {
  console.log(`${String(row.year).padStart(5)}  ${String(row.payment_out_usd_m.toFixed(1)).padStart(18)}  ${String(row.project_count).padStart(15)}`);
}
if (schedule.length > 10) {
  const last = schedule[schedule.length - 1];
  console.log(`  ...`);
  console.log(`${String(last.year).padStart(5)}  ${String(last.payment_out_usd_m.toFixed(1)).padStart(18)}  ${String(last.project_count).padStart(15)}`);
}

// ── Corpus sizes (all three policies) ────────────────────────────────────────
const yieldParams = {
  nominal_yield_pct: trustConfig.default_nominal_yield_pct,
  inflation_pct:     trustConfig.default_inflation_pct,
  horizon_years:     trustConfig.default_horizon_years,
  residual_fraction: trustConfig.default_residual_fraction
};

console.log('\n=== REQUIRED INITIAL CORPUS (USD billions) ===\n');
for (const policy of ['full_drawdown', 'perpetuity', 'terminal_residual']) {
  const corpus = computeRequiredCorpus(schedule, policy, yieldParams);
  const bn = (corpus.initial_corpus_usd_m / 1000).toFixed(2);
  const termBn = (corpus.terminal_corpus_usd_m / 1000).toFixed(2);
  console.log(`  ${policy.padEnd(22)}: initial USD ${bn} bn  |  terminal USD ${termBn} bn  |  real_yield ${(corpus.real_yield * 100).toFixed(2)}%  |  steady_state_pmt USD ${corpus.steady_state_payment_usd_m.toFixed(1)} m/yr`);
}

// ── Trajectory (terminal_residual policy, first 10 rows) ─────────────────────
const corpusTermResidual = computeRequiredCorpus(schedule, 'terminal_residual', yieldParams);
const trajectory = simulateCorpusTrajectory(corpusTermResidual.initial_corpus_usd_m, schedule, yieldParams);

console.log('\n=== CORPUS TRAJECTORY — terminal_residual policy (first 10 years) ===\n');
console.log(`${'YEAR'.padStart(5)}  ${'CORPUS_USD_M'.padStart(12)}  ${'YIELD_USD_M'.padStart(11)}  ${'PMT_USD_M'.padStart(10)}  ${'NET_USD_M'.padStart(10)}`);
console.log('─'.repeat(58));
for (const row of trajectory.slice(0, 10)) {
  console.log(
    `${String(row.year).padStart(5)}  ${String(row.corpus_usd_m.toFixed(1)).padStart(12)}  ${String(row.yield_earned_usd_m.toFixed(1)).padStart(11)}  ${String(row.payment_out_usd_m.toFixed(1)).padStart(10)}  ${String(row.net_change_usd_m.toFixed(1)).padStart(10)}`
  );
}

// ── Okhmatdyt reference check ─────────────────────────────────────────────────
console.log('\n=== REFERENCE CHECK: OKHMATDYT_2024_07_08 ===\n');
const okh = assets.find(a => a.asset_id === 'OKHMATDYT_2024_07_08');
if (okh) {
  const okhPmt = computeProjectAvailabilityPayment(okh, trustConfig);
  const rl = okh.reparations_layer;
  console.log(`  BBB central cost:       USD ${okh.cost_paths.build_back_better.central_usd_m} m`);
  console.log(`  Supportable debt:       USD ${rl.supportable_debt_usd_m} m  (${rl.reparations_availability_pct ?? 22}% of BBB central)`);
  console.log(`  Coupon:                 ${rl.coupon_pct}%`);
  console.log(`  Tenor:                  ${rl.tenor_years} years`);
  console.log(`  DSCR:                   ${rl.dscr}`);
  console.log(`  Annual debt service:    USD ${okhPmt.debt_service_usd_m.toFixed(3)} m`);
  console.log(`  Annual Trust payment:   USD ${okhPmt.annual_payment_usd_m.toFixed(3)} m`);
  console.log(`  Commissioning year:     ${rl.commissioning_year}`);
} else {
  console.log('  OKHMATDYT_2024_07_08 not found in assets.');
}

console.log('');

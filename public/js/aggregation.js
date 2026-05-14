/**
 * aggregation.js — Pipeline totals computed from the visible asset set.
 * Renders a summary panel in the filter sidebar.
 */

import { SECTOR_LABELS, COST_BAND_LABELS, FINANCING_CLASS_LABELS, getCostBand, getFinancingClass } from './filters.js';

const REBUILDABILITY_LABELS = {
  rebuildable:        'Rebuildable',
  recently_liberated: 'Recently liberated',
  frontline_adjacent: 'Frontline adjacent',
  occupied:           'Occupied'
};

// ── Compute ───────────────────────────────────────────────────────────────────

export function computeAggregation(assets) {
  let totalUSD = 0;
  const bySector        = {};
  const byRebuildability = {};
  const byCostBand      = {};
  const byFinancingClass = {};
  const byOblast        = {};
  let reDamagedCount = 0;

  for (const a of assets) {
    const central = a.cost_paths?.baseline?.central_usd_m ?? 0;
    totalUSD += central;

    // By sector
    const sector = a.sector ?? 'unknown';
    bySector[sector] ??= { total: 0, count: 0 };
    bySector[sector].total += central;
    bySector[sector].count++;

    // By rebuildability
    const reb = a.wartime_status?.rebuildability ?? 'unknown';
    byRebuildability[reb] ??= { total: 0, count: 0 };
    byRebuildability[reb].total += central;
    byRebuildability[reb].count++;

    // By cost band
    const band = getCostBand(a);
    byCostBand[band] ??= { total: 0, count: 0 };
    byCostBand[band].total += central;
    byCostBand[band].count++;

    // By financing class
    const fc = getFinancingClass(a);
    byFinancingClass[fc] ??= { total: 0, count: 0 };
    byFinancingClass[fc].total += central;
    byFinancingClass[fc].count++;

    // By oblast
    const oblast = a.location?.oblast ?? 'Unknown';
    byOblast[oblast] ??= { total: 0, count: 0 };
    byOblast[oblast].total += central;
    byOblast[oblast].count++;

    if ((a.damage?.re_damage_count ?? 0) >= 2) reDamagedCount++;
  }

  return {
    totalUSD,
    count: assets.length,
    bySector,
    byRebuildability,
    byCostBand,
    byFinancingClass,
    byOblast,
    reDamagedCount
  };
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtB(usdM) {
  if (usdM === 0) return '$0';
  if (usdM >= 1000) return `$${(usdM / 1000).toFixed(1)}B`;
  return `$${Math.round(usdM)}M`;
}

function sortedEntries(obj) {
  return Object.entries(obj).sort((a, b) => b[1].total - a[1].total);
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderAggregation(el, agg) {
  if (!el) return;
  if (agg.count === 0) {
    el.innerHTML = '<p class="agg-empty">No assets match current filters.</p>';
    return;
  }

  const maxSectorTotal = Math.max(...Object.values(agg.bySector).map(v => v.total), 1);

  const sectorRows = sortedEntries(agg.bySector).map(([sector, v]) => {
    const pct = Math.round((v.total / maxSectorTotal) * 100);
    const label = SECTOR_LABELS[sector] ?? sector;
    return `<div class="agg-row">
      <span class="agg-label" title="${label}">${label}</span>
      <div class="agg-bar-wrap">
        <div class="agg-bar" style="width:${pct}%"></div>
      </div>
      <span class="agg-value">${fmtB(v.total)}</span>
      <span class="agg-count">${v.count}</span>
    </div>`;
  }).join('');

  const rebRows = sortedEntries(agg.byRebuildability).map(([reb, v]) => {
    const label = REBUILDABILITY_LABELS[reb] ?? reb;
    return `<div class="agg-simple-row">
      <span class="agg-label">${label}</span>
      <span class="agg-value">${fmtB(v.total)}</span>
      <span class="agg-count">${v.count}</span>
    </div>`;
  }).join('');

  const oblastRows = sortedEntries(agg.byOblast).map(([oblast, v]) =>
    `<div class="agg-simple-row">
      <span class="agg-label">${oblast}</span>
      <span class="agg-value">${fmtB(v.total)}</span>
      <span class="agg-count">${v.count}</span>
    </div>`
  ).join('');

  const fcRows = sortedEntries(agg.byFinancingClass).map(([fc, v]) => {
    const label = FINANCING_CLASS_LABELS[fc] ?? fc;
    return `<div class="agg-simple-row">
      <span class="agg-label">${label}</span>
      <span class="agg-value">${fmtB(v.total)}</span>
      <span class="agg-count">${v.count}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="agg-total">
      <span class="agg-total-label">Pipeline baseline total</span>
      <span class="agg-total-value">${fmtB(agg.totalUSD)}</span>
    </div>

    <details class="agg-details" open>
      <summary class="agg-summary">By sector</summary>
      <div class="agg-section">${sectorRows}</div>
    </details>

    <details class="agg-details">
      <summary class="agg-summary">By rebuildability</summary>
      <div class="agg-section">${rebRows}</div>
    </details>

    <details class="agg-details">
      <summary class="agg-summary">By oblast</summary>
      <div class="agg-section">${oblastRows}</div>
    </details>

    <details class="agg-details">
      <summary class="agg-summary">By financing class</summary>
      <div class="agg-section">${fcRows}</div>
    </details>

    ${agg.reDamagedCount > 0 ? `
    <div class="agg-redamage">
      ⚠ ${agg.reDamagedCount} asset${agg.reDamagedCount !== 1 ? 's' : ''} re-damaged ×2 or more
    </div>` : ''}

    <p class="agg-note">All figures: USD baseline central estimate. Not guarantees.</p>`;
}

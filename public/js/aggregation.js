/**
 * aggregation.js — Pipeline totals computed from the visible asset set.
 * Renders a summary panel in the filter sidebar.
 */

import { SECTOR_LABELS, COST_BAND_LABELS, FINANCING_CLASS_LABELS, getCostBand, getFinancingClass } from './filters.js';
import { t } from './lang.js';

function rebuildabilityLabel(key) {
  const map = {
    rebuildable:        'filter.chip.rebuildable',
    recently_liberated: 'filter.chip.recently_liberated',
    frontline_adjacent: 'filter.chip.frontline_adjacent',
    occupied:           'filter.chip.occupied',
  };
  return map[key] ? t(map[key]) : key;
}

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
    el.innerHTML = `<p class="agg-empty">${t('agg.no_assets')}</p>`;
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
    const label = rebuildabilityLabel(reb);
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

  const reDamKey = agg.reDamagedCount === 1 ? 'agg.redamaged_note' : 'agg.redamaged_note_pl';
  el.innerHTML = `
    <div class="agg-total">
      <span class="agg-total-label">${t('agg.total_label')}</span>
      <span class="agg-total-value">${fmtB(agg.totalUSD)}</span>
    </div>

    <details class="agg-details" open>
      <summary class="agg-summary">${t('agg.by_sector')}</summary>
      <div class="agg-section">${sectorRows}</div>
    </details>

    <details class="agg-details">
      <summary class="agg-summary">${t('agg.by_rebuildability')}</summary>
      <div class="agg-section">${rebRows}</div>
    </details>

    <details class="agg-details">
      <summary class="agg-summary">${t('agg.by_oblast')}</summary>
      <div class="agg-section">${oblastRows}</div>
    </details>

    <details class="agg-details">
      <summary class="agg-summary">${t('agg.by_financing')}</summary>
      <div class="agg-section">${fcRows}</div>
    </details>

    ${agg.reDamagedCount > 0 ? `
    <div class="agg-redamage">
      ${t(reDamKey).replace('{n}', agg.reDamagedCount)}
    </div>` : ''}

    <p class="agg-note">${t('agg.disclaimer')}</p>`;
}

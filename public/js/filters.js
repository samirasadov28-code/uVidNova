/**
 * Filter state management for the map view.
 * Maintains active sets of sector / oblast / costBand / financingClass /
 * rebuildability / lifecycle filters, plus a reDamaged toggle.
 * Emits a custom 'filtersChanged' event on the document when state changes.
 */

import { t } from './lang.js';

export const SECTOR_LABELS = {
  energy_and_power:             'Energy & Power',
  healthcare:                   'Healthcare',
  education:                    'Education',
  residential:                  'Residential',
  heritage_and_culture:         'Heritage & Culture',
  transport_and_ports:          'Transport & Ports',
  water_and_sanitation:         'Water & Sanitation',
  industrial_and_agricultural:  'Industrial & Agricultural',
  public_administration:        'Public Administration'
};

export const REBUILDABILITY_LABELS = {
  rebuildable:        'Rebuildable',
  recently_liberated: 'Recently liberated',
  frontline_adjacent: 'Frontline adjacent',
  occupied:           'Occupied (pipeline only)'
};

export const LIFECYCLE_LABELS = {
  documented:           'Documented',
  assessed:             'Assessed',
  in_pipeline:          'In pipeline',
  funded:               'Funded',
  under_reconstruction: 'Under reconstruction',
  complete:             'Complete'
};

export const COST_BAND_LABELS = {
  under_100:  '< $100M',
  '100_500':  '$100M – $500M',
  '500_2000': '$500M – $2B',
  over_2000:  '> $2B'
};

export const FINANCING_CLASS_LABELS = {
  grant_led:         'Grant-led (≥50%)',
  concessional_led:  'Concessional-led',
  blended:           'Blended',
  private_anchored:  'Private (≥30%)'
};

// ── State ─────────────────────────────────────────────────────────────────────

export const state = {
  sectors:        new Set(),
  oblasts:        new Set(),
  costBand:       new Set(),
  financingClass: new Set(),
  rebuildability: new Set(['rebuildable']),
  lifecycle:      new Set(['documented', 'assessed']),
  reDamaged:      false
};

export function getActiveFilters() {
  return {
    sectors:        new Set(state.sectors),
    oblasts:        new Set(state.oblasts),
    costBand:       new Set(state.costBand),
    financingClass: new Set(state.financingClass),
    rebuildability: new Set(state.rebuildability),
    lifecycle:      new Set(state.lifecycle),
    reDamaged:      state.reDamaged
  };
}

// ── Derived classification helpers ────────────────────────────────────────────

export function getCostBand(asset) {
  const c = asset.cost_paths?.baseline?.central_usd_m ?? 0;
  if (c < 100)  return 'under_100';
  if (c < 500)  return '100_500';
  if (c < 2000) return '500_2000';
  return 'over_2000';
}

export function getFinancingClass(asset) {
  const fs = asset.financing_structures?.baseline;
  if (!fs) return 'blended';
  if ((fs.private_pct ?? 0) >= 30) return 'private_anchored';
  if ((fs.grant_pct ?? 0) >= 50)   return 'grant_led';
  if ((fs.concessional_pct ?? 0) >= (fs.grant_pct ?? 0)) return 'concessional_led';
  return 'blended';
}

// ── Filter predicate ──────────────────────────────────────────────────────────

export function matchesFilters(asset) {
  const { sectors, oblasts, costBand, financingClass, rebuildability, lifecycle, reDamaged } = state;

  if (sectors.size > 0 && !sectors.has(asset.sector)) return false;
  if (oblasts.size > 0 && !oblasts.has(asset.location?.oblast)) return false;
  if (rebuildability.size > 0 && !rebuildability.has(asset.wartime_status?.rebuildability)) return false;
  if (lifecycle.size > 0 && !lifecycle.has(asset.wartime_status?.lifecycle)) return false;
  if (costBand.size > 0 && !costBand.has(getCostBand(asset))) return false;
  if (financingClass.size > 0 && !financingClass.has(getFinancingClass(asset))) return false;
  if (reDamaged && (asset.damage?.re_damage_count ?? 0) < 2) return false;

  return true;
}

// ── Chip toggle helper ────────────────────────────────────────────────────────

function toggleChip(button, stateSet, value) {
  if (stateSet.has(value)) {
    stateSet.delete(value);
    button.classList.remove('active');
  } else {
    stateSet.add(value);
    button.classList.add('active');
  }
  document.dispatchEvent(new CustomEvent('filtersChanged'));
}

// ── Filter initialisers ───────────────────────────────────────────────────────

export function initSectorFilter(container, availableSectors) {
  container.innerHTML = '';
  for (const sector of availableSectors) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.value = sector;
    btn.dataset.i18n = `sector.${sector}`;
    btn.textContent = t(`sector.${sector}`) || SECTOR_LABELS[sector] || sector;
    btn.addEventListener('click', () => toggleChip(btn, state.sectors, sector));
    container.appendChild(btn);
  }
}

export function initOblastFilter(container, availableOblasts) {
  container.innerHTML = '';
  for (const oblast of availableOblasts) {
    const btn = document.createElement('button');
    btn.className = 'chip chip-sm';
    btn.textContent = oblast;
    btn.dataset.value = oblast;
    btn.addEventListener('click', () => toggleChip(btn, state.oblasts, oblast));
    container.appendChild(btn);
  }
}

export function initCostBandFilter(container) {
  container.innerHTML = '';
  for (const [value] of Object.entries(COST_BAND_LABELS)) {
    const btn = document.createElement('button');
    btn.className = 'chip chip-sm';
    btn.dataset.value = value;
    btn.dataset.i18n = `costband.${value}`;
    btn.textContent = t(`costband.${value}`) || COST_BAND_LABELS[value];
    btn.addEventListener('click', () => toggleChip(btn, state.costBand, value));
    container.appendChild(btn);
  }
}

export function initFinancingClassFilter(container) {
  container.innerHTML = '';
  for (const [value] of Object.entries(FINANCING_CLASS_LABELS)) {
    const btn = document.createElement('button');
    btn.className = 'chip chip-sm';
    btn.dataset.value = value;
    btn.dataset.i18n = `financing.${value}`;
    btn.textContent = t(`financing.${value}`) || FINANCING_CLASS_LABELS[value];
    btn.addEventListener('click', () => toggleChip(btn, state.financingClass, value));
    container.appendChild(btn);
  }
}

export function initToggleChips(container, stateSet) {
  for (const btn of container.querySelectorAll('.chip')) {
    const value = btn.dataset.value;
    if (stateSet.has(value)) btn.classList.add('active');
    btn.addEventListener('click', () => toggleChip(btn, stateSet, value));
  }
}

export function initReDamageFilter(button) {
  if (!button) return;
  button.addEventListener('click', () => {
    state.reDamaged = !state.reDamaged;
    button.classList.toggle('active', state.reDamaged);
    document.dispatchEvent(new CustomEvent('filtersChanged'));
  });
}

export function resetAllFilters() {
  state.sectors.clear();
  state.oblasts.clear();
  state.costBand.clear();
  state.financingClass.clear();
  state.rebuildability.clear();
  state.rebuildability.add('rebuildable');
  state.lifecycle.clear();
  state.lifecycle.add('documented');
  state.lifecycle.add('assessed');
  state.reDamaged = false;
  document.dispatchEvent(new CustomEvent('filtersChanged'));
}

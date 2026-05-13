/**
 * Filter state management for the map view.
 * Maintains active sets of sector / rebuildability / lifecycle filters.
 * Emits a custom 'filtersChanged' event on the document when state changes.
 */

export const SECTOR_LABELS = {
  energy_and_power: 'Energy & Power',
  healthcare: 'Healthcare',
  education: 'Education',
  residential: 'Residential',
  heritage_and_culture: 'Heritage & Culture',
  transport_and_ports: 'Transport & Ports',
  water_and_sanitation: 'Water & Sanitation',
  industrial_and_agricultural: 'Industrial & Agricultural',
  public_administration: 'Public Administration'
};

export const REBUILDABILITY_LABELS = {
  rebuildable: 'Rebuildable',
  recently_liberated: 'Recently liberated',
  frontline_adjacent: 'Frontline adjacent',
  occupied: 'Occupied (pipeline only)'
};

export const LIFECYCLE_LABELS = {
  documented: 'Documented',
  assessed: 'Assessed',
  in_pipeline: 'In pipeline',
  funded: 'Funded',
  under_reconstruction: 'Under reconstruction',
  complete: 'Complete'
};

const state = {
  sectors: new Set(),
  rebuildability: new Set(['rebuildable']),
  lifecycle: new Set(['documented', 'assessed'])
};

export function getActiveFilters() {
  return {
    sectors: new Set(state.sectors),
    rebuildability: new Set(state.rebuildability),
    lifecycle: new Set(state.lifecycle)
  };
}

export function matchesFilters(asset) {
  const { sectors, rebuildability, lifecycle } = state;

  if (sectors.size > 0 && !sectors.has(asset.sector)) return false;
  if (rebuildability.size > 0 && !rebuildability.has(asset.wartime_status?.rebuildability)) return false;
  if (lifecycle.size > 0 && !lifecycle.has(asset.wartime_status?.lifecycle)) return false;

  return true;
}

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

export function initSectorFilter(container, availableSectors) {
  container.innerHTML = '';
  for (const sector of availableSectors) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = SECTOR_LABELS[sector] ?? sector;
    btn.dataset.value = sector;
    btn.addEventListener('click', () => toggleChip(btn, state.sectors, sector));
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

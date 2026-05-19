/**
 * growth-sectors.js — Load and render Ukraine post-war growth sector data.
 * Used by asset-view.js (oblast context panel) and finance-wizard.js (greenfield mode).
 */

let _sectors = null;

export async function loadGrowthSectors() {
  if (_sectors) return _sectors;
  const res = await fetch('/data/growth_sectors.json');
  if (!res.ok) throw new Error('Could not load growth_sectors.json');
  const data = await res.json();
  _sectors = data;
  return data;
}

export function getSectorsForOblast(data, oblast) {
  if (!oblast) return [];
  return data.sectors.filter(s => s.relevant_oblasts.includes(oblast));
}

export function getAllSectors(data) {
  return data.sectors;
}

export function getGreenfieldsTemplates(data) {
  return data.greenfield_templates;
}

const PEACE_LABELS = {
  pre_armistice:         { label: 'Available now',      cls: 'gs-gate-green'  },
  post_armistice_fragile:{ label: 'Post ceasefire',     cls: 'gs-gate-amber'  },
  post_armistice_durable:{ label: 'Durable peace only', cls: 'gs-gate-red'    },
  mixed:                 { label: 'Varies by oblast',   cls: 'gs-gate-amber'  },
};

const DFI_LABELS = {
  limited:          'Limited DFI role',
  minimal:          'Commercial-led; minimal DFI',
  anchoring:        'DFI-anchored deal structure',
  catalytic:        'DFI catalytic / blended',
  development_equity:'DFI development equity',
};

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Render the asset-page growth sector context panel. */
export function renderGrowthSectorPanel(asset, data) {
  const oblast = asset?.location?.oblast;
  const sectors = getSectorsForOblast(data, oblast);
  if (!sectors.length) return '';

  const cards = sectors.map(s => {
    const gate   = PEACE_LABELS[s.peace_state_availability] ?? PEACE_LABELS.mixed;
    const dfiLbl = DFI_LABELS[s.dfi_role] ?? s.dfi_role;
    const archs  = s.archetypes.map(a =>
      `<span class="gs-archetype">${escHtml(a.label)} — <strong>USD ${a.scale_usd_m.toLocaleString()}M</strong></span>`
    ).join('');

    return `<div class="gs-card">
      <div class="gs-card-header">
        <span class="gs-icon">${s.icon}</span>
        <span class="gs-name">${escHtml(s.label)}</span>
        <span class="gs-gate ${gate.cls}">${gate.label}</span>
      </div>
      <p class="gs-thesis">${escHtml(s.thesis_one_line)}</p>
      <p class="gs-position">${escHtml(s.unique_positioning)}</p>
      <div class="gs-meta">
        <span class="gs-dfi-badge">${escHtml(dfiLbl)}</span>
        <div class="gs-archetypes">${archs}</div>
      </div>
      <details class="gs-risks">
        <summary>Key risks</summary>
        <ul>${s.key_risks.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
      </details>
    </div>`;
  }).join('');

  return `<section class="asset-section gs-panel" aria-label="Oblast growth context">
    <h2 class="section-title">Growth Sectors — ${escHtml(oblast)} Context</h2>
    <p class="section-note">Post-war investment opportunities structurally linked to this oblast. Respects Peace State scenario. Not reconstruction of damaged assets — new capital formation.</p>
    <div class="gs-grid">${cards}</div>
    <p class="gs-finance-link">
      <a href="/finance.html" class="gs-cta-link">Model financing for a growth sector project →</a>
    </p>
  </section>`;
}

/** Render the sector + archetype picker used inside the Finance It wizard. */
export function renderWizardSectorPicker(data, selectedSectorId, selectedArchetypeId, currentPeaceState) {
  const sectors = data.sectors;

  const sectorCards = sectors.map(s => {
    const gate = PEACE_LABELS[s.peace_state_availability] ?? PEACE_LABELS.mixed;
    const blocked = currentPeaceState === 'pre_armistice' && s.peace_state_availability === 'post_armistice_durable';
    const dimmed  = currentPeaceState === 'pre_armistice' && s.peace_state_availability !== 'pre_armistice' && s.peace_state_availability !== 'mixed';
    return `<label class="gs-wiz-card ${selectedSectorId === s.id ? 'gs-wiz-sel' : ''} ${blocked ? 'gs-wiz-blocked' : dimmed ? 'gs-wiz-dim' : ''}" title="${escHtml(s.thesis_one_line)}">
      <input type="radio" name="gsSector" value="${s.id}" ${selectedSectorId === s.id ? 'checked' : ''} ${blocked ? 'disabled' : ''} class="fw-sr">
      <span class="gs-wiz-icon">${s.icon}</span>
      <span class="gs-wiz-name">${escHtml(s.short_label)}</span>
      <span class="gs-gate ${gate.cls} gs-gate-sm">${gate.label}</span>
    </label>`;
  }).join('');

  const selectedSector = sectors.find(s => s.id === selectedSectorId);
  const archetypeHTML = selectedSector ? `
    <div class="gs-arch-picker" id="gsArchPicker">
      <h4 class="gs-arch-title">Select project archetype — <em>${escHtml(selectedSector.label)}</em></h4>
      <p class="gs-arch-thesis">${escHtml(selectedSector.thesis_one_line)}</p>
      <div class="gs-arch-list">
        ${selectedSector.archetypes.map(a => {
          const sel = selectedArchetypeId === a.id;
          return `<label class="gs-arch-card ${sel ? 'gs-arch-sel' : ''}">
            <input type="radio" name="gsArchetype" value="${a.id}" ${sel ? 'checked' : ''} class="fw-sr">
            <span class="gs-arch-name">${escHtml(a.label)}</span>
            <span class="gs-arch-scale">USD ${a.scale_usd_m.toLocaleString()}M</span>
            <span class="gs-arch-note">${escHtml(a.scale_note)}</span>
          </label>`;
        }).join('')}
      </div>
      <p class="gs-capital-note">${escHtml(DFI_LABELS[selectedSector.dfi_role] ?? selectedSector.dfi_role)}</p>
    </div>` : `<p class="gs-arch-prompt">← Select a sector to see project archetypes</p>`;

  return `<div class="gs-wiz-wrap">
    <div class="gs-wiz-grid" id="gsWizGrid">${sectorCards}</div>
    <div id="gsWizArch">${archetypeHTML}</div>
  </div>`;
}

/**
 * Render a multi-select growth project picker for the "portfolio + growth" scope.
 * selectedProjects: Array<{ sectorId, archetypeId, label, sector, scale_usd_m }>
 */
export function renderPortfolioGrowthPicker(data, selectedProjects = []) {
  const selectedSet = new Set(selectedProjects.map(p => p.archetypeId));

  const sectorItems = data.sectors.map(s => {
    const gate = PEACE_LABELS[s.peace_state_availability] ?? PEACE_LABELS.mixed;
    const archs = s.archetypes.map(a => {
      const checked = selectedSet.has(a.id);
      return `<label class="fw-gs-arch-item ${checked ? 'fw-gs-arch-checked' : ''}">
        <input type="checkbox" class="fw-growth-cb fw-sr"
               value="${a.id}"
               data-sector-id="${s.id}"
               data-arch-id="${a.id}"
               data-label="${escHtml(a.label)}"
               data-sector="${escHtml(s.label)}"
               data-scale="${a.scale_usd_m}"
               ${checked ? 'checked' : ''}>
        <span class="fw-gs-arch-name">${escHtml(a.label)}</span>
        <span class="fw-gs-arch-scale">USD ${a.scale_usd_m.toLocaleString()}M</span>
        ${a.scale_note ? `<span class="fw-gs-arch-note">${escHtml(a.scale_note)}</span>` : ''}
      </label>`;
    }).join('');

    const hasSelected = s.archetypes.some(a => selectedSet.has(a.id));

    return `<details class="fw-gs-sector-item" ${hasSelected ? 'open' : ''}>
      <summary class="fw-gs-sector-summary">
        <span class="fw-gs-icon">${s.icon}</span>
        <span class="fw-gs-sname">${escHtml(s.short_label ?? s.label)}</span>
        <span class="gs-gate ${gate.cls} gs-gate-sm">${gate.label}</span>
        ${hasSelected ? `<span class="fw-gs-sel-count">${s.archetypes.filter(a => selectedSet.has(a.id)).length} selected</span>` : ''}
      </summary>
      <div class="fw-gs-arch-list">${archs}</div>
    </details>`;
  }).join('');

  const selectedChips = selectedProjects.length > 0
    ? `<div class="fw-growth-chips" id="fwGrowthChips">
        ${selectedProjects.map(p => `
          <span class="fw-growth-chip">
            ${escHtml(p.label)} <span class="fw-gc-scale">USD ${(+p.scale_usd_m).toLocaleString()}M</span>
          </span>`).join('')}
        <span class="fw-growth-total-chip">Growth total: <strong>USD ${selectedProjects.reduce((s, p) => s + p.scale_usd_m, 0).toLocaleString()}M</strong></span>
      </div>`
    : `<p class="fw-growth-empty" id="fwGrowthChips">No growth projects selected yet.</p>`;

  return `<div class="fw-growth-picker" id="fwGrowthPicker">
    <p class="fw-growth-intro">Select greenfield growth projects to model alongside damage rehabilitation. Each adds to the total financing requirement.</p>
    ${selectedChips}
    <div class="fw-gs-sectors">${sectorItems}</div>
  </div>`;
}

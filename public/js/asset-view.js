/**
 * asset-view.js — Per-asset detail page.
 * Reads ?id= from the URL, fetches data/assets/<id>.json, renders every schema field.
 * Inline source citations shown for all sourced figures.
 */

import { loadAsset } from './data-loader.js';
import { renderCostWorking } from './cost-calculator.js';

const SECTOR_LABELS = {
  energy_and_power: 'Energy and Power',
  healthcare: 'Healthcare',
  education: 'Education',
  residential: 'Residential',
  heritage_and_culture: 'Heritage and Culture',
  transport_and_ports: 'Transport and Ports',
  water_and_sanitation: 'Water, Sanitation and Public Services',
  industrial_and_agricultural: 'Industrial and Agricultural',
  public_administration: 'Public Administration'
};

const LIFECYCLE_LABELS = {
  documented: 'Documented',
  assessed: 'Assessed',
  in_pipeline: 'In pipeline',
  funded: 'Funded',
  under_reconstruction: 'Under reconstruction',
  complete: 'Complete'
};

const REBUILDABILITY_LABELS = {
  rebuildable: 'Rebuildable',
  recently_liberated: 'Recently liberated',
  frontline_adjacent: 'Frontline adjacent (pipeline only)',
  occupied: 'Occupied territory (pipeline only)'
};

const DESTRUCTION_LABELS = {
  light: 'Light (10–25% of replacement cost)',
  moderate: 'Moderate (30–55%)',
  severe: 'Severe (60–85%)',
  destroyed: 'Destroyed (95–110%)'
};

const DE_RISKING_LABELS = {
  MIGA_WAR: 'MIGA War & Civil Disturbance Insurance',
  UA_GUARANTEE: 'UA Government Guarantee',
  UKEF: 'UK Export Finance',
  BPIFRANCE_AE: 'Bpifrance Assurance Export',
  ALLIANZ_TRADE: 'Allianz Trade Political Risk',
  EU_FACILITY_FIRST_LOSS: 'EU Facility First-Loss Guarantee',
  EBRD_RSF: 'EBRD Risk Sharing Facility',
  NONE: 'None identified'
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

function fmtUSD(m) {
  if (m === null || m === undefined) return '—';
  return `USD ${fmt(m)}M`;
}

function sourceChip(source, ref) {
  if (!source) return '';
  const label = source.replace(/_/g, ' ');
  const title = ref ? `Source: ${ref}` : `Source: ${label}`;
  return `<span class="source-chip" title="${escHtml(title)}">${escHtml(label)}</span>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function field(label, value, note) {
  if (value === null || value === undefined || value === '') return '';
  return `<tr>
    <th scope="row">${escHtml(label)}</th>
    <td>${escHtml(String(value))}${note ? ` <small class="field-note">${note}</small>` : ''}</td>
  </tr>`;
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderIdentity(a) {
  const reCount = a.damage?.re_damage_count ?? 0;
  return `
    <section class="asset-section" id="identity">
      <h1 class="asset-name">${escHtml(a.name?.en ?? a.asset_id)}</h1>
      ${a.name?.uk ? `<p class="asset-name-uk">${escHtml(a.name.uk)}</p>` : ''}
      ${reCount >= 2 ? `<div class="redamage-alert">⚠ Re-damaged ${reCount} time(s) — material investor-information field</div>` : ''}
      <div class="asset-badges">
        <span class="badge badge-sector">${escHtml(SECTOR_LABELS[a.sector] ?? a.sector)}</span>
        <span class="badge badge-type">${escHtml(a.asset_type)}</span>
        <span class="badge badge-lifecycle">${escHtml(LIFECYCLE_LABELS[a.wartime_status?.lifecycle] ?? a.wartime_status?.lifecycle)}</span>
        <span class="badge badge-rebuild">${escHtml(REBUILDABILITY_LABELS[a.wartime_status?.rebuildability] ?? a.wartime_status?.rebuildability)}</span>
      </div>
    </section>`;
}

function renderLocation(a) {
  const loc = a.location;
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lon}&zoom=14`;
  return `
    <section class="asset-section" id="location">
      <h2>Location</h2>
      <table class="field-table">
        ${field('Oblast', loc.oblast)}
        ${loc.raion ? field('Raion', loc.raion) : ''}
        ${field('Settlement', loc.settlement)}
        ${loc.address_en ? field('Address', loc.address_en) : ''}
        ${field('Coordinates', `${loc.lat.toFixed(4)}°N, ${loc.lon.toFixed(4)}°E`)}
      </table>
      <p><a href="${mapsUrl}" target="_blank" rel="noopener" class="osm-link">View on OpenStreetMap ↗</a></p>
    </section>`;
}

function renderDamage(a) {
  const d = a.damage;
  const sources = d.evidence_sources ?? [];
  return `
    <section class="asset-section" id="damage">
      <h2>Damage Record</h2>
      <table class="field-table">
        ${field('Incident date', d.incident_date)}
        ${field('Incident type', d.incident_type?.replace(/_/g, ' '))}
        ${field('Destruction level', DESTRUCTION_LABELS[d.destruction_level] ?? d.destruction_level)}
        ${field('Re-damage count', d.re_damage_count, d.re_damage_count >= 2 ? '⚠ Yellow-flag: material investor-information field' : '')}
        ${field('Verified by', d.verified_by?.join(', '))}
      </table>
      ${sources.length > 0 ? `
        <h3>Evidence sources</h3>
        <ul class="source-list">
          ${sources.map(s => `<li><a href="${escHtml(s.url)}" target="_blank" rel="noopener">${escHtml(s.title)}</a>${s.source_code ? ` <span class="source-chip">${escHtml(s.source_code)}</span>` : ''}</li>`).join('')}
        </ul>` : ''}
    </section>`;
}

function renderWartimeStatus(a) {
  const w = a.wartime_status;
  const deRisking = (w.de_risking ?? []).map(k => DE_RISKING_LABELS[k] ?? k);
  return `
    <section class="asset-section" id="wartime-status">
      <h2>Wartime Status</h2>
      <table class="field-table">
        ${field('Lifecycle stage', LIFECYCLE_LABELS[w.lifecycle] ?? w.lifecycle)}
        ${field('Rebuildability', REBUILDABILITY_LABELS[w.rebuildability] ?? w.rebuildability)}
        ${field('Sovereign risk band', w.sovereign_risk_band)}
        ${deRisking.length > 0 ? field('De-risking instruments', deRisking.join('; ')) : ''}
      </table>
    </section>`;
}

function renderPhysicalSpecs(a) {
  const specs = a.physical_specs ?? {};
  const entries = Object.entries(specs);
  if (entries.length === 0) return '';
  return `
    <section class="asset-section" id="physical-specs">
      <h2>Physical Specifications</h2>
      <table class="field-table">
        ${entries.map(([key, s]) => {
          const label = key.replace(/_/g, ' ');
          const unit = s.unit ? ` ${s.unit}` : '';
          const chip = sourceChip(s.source, s.ref);
          return `<tr>
            <th scope="row">${escHtml(label)}</th>
            <td>${fmt(s.value)}${escHtml(unit)} ${chip}</td>
          </tr>`;
        }).join('')}
      </table>
    </section>`;
}

function renderCostPaths(a) {
  const cp = a.cost_paths;
  const pending = cp?.pending_methodology;
  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const pathLabels = {
    baseline: 'Baseline',
    code_compliant: 'Code-compliant',
    build_back_better: 'Build-back-better'
  };
  const pathDescs = {
    baseline: 'Repair to pre-war condition',
    code_compliant: 'Rebuild to current EU/UA building codes',
    build_back_better: 'Rebuild with technology overlays'
  };

  return `
    <section class="asset-section" id="cost-paths">
      <h2>Reconstruction Cost Estimates</h2>
      ${pending ? `<p class="pending-note">⏳ Cost methodology pending. Figures are illustrative placeholders; unit-cost table (Weekend 2) not yet populated.</p>` : ''}
      <div class="disclaimer-inline">
        Cost figures are estimates derived from published unit-cost benchmarks (RDNA3, KSE Institute) and named comparable Ukrainian precedents.
        They are not guarantees, not procurement quotes, and not a substitute for transaction-level due diligence.
        All amounts in USD millions.
      </div>
      <div class="cost-path-grid">
        ${paths.map(path => {
          const t = cp?.[path];
          if (!t) return '';
          const overlays = t.tech_overlays ?? [];
          return `
            <div class="cost-card">
              <h3 class="cost-card-title">${pathLabels[path]}</h3>
              <p class="cost-card-desc">${pathDescs[path]}</p>
              <div class="cost-range">
                <span class="cost-low">${fmtUSD(t.low_usd_m)}</span>
                <span class="cost-sep">–</span>
                <span class="cost-high">${fmtUSD(t.high_usd_m)}</span>
              </div>
              <div class="cost-central">Central: <strong>${fmtUSD(t.central_usd_m)}</strong></div>
              ${overlays.length > 0 ? `<div class="tech-overlays">
                <span class="overlays-label">Technology overlays:</span>
                ${overlays.map(o => `<span class="overlay-chip">${escHtml(o.replace(/_/g, ' '))}</span>`).join('')}
              </div>` : ''}
            </div>`;
        }).join('')}
      </div>
      <details class="calc-details">
        <summary>Show cost formula and working</summary>
        <div id="calcWorking"></div>
      </details>
    </section>`;
}

function renderFinancing(a) {
  const fs = a.financing_structures;
  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const pathLabels = { baseline: 'Baseline', code_compliant: 'Code-compliant', build_back_better: 'Build-back-better' };

  return `
    <section class="asset-section" id="financing">
      <h2>Financing Structures</h2>
      <p class="section-note">Grant + concessional + public equity + private = 100% in each path.</p>
      <div class="financing-grid">
        ${paths.map(path => {
          const s = fs?.[path];
          if (!s) return '';
          const refs = s.comparable_projects ?? [];
          return `
            <div class="financing-card">
              <h3>${pathLabels[path]}</h3>
              <div class="stack-bar" title="Financing stack">
                ${s.grant_pct > 0 ? `<span class="stack-seg grant" style="width:${s.grant_pct}%">${s.grant_pct}%<span class="seg-label">Grant</span></span>` : ''}
                ${s.concessional_pct > 0 ? `<span class="stack-seg concessional" style="width:${s.concessional_pct}%">${s.concessional_pct}%<span class="seg-label">Concess.</span></span>` : ''}
                ${s.public_equity_pct > 0 ? `<span class="stack-seg public-equity" style="width:${s.public_equity_pct}%">${s.public_equity_pct}%<span class="seg-label">Pub. equity</span></span>` : ''}
                ${s.private_pct > 0 ? `<span class="stack-seg private" style="width:${s.private_pct}%">${s.private_pct}%<span class="seg-label">Private</span></span>` : ''}
              </div>
              ${s.rationale ? `<p class="financing-rationale">${escHtml(s.rationale)}</p>` : ''}
              ${refs.length > 0 ? `<p class="comparable-refs">Comparables: ${refs.join(', ')}</p>` : ''}
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderDonorPathway(a) {
  const dp = a.donor_pathway;
  if (!dp) return '';
  const { united24_url, mriya_url, vetted_ngos } = dp;
  if (!united24_url && !mriya_url && (!vetted_ngos || vetted_ngos.length === 0)) return '';

  return `
    <section class="asset-section" id="donor-pathway">
      <h2>Institutional Donor Pathway</h2>
      <p class="section-note">Direct links to verified government and vetted-NGO channels. uVidNova is not a fundraising platform and earns nothing from these links.</p>
      <ul class="donor-list">
        ${united24_url ? `<li><a href="${escHtml(united24_url)}" target="_blank" rel="noopener">UNITED24 project page ↗</a></li>` : ''}
        ${mriya_url ? `<li><a href="${escHtml(mriya_url)}" target="_blank" rel="noopener">Mriya State Application ↗</a></li>` : ''}
        ${(vetted_ngos ?? []).map(ngo => `<li>${escHtml(ngo)}</li>`).join('')}
      </ul>
    </section>`;
}

function renderMeta(a) {
  return `
    <section class="asset-section" id="meta">
      <h2>Record Metadata</h2>
      <table class="field-table">
        ${field('Asset ID', a.asset_id)}
        ${field('Last reviewed', a.last_reviewed)}
        ${field('Schema version', a.version)}
        ${field('Tags', (a.tags ?? []).join(', '))}
      </table>
    </section>`;
}

// ── Main render ────────────────────────────────────────────────────────────────

function renderAsset(asset) {
  const record = document.getElementById('assetRecord');
  if (!record) return;

  record.innerHTML = [
    renderIdentity(asset),
    renderLocation(asset),
    renderDamage(asset),
    renderWartimeStatus(asset),
    renderPhysicalSpecs(asset),
    renderCostPaths(asset),
    renderFinancing(asset),
    renderDonorPathway(asset),
    renderMeta(asset)
  ].join('');

  // Update page title
  document.title = `${asset.name?.en ?? asset.asset_id} — uVidNova`;

  // Lazy-load the formula working when the <details> is first opened
  const calcDetails = document.querySelector('.calc-details');
  const calcEl = document.getElementById('calcWorking');
  if (calcDetails && calcEl) {
    let loaded = false;
    calcDetails.addEventListener('toggle', () => {
      if (calcDetails.open && !loaded) {
        loaded = true;
        renderCostWorking(asset, calcEl);
      }
    });
  }

  document.getElementById('loadingState').hidden = true;
  record.hidden = false;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    document.getElementById('loadingState').hidden = true;
    document.getElementById('errorMessage').textContent = 'No asset ID specified. Use ?id=ASSET_ID.';
    document.getElementById('errorState').hidden = false;
    return;
  }

  try {
    const asset = await loadAsset(id);
    renderAsset(asset);
  } catch (err) {
    document.getElementById('loadingState').hidden = true;
    document.getElementById('errorMessage').textContent = `Could not load asset "${id}": ${err.message}`;
    document.getElementById('errorState').hidden = false;
  }
}

init();

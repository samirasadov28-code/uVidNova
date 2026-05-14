/**
 * asset-view.js — Per-asset detail page.
 * Reads ?id= from the URL, fetches data/assets/<id>.json, renders every schema field.
 * Inline source citations shown for all sourced figures.
 */

import { loadAsset } from './data-loader.js';
import { renderCostWorking } from './cost-calculator.js';
import { getLang, initLangToggle } from './lang.js';
import { loadGrowthSectors, renderGrowthSectorPanel } from './growth-sectors.js';

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
  const isUk = getLang() === 'uk' && a.name?.uk;
  const h1Name  = isUk ? a.name.uk : (a.name?.en ?? a.asset_id);
  const subName = isUk
    ? (a.name?.en ? `<p class="asset-name-sub">${escHtml(a.name.en)}</p>` : '')
    : (a.name?.uk ? `<p class="asset-name-uk">${escHtml(a.name.uk)}</p>` : '');
  return `
    <section class="asset-section" id="identity">
      <h1 class="asset-name">${escHtml(h1Name)}</h1>
      ${subName}
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
          ${sources.map(s => {
            const link = s.url
              ? `<a href="${escHtml(s.url)}" target="_blank" rel="noopener">${escHtml(s.title)}</a>`
              : `<span>${escHtml(s.title)}</span>`;
            return `<li>${link}${s.source_code ? ` <span class="source-chip">${escHtml(s.source_code)}</span>` : ''}</li>`;
          }).join('')}
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
      <div class="disclaimer-inline" id="costDisclaimer">
        Cost figures are estimates derived from published unit-cost benchmarks (RDNA3, KSE Institute) and named comparable Ukrainian precedents.
        They are not guarantees, not procurement quotes, and not a substitute for transaction-level due diligence.
        All amounts in USD millions.
        <button class="disclaimer-inline-dismiss" onclick="this.closest('#costDisclaimer').remove()" aria-label="Dismiss">Understood</button>
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

const TRANCHE_META = [
  { key: 'grant_pct',           label: 'Grant (Pillar I)',        css: 'grant',           group: 'concessional' },
  { key: 'era_pct',             label: 'ERA / Frozen Assets',     css: 'era',             group: 'concessional' },
  { key: 'first_loss_pct',      label: 'First-loss / Guarantee',  css: 'first-loss',      group: 'concessional' },
  { key: 'concessional_pct',    label: 'Concessional IFI Debt',   css: 'concessional',    group: 'concessional' },
  { key: 'senior_ifi_pct',      label: 'Senior IFI (near-mkt)',   css: 'senior-ifi',      group: 'market' },
  { key: 'dfi_equity_pct',      label: 'DFI Equity / Quasi-eq.',  css: 'dfi-equity',      group: 'market' },
  { key: 'public_equity_pct',   label: 'Public / Municipal Eq.',  css: 'public-equity',   group: 'public' },
  { key: 'diaspora_pct',        label: 'Diaspora / Patriotic Bd', css: 'diaspora',        group: 'market' },
  { key: 'commercial_debt_pct', label: 'Commercial Senior Debt',  css: 'commercial-debt', group: 'market' },
  { key: 'private_equity_pct',  label: 'Private Equity / Infra',  css: 'private-equity',  group: 'market' }
];

const PRI_PROVIDER_LABELS = {
  MIGA_WAR:            'MIGA War & Civil Disturbance',
  UKEF:                'UKEF Export Finance',
  BPIFRANCE_AE:        'BPIFrance Assurance Export',
  ALLIANZ_TRADE:       'Allianz Trade',
  EU_FACILITY_FIRST_LOSS: 'EU Facility First-Loss',
  EBRD_RSF:            'EBRD Resilience & Sustainability Framework',
  ECA:                 'Export Credit Agency'
};

const PATTERN_LABELS = {
  a_b_loan:                    'A/B loan structure (IFI lender-of-record + commercial syndicate)',
  blending_facility:           'Blending facility (EU grant used to write down IFI debt cost)',
  donor_interest_rate_subsidy: 'Donor interest-rate subsidy',
  mezzanine:                   'Mezzanine / quasi-equity instrument',
  ppp_concession:              'PPP concession structure'
};

function renderFinancing(a) {
  const fs = a.financing_structures;
  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const pathLabels = { baseline: 'Baseline', code_compliant: 'Code-compliant', build_back_better: 'Build-back-better' };

  return `
    <section class="asset-section" id="financing">
      <h2>Financing Structures</h2>
      <p class="section-note">Ten-tranche capital stack derived from sector × path templates (RDNA3, EU Facility, EBRD). All tranches sum to 100%.</p>
      <div class="financing-grid">
        ${paths.map(path => {
          const s = fs?.[path];
          if (!s) return '';
          const refs = s.comparable_projects ?? [];
          const pri = s.pri_wrap;
          const patterns = s.structure_patterns ?? [];

          // Full 10-segment bar
          const barSegs = TRANCHE_META
            .filter(m => (s[m.key] ?? 0) > 0)
            .map(m => `<span class="stack-seg ${m.css}" style="width:${s[m.key]}%" title="${m.label}: ${s[m.key]}%">
                          <span class="seg-pct">${s[m.key]}%</span>
                          <span class="seg-label">${m.label.split(' ')[0]}</span>
                        </span>`)
            .join('');

          // Full tranche breakdown table (inside <details>)
          const trancheRows = TRANCHE_META
            .map(m => {
              const v = s[m.key] ?? 0;
              return `<tr class="${v === 0 ? 'tranche-zero' : ''}">
                <td><span class="tranche-dot ${m.css}"></span>${m.label}</td>
                <td class="tranche-pct">${v > 0 ? `<strong>${v}%</strong>` : '—'}</td>
              </tr>`;
            }).join('');

          const priHtml = pri?.applicable ? `
            <p class="tranche-note pri-note">
              <strong>Political risk insurance${pri.required ? ' (required)' : ' (optional)'}:</strong>
              ${(pri.providers ?? []).map(p => PRI_PROVIDER_LABELS[p] || p).join(', ')}
            </p>` : '';

          const patternsHtml = patterns.length > 0 ? `
            <p class="tranche-note structure-note">
              <strong>Structure:</strong>
              ${patterns.map(p => PATTERN_LABELS[p] || p).join('; ')}
            </p>` : '';

          return `
            <div class="financing-card">
              <h3>${pathLabels[path]}</h3>
              <div class="stack-bar" title="Financing stack — hover segments for detail">${barSegs}</div>
              ${s.rationale ? `<p class="financing-rationale">${escHtml(s.rationale)}</p>` : ''}
              <details class="tranche-details">
                <summary>Show full capital stack</summary>
                <div class="tranche-breakdown">
                  <table class="tranche-table">
                    <thead><tr><th>Tranche</th><th>%</th></tr></thead>
                    <tbody>${trancheRows}</tbody>
                  </table>
                  ${priHtml}
                  ${patternsHtml}
                  ${s.template_id ? `<p class="tranche-note template-ref">Template: <code>${s.template_id}</code></p>` : ''}
                </div>
              </details>
              ${refs.length > 0 ? `<p class="comparable-refs">Comparables: ${refs.join(', ')}</p>` : ''}
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderDonorPathway(a) {
  const dp  = a.donor_pathway ?? {};
  const reb = a.wartime_status?.rebuildability ?? '';
  const isPipeline = (reb === 'occupied' || reb === 'frontline_adjacent');

  const { united24_url, mriya_url, vetted_ngos } = dp;

  // Fallback channel URLs for assets without specific project pages
  const u24Link   = united24_url ?? 'https://u24.gov.ua/';
  const mriyaLink = mriya_url ?? 'https://mriya.in.ua/';

  const pipelineNote = isPipeline
    ? `<div class="donor-pipeline-note">
        ⚠ This asset is currently in ${reb === 'occupied' ? 'occupied territory' : 'a frontline-adjacent zone'}.
        Donor channels are documented for pipeline planning but active funding commitments should await improved access conditions.
       </div>`
    : '';

  return `
    <section class="asset-section" id="donor-pathway">
      <h2>Institutional Donor Pathway</h2>
      <p class="section-note">Direct links to verified government and vetted-NGO channels. uVidNova is not a fundraising platform and earns nothing from these links.</p>
      ${pipelineNote}
      <ul class="donor-list">
        <li>
          <a href="${escHtml(u24Link)}" target="_blank" rel="noopener">
            UNITED24 ${united24_url ? 'project page' : 'reconstruction portal'} ↗
          </a>
          ${!united24_url ? '<span class="donor-note">No dedicated project page — links to general reconstruction portal</span>' : ''}
        </li>
        <li>
          <a href="${escHtml(mriyaLink)}" target="_blank" rel="noopener">
            Mriya State Application ${mriya_url ? '' : '— Ukraine reconstruction investment platform'} ↗
          </a>
          ${!mriya_url ? '<span class="donor-note">No dedicated project entry — links to general platform</span>' : ''}
        </li>
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

  const growthData = await loadGrowthSectors().catch(() => null);

  record.innerHTML = [
    renderIdentity(asset),
    renderLocation(asset),
    renderDamage(asset),
    renderWartimeStatus(asset),
    renderPhysicalSpecs(asset),
    renderCostPaths(asset),
    renderFinancing(asset),
    renderDonorPathway(asset),
    growthData ? renderGrowthSectorPanel(asset, growthData) : '',
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
  initLangToggle(document.getElementById('langToggle'));

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
    // Re-render the identity section when the language changes
    document.addEventListener('langChanged', () => {
      const identity = document.getElementById('identity');
      if (identity) identity.outerHTML = renderIdentity(asset);
      document.title = `${getLang() === 'uk' && asset.name?.uk ? asset.name.uk : (asset.name?.en ?? asset.asset_id)} — uVidNova`;
    });
  } catch (err) {
    document.getElementById('loadingState').hidden = true;
    document.getElementById('errorMessage').textContent = `Could not load asset "${id}": ${err.message}`;
    document.getElementById('errorState').hidden = false;
  }
}

init();

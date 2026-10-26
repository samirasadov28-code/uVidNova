#!/usr/bin/env node
/**
 * prerender.js — Build-time static HTML generation for asset pages.
 *
 * Reads every asset JSON from public/data/assets/ and writes a pre-rendered
 * HTML page to public/assets/<asset_id>/index.html (lowercase paths).
 * Also injects the CARTO_BASEMAPS_KEY env var into public/js/carto-config.js.
 *
 * Run: node scripts/prerender.js
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const ASSETS_DIR = join(ROOT, 'public', 'data', 'assets');
const OUT_DIR    = join(ROOT, 'public', 'assets');

const SITE_URL = 'https://uvidnova.netlify.app';

// ── CARTO key injection ────────────────────────────────────────────────────────
const cartoKey = process.env.CARTO_BASEMAPS_KEY;
if (!cartoKey) {
  console.error('FATAL: CARTO_BASEMAPS_KEY environment variable is not set.');
  console.error('Set it in Netlify environment variables before deploying.');
  process.exit(1);
}
const cartoConfigPath = join(ROOT, 'public', 'js', 'carto-config.js');
writeFileSync(
  cartoConfigPath,
  `// Generated at build time — do not commit\nwindow.CARTO_BASEMAPS_KEY = ${JSON.stringify(cartoKey)};\n`,
  'utf8'
);
console.log('Wrote public/js/carto-config.js (CARTO key injected)');

// ── Helpers (mirrors asset-view.js) ──────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-US');
}

function fmtUSD(m) {
  if (m === null || m === undefined) return '—';
  return `USD ${fmt(m)}M`;
}

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

// ── Content renderers ─────────────────────────────────────────────────────────

function renderIdentity(a) {
  const reCount = a.damage?.re_damage_count ?? 0;
  const name = a.name?.en ?? a.asset_id;
  const nameUk = a.name?.uk ?? '';
  return `
    <section class="asset-section" id="identity">
      <h1 class="asset-name">${esc(name)}</h1>
      ${nameUk ? `<p class="asset-name-uk">${esc(nameUk)}</p>` : ''}
      ${reCount >= 2 ? `<div class="redamage-alert">⚠ Re-damaged ${reCount} time(s) — material investor-information field</div>` : ''}
      <div class="asset-badges">
        <span class="badge badge-sector">${esc(SECTOR_LABELS[a.sector] ?? a.sector)}</span>
        <span class="badge badge-type">${esc(a.asset_type)}</span>
        <span class="badge badge-lifecycle">${esc(LIFECYCLE_LABELS[a.wartime_status?.lifecycle] ?? a.wartime_status?.lifecycle)}</span>
        <span class="badge badge-rebuild">${esc(REBUILDABILITY_LABELS[a.wartime_status?.rebuildability] ?? a.wartime_status?.rebuildability)}</span>
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
        <tr><th scope="row">Oblast</th><td>${esc(loc.oblast)}</td></tr>
        ${loc.raion ? `<tr><th scope="row">Raion</th><td>${esc(loc.raion)}</td></tr>` : ''}
        <tr><th scope="row">Settlement</th><td>${esc(loc.settlement)}</td></tr>
        ${loc.address_en ? `<tr><th scope="row">Address</th><td>${esc(loc.address_en)}</td></tr>` : ''}
        <tr><th scope="row">Coordinates</th><td>${loc.lat.toFixed(4)}°N, ${loc.lon.toFixed(4)}°E</td></tr>
      </table>
      <p><a href="${esc(mapsUrl)}" target="_blank" rel="noopener">View on OpenStreetMap ↗</a></p>
    </section>`;
}

function renderDamage(a) {
  const d = a.damage;
  const sources = d.evidence_sources ?? [];
  return `
    <section class="asset-section" id="damage">
      <h2>Damage Record</h2>
      <table class="field-table">
        <tr><th scope="row">Incident date</th><td>${esc(d.incident_date)}</td></tr>
        <tr><th scope="row">Incident type</th><td>${esc(d.incident_type?.replace(/_/g, ' ') ?? '')}</td></tr>
        <tr><th scope="row">Destruction level</th><td>${esc(DESTRUCTION_LABELS[d.destruction_level] ?? d.destruction_level)}</td></tr>
        <tr><th scope="row">Re-damage count</th><td>${esc(d.re_damage_count)}${d.re_damage_count >= 2 ? ' <small>⚠ Material investor-information field</small>' : ''}</td></tr>
        <tr><th scope="row">Verified by</th><td>${esc((d.verified_by ?? []).join(', '))}</td></tr>
      </table>
      ${sources.length > 0 ? `
        <h3>Evidence sources</h3>
        <ul class="source-list">
          ${sources.map(s => {
            const link = s.url
              ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`
              : `<span>${esc(s.title)}</span>`;
            return `<li>${link}${s.source_code ? ` <span class="source-chip">${esc(s.source_code)}</span>` : ''}</li>`;
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
        <tr><th scope="row">Lifecycle stage</th><td>${esc(LIFECYCLE_LABELS[w.lifecycle] ?? w.lifecycle)}</td></tr>
        <tr><th scope="row">Rebuildability</th><td>${esc(REBUILDABILITY_LABELS[w.rebuildability] ?? w.rebuildability)}</td></tr>
        <tr><th scope="row">Sovereign risk band</th><td>${esc(w.sovereign_risk_band)}</td></tr>
        ${deRisking.length > 0 ? `<tr><th scope="row">De-risking instruments</th><td>${esc(deRisking.join('; '))}</td></tr>` : ''}
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
          return `<tr>
            <th scope="row">${esc(label)}</th>
            <td>${fmt(s.value)}${esc(unit)} <span class="source-chip" title="${esc(s.ref ?? s.source ?? '')}">${esc(s.source?.replace(/_/g,' ') ?? '')}</span></td>
          </tr>`;
        }).join('')}
      </table>
    </section>`;
}

function renderCostPaths(a) {
  const cp = a.cost_paths;
  if (!cp) return '';
  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const pathLabels = { baseline: 'Baseline', code_compliant: 'Code-compliant', build_back_better: 'Build-back-better' };
  const pathDescs  = {
    baseline: 'Repair to pre-war condition',
    code_compliant: 'Rebuild to current EU/UA building codes',
    build_back_better: 'Rebuild with technology overlays'
  };
  return `
    <section class="asset-section" id="cost-paths">
      <h2>Reconstruction Cost Estimates</h2>
      <p class="disclaimer-inline">Cost figures are estimates derived from published unit-cost benchmarks (RDNA4, KSE Institute) and named comparable Ukrainian precedents. Not guarantees, not procurement quotes. All amounts in USD millions.</p>
      <div class="cost-path-grid">
        ${paths.map(path => {
          const t = cp[path];
          if (!t) return '';
          const overlays = t.tech_overlays ?? [];
          return `
            <div class="cost-card">
              <h3 class="cost-card-title">${pathLabels[path]}</h3>
              <p class="cost-card-desc">${pathDescs[path]}</p>
              <div class="cost-range">
                <span class="cost-low">${esc(fmtUSD(t.low_usd_m))}</span>
                <span class="cost-sep">–</span>
                <span class="cost-high">${esc(fmtUSD(t.high_usd_m))}</span>
              </div>
              <div class="cost-central">Central: <strong>${esc(fmtUSD(t.central_usd_m))}</strong></div>
              ${overlays.length > 0 ? `<div class="tech-overlays"><span class="overlays-label">Technology overlays:</span> ${overlays.map(o => `<span class="overlay-chip">${esc(o.replace(/_/g,' '))}</span>`).join('')}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderFinancing(a) {
  const fs = a.financing_structures;
  if (!fs) return '';

  const TRANCHE_META = [
    { key: 'grant_pct',                label: 'Grant (Pillar I)'          },
    { key: 'era_pct',                  label: 'ERA / Frozen Assets'        },
    { key: 'first_loss_pct',           label: 'First-loss / Guarantee'     },
    { key: 'concessional_pct',         label: 'Concessional IFI Debt'      },
    { key: 'senior_ifi_pct',           label: 'Senior IFI (near-mkt)'      },
    { key: 'eca_pct',                  label: 'ECA-Covered Debt'           },
    { key: 'dfi_equity_pct',           label: 'DFI Equity / Quasi-eq.'     },
    { key: 'public_equity_pct',        label: 'Public / Municipal Eq.'     },
    { key: 'diaspora_pct',             label: 'Diaspora / Patriotic Bd'    },
    { key: 'commercial_bank_debt_pct', label: 'Commercial Bank Debt'       },
    { key: 'institutional_debt_pct',   label: 'Institutional Debt'         },
    { key: 'private_equity_pct',       label: 'Private Equity / Infra'     }
  ];
  const PRI_LABELS = {
    MIGA_WAR: 'MIGA War & Civil Disturbance', UKEF: 'UK Export Finance',
    BPIFRANCE_AE: 'BPIFrance Assurance Export', EU_FACILITY_FIRST_LOSS: 'EU Facility First-Loss',
    EBRD_RSF: 'EBRD RSF'
  };
  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const pathLabels = { baseline: 'Baseline', code_compliant: 'Code-compliant', build_back_better: 'Build-back-better' };

  return `
    <section class="asset-section" id="financing">
      <h2>Financing Structures</h2>
      <p class="section-note">Twelve-tranche capital stack derived from sector × path templates (RDNA4, EU Facility, EBRD). All tranches sum to 100%.</p>
      <div class="financing-grid">
        ${paths.map(path => {
          const s = fs[path];
          if (!s) return '';
          const barSegs = TRANCHE_META
            .filter(m => (s[m.key] ?? 0) > 0)
            .map(m => `<span class="stack-seg" style="width:${s[m.key]}%;background:var(--tranche-${m.key.replace(/_pct$/,'').replace(/_/g,'-')},#666)" title="${esc(m.label)}: ${s[m.key]}%"><span class="seg-pct">${s[m.key]}%</span></span>`)
            .join('');
          const rows = TRANCHE_META.map(m => {
            const v = s[m.key] ?? 0;
            return `<tr${v===0?' class="tranche-zero"':''}><td>${esc(m.label)}</td><td>${v>0?`<strong>${v}%</strong>`:'—'}</td></tr>`;
          }).join('');
          const pri = s.pri_wrap;
          const priNote = pri?.applicable ? `<p><strong>Political risk insurance${pri.required?' (required)':' (optional)'}:</strong> ${(pri.providers??[]).map(p=>PRI_LABELS[p]||p).join(', ')}</p>` : '';
          return `
            <div class="financing-card">
              <h3>${pathLabels[path]}</h3>
              <div class="stack-bar">${barSegs}</div>
              ${s.rationale ? `<p class="financing-rationale">${esc(s.rationale)}</p>` : ''}
              <details class="tranche-details">
                <summary>Show full capital stack</summary>
                <table class="tranche-table">
                  <thead><tr><th>Tranche</th><th>%</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
                ${priNote}
                ${s.template_id ? `<p><code>${esc(s.template_id)}</code></p>` : ''}
              </details>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderMeta(a) {
  return `
    <section class="asset-section" id="meta">
      <h2>Record Metadata</h2>
      <table class="field-table">
        <tr><th scope="row">Asset ID</th><td>${esc(a.asset_id)}</td></tr>
        <tr><th scope="row">Last reviewed</th><td>${esc(a.last_reviewed)}</td></tr>
        <tr><th scope="row">Schema version</th><td>${esc(a.version)}</td></tr>
        ${a.tags?.length ? `<tr><th scope="row">Tags</th><td>${esc(a.tags.join(', '))}</td></tr>` : ''}
      </table>
      <p><a href="/?asset=${esc(a.asset_id)}">← Back to atlas map</a></p>
    </section>`;
}

// ── Page template ─────────────────────────────────────────────────────────────

function renderPage(a) {
  const name    = a.name?.en ?? a.asset_id;
  const nameUk  = a.name?.uk ?? '';
  const oblast  = a.location?.oblast ?? '';
  const sector  = SECTOR_LABELS[a.sector] ?? a.sector;
  const central = a.cost_paths?.baseline?.central_usd_m;
  const costStr = central ? `USD ${central}M baseline` : 'cost estimate pending';
  const desc    = `${name} — ${sector}, ${oblast}. ${costStr}. Ukraine reconstruction finance data: three cost paths, financing structure, wartime status. uVidNova.`;
  const canonicalUrl = `${SITE_URL}/assets/${a.asset_id.toLowerCase()}/`;

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    name,
    description: desc,
    url: canonicalUrl,
    dateModified: a.last_reviewed,
    publisher: {
      '@type': 'Organization',
      name: 'uVidNova',
      url: SITE_URL
    },
    about: {
      '@type': 'Place',
      name,
      address: { '@type': 'PostalAddress', addressRegion: oblast, addressCountry: 'UA' }
    }
  };

  const content = [
    renderIdentity(a),
    renderLocation(a),
    renderDamage(a),
    renderWartimeStatus(a),
    renderPhysicalSpecs(a),
    renderCostPaths(a),
    renderFinancing(a),
    renderMeta(a)
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(name)} — uVidNova Ukraine Reconstruction Atlas</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="theme-color" content="#0d2248">
  <link rel="canonical" href="${esc(canonicalUrl)}">

  <!-- Open Graph -->
  <meta property="og:type"        content="article">
  <meta property="og:site_name"   content="uVidNova">
  <meta property="og:title"       content="${esc(name)} — uVidNova">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url"         content="${esc(canonicalUrl)}">
  <meta property="og:image"       content="https://uvidnova.netlify.app/assets/logo_512.png">
  <meta name="twitter:card"       content="summary">
  <meta name="twitter:title"      content="${esc(name)} — uVidNova">
  <meta name="twitter:description" content="${esc(desc)}">

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <link rel="manifest"         href="/manifest.webmanifest">
  <link rel="icon"             href="/assets/logo_192.png" sizes="192x192">
  <link rel="apple-touch-icon" href="/assets/logo_192.png">
  <link rel="stylesheet" href="/css/vendor/leaflet.css">
  <link rel="stylesheet" href="/css/app.css">

  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-MSQGC9TYQ5"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-MSQGC9TYQ5');
  </script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(function() {});
    }
  </script>
</head>
<body class="asset-page">

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="wordmark" aria-label="uVidNova home">
        <img src="/assets/logo_192.png" alt="" class="logo-img" width="36" height="36" loading="lazy">
        <span class="wordmark-text"><span class="u">u</span><span class="vid">Vid</span><span class="nova">Nova</span></span>
      </a>
      <p class="tagline">Ukraine Reconstruction Finance Atlas</p>
      <nav class="site-nav">
        <a href="/" class="nav-link">Map</a>
        <a href="/finance.html" class="nav-link">Finance</a>
        <a href="/trust.html" class="nav-link">Trust</a>
        <a href="/about.html" class="nav-link">About</a>
      </nav>
    </div>
  </header>

  <main class="asset-main">
    <article class="asset-record" id="assetRecord">
      ${content}
    </article>
  </main>

  <div class="version-bar" role="status">
    <a href="/" class="version-label">← Atlas map</a>
  </div>

</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = readdirSync(ASSETS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
let count = 0;
let errors = 0;
const sitemapAssets = [];

for (const file of files) {
  const assetId = file.replace('.json', '');
  const assetIdLower = assetId.toLowerCase();
  try {
    const raw  = readFileSync(join(ASSETS_DIR, file), 'utf8');
    const asset = JSON.parse(raw);

    const dir  = join(OUT_DIR, assetIdLower);
    mkdirSync(dir, { recursive: true });

    const html = renderPage(asset);
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    sitemapAssets.push({ slug: assetIdLower, lastmod: asset.last_reviewed || '2026-10-26' });
    count++;
  } catch (err) {
    console.error(`  ERROR: ${assetId}: ${err.message}`);
    errors++;
  }
}

console.log(`Pre-render complete: ${count} pages written, ${errors} errors.`);
console.log(`Output: public/assets/<ASSET_ID>/index.html`);

// ── Sitemap generation ────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const staticPages = [
  { loc: '/',             lastmod: today,        changefreq: 'weekly',  priority: '1.0' },
  { loc: '/about.html',   lastmod: today,        changefreq: 'weekly',  priority: '0.8' },
  { loc: '/trust.html',   lastmod: today,        changefreq: 'weekly',  priority: '0.7' },
  { loc: '/finance.html', lastmod: today,        changefreq: 'weekly',  priority: '0.7' },
  { loc: '/privacy',      lastmod: '2026-06-02', changefreq: 'yearly',  priority: '0.3' },
];

const urlEntries = [
  ...staticPages.map(p =>
    `  <url><loc>${SITE_URL}${p.loc}</loc><lastmod>${p.lastmod}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
  ),
  ...sitemapAssets.map(a =>
    `  <url><loc>${SITE_URL}/assets/${a.slug}/</loc><lastmod>${a.lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
  ),
].join('\n');

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
const sitemapPath = join(ROOT, 'public', 'sitemap.xml');
writeFileSync(sitemapPath, sitemapXml, 'utf8');
console.log(`Sitemap written: ${sitemapPath} (${staticPages.length} static + ${sitemapAssets.length} asset pages)`);

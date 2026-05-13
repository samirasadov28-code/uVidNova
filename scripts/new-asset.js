#!/usr/bin/env node
/**
 * Scaffolds a new asset JSON file from the canonical template.
 * Usage: node scripts/new-asset.js <ASSET_ID>
 *
 * The asset_id must follow the format: LOCATION_OR_NAME_YYYY_MM_DD
 * Example: node scripts/new-asset.js KHARKIV_REGIONAL_HOSPITAL_2022_03_01
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const assetId = process.argv[2];

if (!assetId) {
  console.error('Usage: node scripts/new-asset.js <ASSET_ID>');
  console.error('Example: node scripts/new-asset.js KHARKIV_HOSPITAL_2022_03_01');
  process.exit(1);
}

if (!/^[A-Z][A-Z0-9_]*$/.test(assetId)) {
  console.error(`ERROR: asset_id must be uppercase alphanumeric + underscores. Got: "${assetId}"`);
  process.exit(1);
}

const outPath = join(root, 'data', 'assets', `${assetId}.json`);
if (existsSync(outPath)) {
  console.error(`ERROR: ${outPath} already exists. Will not overwrite.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const template = {
  asset_id: assetId,
  name: {
    en: "FILL: English name",
    uk: "FILL: Ukrainian name (Українська назва)"
  },
  location: {
    lat: 0.0,
    lon: 0.0,
    oblast: "FILL: Oblast name",
    raion: null,
    settlement: "FILL: City or village",
    address_en: "FILL: Street address or null"
  },
  asset_type: "FILL: e.g. healthcare.tertiary_hospital",
  sector: "FILL: one of energy_and_power | healthcare | education | residential | heritage_and_culture | transport_and_ports | water_and_sanitation | industrial_and_agricultural | public_administration",
  damage: {
    incident_date: "YYYY-MM-DD",
    incident_type: "FILL: missile_strike | aerial_bomb | artillery_shelling | drone_strike | ground_combat | sabotage | deliberate_demolition | fire | multiple | unknown",
    destruction_level: "FILL: light | moderate | severe | destroyed",
    re_damage_count: 0,
    verified_by: ["FILL: at least one of KSE | UN_OCHA | BELLINGCAT | CIR | ACLED | eRECOVERY | UA_GOV"],
    evidence_sources: [
      {
        title: "FILL: Source title",
        url: "https://FILL"
      }
    ]
  },
  wartime_status: {
    lifecycle: "documented",
    rebuildability: "FILL: rebuildable | frontline_adjacent | occupied | recently_liberated",
    de_risking: ["NONE"],
    sovereign_risk_band: "elevated"
  },
  physical_specs: {
    "FILL_primary_metric": {
      value: 0,
      unit: "FILL: m2 | beds | MW | km | units | etc.",
      source: "pending_data",
      ref: "FILL: source citation or URL"
    }
  },
  cost_paths: {
    pending_methodology: true,
    baseline: {
      low_usd_m: 0,
      central_usd_m: 0,
      high_usd_m: 0
    },
    code_compliant: {
      low_usd_m: 0,
      central_usd_m: 0,
      high_usd_m: 0
    },
    build_back_better: {
      low_usd_m: 0,
      central_usd_m: 0,
      high_usd_m: 0,
      tech_overlays: []
    }
  },
  financing_structures: {
    baseline: {
      grant_pct: 40,
      concessional_pct: 40,
      public_equity_pct: 20,
      private_pct: 0,
      comparable_projects: []
    },
    code_compliant: {
      grant_pct: 45,
      concessional_pct: 35,
      public_equity_pct: 20,
      private_pct: 0,
      comparable_projects: []
    },
    build_back_better: {
      grant_pct: 55,
      concessional_pct: 25,
      public_equity_pct: 20,
      private_pct: 0,
      rationale: "FILL: why this stack for this asset and path",
      comparable_projects: []
    }
  },
  donor_pathway: {
    united24_url: null,
    mriya_url: null,
    vetted_ngos: []
  },
  tags: ["FILL"],
  last_reviewed: today,
  version: "1.0.0"
};

writeFileSync(outPath, JSON.stringify(template, null, 2) + '\n', 'utf8');
console.log(`Created: ${outPath}`);
console.log('');
console.log('Next steps:');
console.log('  1. Fill all "FILL:" placeholders with real sourced data.');
console.log('  2. Set coordinates (lat/lon to 4 decimal places).');
console.log('  3. Update physical_specs with real values + source citations.');
console.log('  4. Remove pending_methodology: true once cost_paths are computed.');
console.log('  5. Run: npm run validate');
console.log('');
console.log('Disclaimer reminder: every figure must trace to a named source (RDNA3, KSE, OCHA, etc.).');

// Update the assets index
updateAssetsIndex();

function updateAssetsIndex() {
  const indexPath = join(root, 'data', 'assets', 'index.json');
  let index = { assets: [] };
  if (existsSync(indexPath)) {
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf8'));
    } catch (_) {}
  }
  if (!index.assets.includes(assetId)) {
    index.assets.push(assetId);
    index.assets.sort();
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
    console.log(`Updated: data/assets/index.json`);
  }
}

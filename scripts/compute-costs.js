#!/usr/bin/env node
/**
 * Regenerates cost_paths for all assets in data/assets/ using the deterministic formula:
 *
 *   cost = unit_cost × heritage_premium × physical_quantity
 *          × destruction_factor × regional_multiplier × path_multiplier × contingency
 *
 * heritage_premium = 1 for non-heritage assets.
 * All multiplier ranges produce {low, central, high}: low walks the low end of each range,
 * high walks the high end, central = midpoint.
 *
 * Run after updating any lookup table. Always review diffs before committing.
 * Usage: node scripts/compute-costs.js [--dry-run] [--asset=ASSET_ID]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const targetAsset = process.argv.find(a => a.startsWith('--asset='))?.split('=')[1];

// ── Load lookup tables ────────────────────────────────────────────────────────
function loadJson(relPath) {
  const p = join(root, relPath);
  if (!existsSync(p)) {
    console.error(`FATAL: ${relPath} not found.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const unitCostTable     = loadJson('public/data/unit_cost_table.json');
const regionalMultipliers = loadJson('public/data/regional_multipliers.json');
const pathMultipliers   = loadJson('public/data/path_multipliers.json');
const destructionFactors = loadJson('public/data/destruction_factors.json');

// ── Index unit costs by asset_type ────────────────────────────────────────────
const unitCostIndex = {};
for (const row of unitCostTable) {
  unitCostIndex[row.asset_type] = row;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPhysicalQty(asset, unitCostEntry) {
  const specs = asset.physical_specs ?? {};
  const primaryField = unitCostEntry.primary_spec_field;

  // Try the declared primary field first
  if (primaryField && specs[primaryField]?.value > 0) {
    return specs[primaryField].value;
  }

  // Fallback: first spec with a usable numeric value
  for (const s of Object.values(specs)) {
    if (typeof s?.value === 'number' && s.value > 0 && s.source !== 'pending_data') {
      return s.value;
    }
  }
  return null;
}

function getMultiplier(table, key) {
  return table[key] ?? table['default'] ?? null;
}

// ── Cost formula ──────────────────────────────────────────────────────────────
/**
 * Returns {low_usd_m, central_usd_m, high_usd_m} rounded to whole millions.
 * Low walks the low end of every range; high walks the high end.
 */
function computeTriple(uc, qty, destructionLevel, oblast, path, contingency) {
  const df = destructionFactors[destructionLevel];
  const rm = getMultiplier(regionalMultipliers, oblast);
  const pm = pathMultipliers[path];

  if (!df || !rm || !pm) {
    return null;
  }

  const hpLow  = uc.heritage_premium_multiplier_low  ?? 1;
  const hpHigh = uc.heritage_premium_multiplier_high ?? 1;

  const low = (uc.usd_per_unit_low  * qty * hpLow  * df.low  * rm.low  * pm.low  * contingency) / 1_000_000;
  const high = (uc.usd_per_unit_high * qty * hpHigh * df.high * rm.high * pm.high * contingency) / 1_000_000;
  const central = (low + high) / 2;

  return {
    low_usd_m:     Math.round(low),
    central_usd_m: Math.round(central),
    high_usd_m:    Math.round(high)
  };
}

// ── Process each asset ────────────────────────────────────────────────────────
const assetsDir = join(root, 'public', 'data', 'assets');
let files = readdirSync(assetsDir)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .sort();

if (targetAsset) {
  files = files.filter(f => f === `${targetAsset}.json`);
  if (files.length === 0) {
    console.error(`Asset not found: ${targetAsset}`);
    process.exit(1);
  }
}

let updated = 0;
let skipped = 0;
let errors = 0;

for (const file of files) {
  const filePath = join(assetsDir, file);
  const asset = JSON.parse(readFileSync(filePath, 'utf8'));

  const uc = unitCostIndex[asset.asset_type];
  if (!uc) {
    console.warn(`SKIP ${file}: no unit_cost entry for asset_type "${asset.asset_type}"`);
    skipped++;
    continue;
  }

  const qty = getPhysicalQty(asset, uc);
  if (!qty || qty <= 0) {
    console.warn(`SKIP ${file}: no usable physical_spec value for primary field "${uc.primary_spec_field}"`);
    skipped++;
    continue;
  }

  const oblast = asset.location?.oblast;
  const destructionLevel = asset.damage?.destruction_level;
  const lifecycle = asset.wartime_status?.lifecycle;

  // Contingency: 1.15 for assessed/in_pipeline/funded/etc; 1.25 for documented-only
  const contingency = (lifecycle === 'documented') ? 1.25 : 1.15;

  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const newCostPaths = {};
  let anyNull = false;

  for (const path of paths) {
    const triple = computeTriple(uc, qty, destructionLevel, oblast, path, contingency);
    if (!triple) {
      console.warn(`SKIP ${file}: could not compute ${path} (missing multiplier for level="${destructionLevel}" oblast="${oblast}")`);
      anyNull = true;
      break;
    }

    newCostPaths[path] = triple;

    // Preserve any existing tech_overlays on build_back_better
    if (path === 'build_back_better') {
      const existingOverlays = asset.cost_paths?.build_back_better?.tech_overlays ?? [];
      if (existingOverlays.length > 0) {
        newCostPaths[path].tech_overlays = existingOverlays;
      }
    }
  }

  if (anyNull) {
    errors++;
    continue;
  }

  const updatedAsset = { ...asset, cost_paths: newCostPaths };

  if (dryRun) {
    console.log(`DRY-RUN ${file}`);
    console.log(`  Qty: ${qty} ${uc.physical_unit} | Destruction: ${destructionLevel} | Oblast: ${oblast} | Contingency: ${contingency}`);
    console.log(`  baseline:          $${newCostPaths.baseline.low_usd_m}–$${newCostPaths.baseline.high_usd_m}M (central $${newCostPaths.baseline.central_usd_m}M)`);
    console.log(`  code_compliant:    $${newCostPaths.code_compliant.low_usd_m}–$${newCostPaths.code_compliant.high_usd_m}M (central $${newCostPaths.code_compliant.central_usd_m}M)`);
    console.log(`  build_back_better: $${newCostPaths.build_back_better.low_usd_m}–$${newCostPaths.build_back_better.high_usd_m}M (central $${newCostPaths.build_back_better.central_usd_m}M)`);
  } else {
    writeFileSync(filePath, JSON.stringify(updatedAsset, null, 2) + '\n', 'utf8');
    console.log(`UPDATED ${file}: baseline $${newCostPaths.baseline.low_usd_m}–$${newCostPaths.baseline.high_usd_m}M (central $${newCostPaths.baseline.central_usd_m}M)`);
  }
  updated++;
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${errors} error(s).`);
if (dryRun) console.log('Dry-run mode — no files written.');
if (errors > 0) process.exit(1);

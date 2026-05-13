#!/usr/bin/env node
/**
 * Regenerates cost_paths for all assets in data/assets/ using the deterministic formula:
 *
 *   cost = unit_cost × physical_quantity × destruction_factor × regional_multiplier × path_multiplier × contingency
 *
 * This is a dev tool. Run after updating unit_cost_table.json or multiplier tables.
 * Outputs updated JSON files in-place. Always review diffs before committing.
 *
 * Usage: node scripts/compute-costs.js [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

// ── Load lookup tables ────────────────────────────────────────────────────────
function loadJson(relPath) {
  const p = join(root, relPath);
  if (!existsSync(p)) {
    console.warn(`WARN: ${relPath} not found — skipping.`);
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const unitCostTable = loadJson('data/unit_cost_table.json');
const regionalMultipliers = loadJson('data/regional_multipliers.json');
const pathMultipliers = loadJson('data/path_multipliers.json');
const destructionFactors = loadJson('data/destruction_factors.json');

if (!unitCostTable || !regionalMultipliers || !pathMultipliers || !destructionFactors) {
  console.error('ERROR: One or more lookup tables missing. Run after Weekend 2 data population.');
  process.exit(1);
}

// ── Index unit costs by asset_type ────────────────────────────────────────────
const unitCostIndex = {};
for (const row of unitCostTable) {
  unitCostIndex[row.asset_type] = row;
}

// ── Cost formula ──────────────────────────────────────────────────────────────
function computeTriple(unitCost, physicalQty, destructionLevel, oblast, path) {
  const df = destructionFactors[destructionLevel];
  const rm = regionalMultipliers[oblast] ?? regionalMultipliers['default'];
  const pm = pathMultipliers[path];

  if (!df || !rm || !pm) {
    return null;
  }

  const contingency = path === 'baseline' ? 1.15 : 1.25;

  const low = (unitCost.usd_per_unit_low * physicalQty * df.low * rm.low * pm.low * contingency) / 1_000_000;
  const high = (unitCost.usd_per_unit_high * physicalQty * df.high * rm.high * pm.high * contingency) / 1_000_000;
  const central = (low + high) / 2;

  return {
    low_usd_m: Math.round(low),
    central_usd_m: Math.round(central),
    high_usd_m: Math.round(high)
  };
}

// ── Process each asset ────────────────────────────────────────────────────────
const assetsDir = join(root, 'data', 'assets');
const files = readdirSync(assetsDir)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .sort();

let updated = 0;
let skipped = 0;

for (const file of files) {
  const filePath = join(assetsDir, file);
  const asset = JSON.parse(readFileSync(filePath, 'utf8'));

  const uc = unitCostIndex[asset.asset_type];
  if (!uc) {
    console.warn(`SKIP ${file}: no unit_cost entry for asset_type "${asset.asset_type}"`);
    skipped++;
    continue;
  }

  // Determine primary physical quantity
  const specValues = Object.values(asset.physical_specs ?? {});
  if (specValues.length === 0) {
    console.warn(`SKIP ${file}: no physical_specs`);
    skipped++;
    continue;
  }

  const primarySpec = specValues.find(s => s.source !== 'pending_data' && s.value > 0)
    ?? specValues[0];

  if (!primarySpec || primarySpec.value <= 0) {
    console.warn(`SKIP ${file}: primary physical_spec has no usable value`);
    skipped++;
    continue;
  }

  const qty = primarySpec.value;
  const oblast = asset.location?.oblast;
  const destructionLevel = asset.damage?.destruction_level;

  const paths = ['baseline', 'code_compliant', 'build_back_better'];
  const newCostPaths = {};
  let anyNull = false;

  for (const path of paths) {
    const triple = computeTriple(uc, qty, destructionLevel, oblast, path);
    if (!triple) { anyNull = true; break; }
    newCostPaths[path] = triple;
    if (path === 'build_back_better') {
      newCostPaths[path].tech_overlays = asset.cost_paths?.build_back_better?.tech_overlays ?? [];
    }
  }

  if (anyNull) {
    console.warn(`SKIP ${file}: could not compute costs (missing multiplier data)`);
    skipped++;
    continue;
  }

  const updatedAsset = {
    ...asset,
    cost_paths: newCostPaths
  };
  delete updatedAsset.cost_paths.pending_methodology;

  if (dryRun) {
    console.log(`DRY-RUN ${file}: baseline central = $${newCostPaths.baseline.central_usd_m}M`);
  } else {
    writeFileSync(filePath, JSON.stringify(updatedAsset, null, 2) + '\n', 'utf8');
    console.log(`UPDATED ${file}: baseline $${newCostPaths.baseline.low_usd_m}–$${newCostPaths.baseline.high_usd_m}M`);
  }
  updated++;
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped.`);
if (dryRun) console.log('Dry-run mode: no files written.');

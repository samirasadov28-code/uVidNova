#!/usr/bin/env node
/**
 * Regenerates public/data/assets/index.json from every asset in data/assets/.
 * Extracts all fields needed by the map view so the app can run from index only,
 * eliminating 100 individual asset fetches on first load.
 *
 * Usage: node scripts/rebuild-index.js
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const assetDir = join(root, 'data', 'assets');
const outPath  = join(root, 'public', 'data', 'assets', 'index.json');

function getFinancingClass(fs) {
  if (!fs) return 'blended';
  if ((fs.private_equity_pct ?? 0) + (fs.dfi_equity_pct ?? 0) >= 30) return 'private_anchored';
  if ((fs.grant_pct ?? 0) >= 50) return 'grant_led';
  if ((fs.concessional_pct ?? 0) >= (fs.grant_pct ?? 0)) return 'concessional_led';
  return 'blended';
}

const files = readdirSync(assetDir).filter(f => f.endsWith('.json') && f !== 'index.json');

const assets = files
  .map(f => {
    const raw = JSON.parse(readFileSync(join(assetDir, f), 'utf8'));
    const cp = raw.cost_paths ?? {};
    return {
      asset_id:            raw.asset_id,
      name_en:             raw.name?.en ?? '',
      name_uk:             raw.name?.uk ?? '',
      lat:                 raw.location?.lat ?? null,
      lon:                 raw.location?.lon ?? null,
      oblast:              raw.location?.oblast ?? '',
      sector:              raw.sector ?? '',
      lifecycle:           raw.wartime_status?.lifecycle ?? '',
      destruction_level:   raw.damage?.destruction_level ?? '',
      rebuildability:      raw.wartime_status?.rebuildability ?? '',
      re_damage_count:     raw.damage?.re_damage_count ?? 0,
      pending_methodology: cp.pending_methodology ?? false,
      financing_class:     getFinancingClass(raw.financing_structures?.baseline),
      // All three cost paths — low/central/high per path
      cost_baseline_low:   cp.baseline?.low_usd_m ?? null,
      cost_baseline_cen:   cp.baseline?.central_usd_m ?? null,
      cost_baseline_high:  cp.baseline?.high_usd_m ?? null,
      cost_cc_low:         cp.code_compliant?.low_usd_m ?? null,
      cost_cc_cen:         cp.code_compliant?.central_usd_m ?? null,
      cost_cc_high:        cp.code_compliant?.high_usd_m ?? null,
      cost_bbb_low:        cp.build_back_better?.low_usd_m ?? null,
      cost_bbb_cen:        cp.build_back_better?.central_usd_m ?? null,
      cost_bbb_high:       cp.build_back_better?.high_usd_m ?? null,
    };
  })
  .sort((a, b) => a.asset_id.localeCompare(b.asset_id));

const out = { assets };
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Rebuilt index: ${assets.length} assets → ${outPath}`);

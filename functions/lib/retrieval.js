/**
 * retrieval.js — deterministic lookups for the AI orchestrator.
 *
 * All numeric outputs (costs, multipliers, financing percentages) come from
 * these deterministic lookups. The LLM never sees a prompt asking it to
 * compute or estimate a number.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', 'public');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

let _unitCosts = null;
let _regionalMultipliers = null;
let _pathMultipliers = null;
let _destructionFactors = null;
let _financingTemplates = null;
let _precedents = null;
let _techOverlays = null;

function unitCosts() { return _unitCosts ??= loadJSON('data/unit_cost_table.json'); }
function regionalMultipliers() { return _regionalMultipliers ??= loadJSON('data/regional_multipliers.json'); }
function pathMultipliers() { return _pathMultipliers ??= loadJSON('data/path_multipliers.json'); }
function destructionFactors() { return _destructionFactors ??= loadJSON('data/destruction_factors.json'); }
function financingTemplates() { return _financingTemplates ??= loadJSON('data/financing_templates.json'); }
function precedents() { return _precedents ??= loadJSON('data/precedents.json'); }
function techOverlays() { return _techOverlays ??= loadJSON('data/tech_overlays.json'); }

export function getUnitCost(assetType) {
  return unitCosts().find(r => r.asset_type === assetType) ?? null;
}

export function getRegionalMultiplier(oblast) {
  const rm = regionalMultipliers();
  return rm[oblast] ?? rm['default'] ?? { low: 1, high: 1 };
}

export function getPathMultiplier(path) {
  return pathMultipliers()[path] ?? { low: 1, high: 1 };
}

export function getDestructionFactor(level) {
  return destructionFactors()[level] ?? { low: 1, high: 1 };
}

export function computeCostTriple(unitCost, quantity, destructionLevel, oblast, path, contingency = 1.15) {
  const df = getDestructionFactor(destructionLevel);
  const rm = getRegionalMultiplier(oblast);
  const pm = getPathMultiplier(path);
  const uc = unitCost;

  // Heritage premium drawn from unit cost table (default 1× for non-heritage assets)
  const hpLow  = uc.heritage_premium_multiplier_low  ?? 1;
  const hpHigh = uc.heritage_premium_multiplier_high ?? 1;

  const low  = (uc.usd_per_unit_low  * quantity * hpLow  * df.low  * rm.low  * pm.low  * contingency) / 1_000_000;
  const high = (uc.usd_per_unit_high * quantity * hpHigh * df.high * rm.high * pm.high * contingency) / 1_000_000;
  const central = (low + high) / 2;

  return {
    low_usd_m:     Math.round(low),
    central_usd_m: Math.round(central),
    high_usd_m:    Math.round(high),
  };
}

export function getFinancingTemplate(sector, path) {
  return financingTemplates().find(t => t.sector === sector && t.path === path) ?? null;
}

export function getTopPrecedents(sector, path, n = 3) {
  return precedents()
    .filter(p => p.sector === sector && (!p.reconstruction_path || p.reconstruction_path === path))
    .slice(0, n);
}

export function getTechOverlays(overlayIds) {
  if (!overlayIds || overlayIds.length === 0) return [];
  const all = techOverlays();
  return overlayIds
    .map(id => all.find(o => o.overlay_id === id))
    .filter(Boolean);
}

/**
 * Build the formula_inputs block that Stage 2 narrate receives.
 * Surfaces every multiplier used in the cost computation so the
 * validation gate can trace narrative numbers back to the payload.
 */
export function buildFormulaInputs(unitCost, quantity, destructionLevel, oblast) {
  const df = getDestructionFactor(destructionLevel);
  const rm = getRegionalMultiplier(oblast);
  const pmBaseline = getPathMultiplier('baseline');
  const pmCC       = getPathMultiplier('code_compliant');
  const pmBBB      = getPathMultiplier('build_back_better');

  return {
    unit_cost_usd_low:           unitCost.usd_per_unit_low,
    unit_cost_usd_high:          unitCost.usd_per_unit_high,
    physical_unit:               unitCost.physical_unit,
    physical_quantity:           quantity,
    heritage_premium_low:        unitCost.heritage_premium_multiplier_low  ?? 1,
    heritage_premium_high:       unitCost.heritage_premium_multiplier_high ?? 1,
    destruction_factor_low:      df.low,
    destruction_factor_high:     df.high,
    regional_multiplier_low:     rm.low,
    regional_multiplier_high:    rm.high,
    path_multiplier_baseline_low:    pmBaseline.low,
    path_multiplier_baseline_high:   pmBaseline.high,
    path_multiplier_cc_low:          pmCC.low,
    path_multiplier_cc_high:         pmCC.high,
    path_multiplier_bbb_low:         pmBBB.low,
    path_multiplier_bbb_high:        pmBBB.high,
  };
}

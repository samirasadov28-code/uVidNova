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
const root = join(__dirname, '..', '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'));
}

let _unitCosts = null;
let _regionalMultipliers = null;
let _pathMultipliers = null;
let _destructionFactors = null;
let _financingTemplates = null;
let _precedents = null;

function unitCosts() { return _unitCosts ??= loadJSON('data/unit_cost_table.json'); }
function regionalMultipliers() { return _regionalMultipliers ??= loadJSON('data/regional_multipliers.json'); }
function pathMultipliers() { return _pathMultipliers ??= loadJSON('data/path_multipliers.json'); }
function destructionFactors() { return _destructionFactors ??= loadJSON('data/destruction_factors.json'); }
function financingTemplates() { return _financingTemplates ??= loadJSON('data/financing_templates.json'); }
function precedents() { return _precedents ??= loadJSON('data/precedents.json'); }

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

  const low = (uc.usd_per_unit_low * quantity * df.low * rm.low * pm.low * contingency) / 1_000_000;
  const high = (uc.usd_per_unit_high * quantity * df.high * rm.high * pm.high * contingency) / 1_000_000;
  const central = (low + high) / 2;

  return {
    low_usd_m: Math.round(low),
    central_usd_m: Math.round(central),
    high_usd_m: Math.round(high)
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

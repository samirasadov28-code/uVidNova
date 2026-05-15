/**
 * retrieval.js — deterministic lookups for the AI orchestrator.
 *
 * All numeric outputs (costs, multipliers, financing percentages) come from
 * these deterministic lookups. The LLM never sees a prompt asking it to
 * compute or estimate a number.
 *
 * Exports two surfaces:
 *  - Low-level helpers used by narrate.js (getUnitCost, computeCostTriple, …)
 *  - High-level API used by classify.js (loadStaticData, computeCostPaths, …)
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

// ── High-level API surface for classify.js ────────────────────────────────────

// Cached taxonomy (not needed by the low-level narrate.js path so loaded lazily here)
let _taxonomy = null;
function taxonomy() { return _taxonomy ??= loadJSON('data/taxonomy.json'); }

/**
 * Load all static data files and return them as a plain object.
 * Results are module-level cached — safe to call at cold-start.
 *
 * @returns {{ unitCostTable, regionalMultipliers, pathMultipliers,
 *             destructionFactors, financingTemplates, precedents,
 *             taxonomy, techOverlays }}
 */
export async function loadStaticData() {
  return {
    unitCostTable:       unitCosts(),
    regionalMultipliers: regionalMultipliers(),
    pathMultipliers:     pathMultipliers(),
    destructionFactors:  destructionFactors(),
    financingTemplates:  financingTemplates(),
    precedents:          precedents(),
    taxonomy:            taxonomy(),
    techOverlays:        techOverlays(),
  };
}

/**
 * Derive the primary physical quantity for an asset_type from physical_specs.
 * Reads `primary_spec_field` from the unit-cost entry, then falls back to any
 * non-pending_data numeric spec.
 *
 * @returns {number|null}
 */
function resolvePhysicalQty(assetType, physicalSpecs, staticData) {
  const uc = staticData.unitCostTable.find(r => r.asset_type === assetType);
  if (!uc || !physicalSpecs) return null;
  const specs = physicalSpecs;
  // Try the designated primary spec field first
  const primary = uc.primary_spec_field;
  if (primary && specs[primary]?.value > 0) return specs[primary].value;
  // Fall back to any usable numeric spec
  for (const s of Object.values(specs)) {
    if (typeof s?.value === 'number' && s.value > 0 && s.source !== 'pending_data') {
      return s.value;
    }
  }
  return null;
}

/**
 * Compute cost paths (baseline, code_compliant, build_back_better) for a
 * classified asset. Uses the same formula as computeCostTriple.
 *
 * Per CLAUDE.md §6 and §7.1: always use contingency 1.25 for first-pass AI
 * classification (documented-only tier).
 *
 * @returns {{ baseline, code_compliant, build_back_better }}
 *   Each path: { low_usd_m, central_usd_m, high_usd_m, formula_inputs }
 *   If the unit-cost entry is missing or physical quantity cannot be resolved,
 *   central_usd_m is null and a warning field is set.
 */
export function computeCostPaths(assetType, physicalSpecs, destructionLevel, oblast, staticData) {
  const uc = staticData.unitCostTable.find(r => r.asset_type === assetType);
  if (!uc) {
    const msg = `No unit-cost entry for asset_type "${assetType}".`;
    return {
      baseline:          { low_usd_m: null, central_usd_m: null, high_usd_m: null, warning: msg },
      code_compliant:    { low_usd_m: null, central_usd_m: null, high_usd_m: null, warning: msg },
      build_back_better: { low_usd_m: null, central_usd_m: null, high_usd_m: null, warning: msg },
    };
  }

  const qty = resolvePhysicalQty(assetType, physicalSpecs, staticData);
  const contingency = 1.25; // documented-only tier for first-pass classification

  const formulaInputs = buildFormulaInputs(uc, qty, destructionLevel, oblast);
  formulaInputs.contingency = contingency;

  const computePath = (path) => {
    if (qty === null) {
      return {
        low_usd_m: null,
        central_usd_m: null,
        high_usd_m: null,
        warning: `Physical quantity not available — cannot compute central estimate for path "${path}".`,
        formula_inputs: formulaInputs,
      };
    }
    const triple = computeCostTriple(uc, qty, destructionLevel, oblast, path, contingency);
    return { ...triple, formula_inputs: formulaInputs };
  };

  return {
    baseline:          computePath('baseline'),
    code_compliant:    computePath('code_compliant'),
    build_back_better: computePath('build_back_better'),
  };
}

/**
 * Look up the financing template for a sector/path combination.
 *
 * @returns {object|null}
 */
export function lookupFinancingTemplate(sector, path, staticData) {
  return staticData.financingTemplates.find(t => {
    // Templates may use sector_group or sector; support both patterns
    const templateSector = t.sector_group ?? t.sector ?? '';
    return templateSector === sector && t.path === path;
  }) ?? null;
}

/**
 * Find top-N comparable precedents for a given sector and financing path.
 *
 * @returns {object[]} — up to N precedent objects
 */
export function findComparablePrecedents(sector, path, staticData, n = 3) {
  return staticData.precedents
    .filter(p =>
      p.sector === sector &&
      (!p.reconstruction_path || p.reconstruction_path === path)
    )
    .slice(0, n);
}

/**
 * Validate that an asset_type string exists in the taxonomy.
 *
 * @returns {{ valid: boolean, suggestion: string|null }}
 */
export function validateAssetType(assetType, staticData) {
  const tax = staticData.taxonomy;
  for (const sector of Object.values(tax.sectors ?? {})) {
    if (assetType in (sector.subtypes ?? {})) {
      return { valid: true, suggestion: null };
    }
  }

  // Try to find the closest match by prefix (e.g. "healthcare" → first healthcare.* type)
  const prefix = assetType?.split('.')?.[0];
  let suggestion = null;
  if (prefix) {
    outer: for (const sector of Object.values(tax.sectors ?? {})) {
      for (const key of Object.keys(sector.subtypes ?? {})) {
        if (key.startsWith(prefix + '.')) {
          suggestion = key;
          break outer;
        }
      }
    }
  }

  return { valid: false, suggestion };
}

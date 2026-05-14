#!/usr/bin/env node
/**
 * Validates every file in data/assets/ against schemas/asset.schema.json.
 * Also enforces the financing-stack sum = 100 constraint (not expressible in JSON Schema).
 * Exits non-zero on any failure — used by CI (GitHub Actions) and pre-push checks.
 */

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Setup AJV with Draft 2020-12 ──────────────────────────────────────────────
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemaPath = join(root, 'schemas', 'asset.schema.json');
if (!existsSync(schemaPath)) {
  console.error('ERROR: schemas/asset.schema.json not found.');
  process.exit(1);
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

// ── Helpers ───────────────────────────────────────────────────────────────────
function checkFinancingSum(record, path, filePath) {
  const stack = record.financing_structures?.[path];
  if (!stack) return [];
  const sum = (stack.grant_pct ?? 0) + (stack.concessional_pct ?? 0) +
              (stack.public_equity_pct ?? 0) + (stack.private_pct ?? 0);
  if (sum !== 100) {
    return [`financing_structures.${path}: percentages sum to ${sum}, must equal 100`];
  }
  return [];
}

function checkAssetTypeInTaxonomy(record, taxonomy) {
  const at = record.asset_type;
  if (!at) return [];
  const [sectorKey, subtypeKey] = at.split('.');
  const sector = Object.values(taxonomy.sectors).find(s =>
    s.subtypes && s.subtypes[at]
  );
  if (!sector) {
    return [`asset_type "${at}" not found in data/taxonomy.json`];
  }
  return [];
}

// ── Load taxonomy ─────────────────────────────────────────────────────────────
const taxonomyPath = join(root, 'public', 'data', 'taxonomy.json');
let taxonomy = null;
if (existsSync(taxonomyPath)) {
  taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf8'));
}

// ── Scan assets directory ─────────────────────────────────────────────────────
const assetsDir = join(root, 'public', 'data', 'assets');
if (!existsSync(assetsDir)) {
  console.error('ERROR: data/assets/ directory not found.');
  process.exit(1);
}

const files = readdirSync(assetsDir)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .sort();

if (files.length === 0) {
  console.log('No asset files found in data/assets/. Nothing to validate.');
  process.exit(0);
}

// ── Validate ──────────────────────────────────────────────────────────────────
let errorCount = 0;

for (const file of files) {
  const filePath = join(assetsDir, file);
  let record;

  try {
    record = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`FAIL ${file}: JSON parse error — ${e.message}`);
    errorCount++;
    continue;
  }

  const schemaValid = validate(record);
  const customErrors = [];

  // Financing-stack sum constraint
  for (const path of ['baseline', 'code_compliant', 'build_back_better']) {
    customErrors.push(...checkFinancingSum(record, path, filePath));
  }

  // Taxonomy check
  if (taxonomy) {
    customErrors.push(...checkAssetTypeInTaxonomy(record, taxonomy));
  }

  if (!schemaValid || customErrors.length > 0) {
    console.error(`\nFAIL ${file}`);
    if (!schemaValid) {
      for (const err of validate.errors) {
        const loc = err.instancePath || '(root)';
        console.error(`  [schema] ${loc}: ${err.message}`);
        if (err.params && Object.keys(err.params).length) {
          console.error(`          ${JSON.stringify(err.params)}`);
        }
      }
    }
    for (const msg of customErrors) {
      console.error(`  [custom] ${msg}`);
    }
    errorCount++;
  } else {
    console.log(`OK   ${file}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (errorCount > 0) {
  console.error(`Validation FAILED: ${errorCount} of ${files.length} file(s) have errors.`);
  process.exit(1);
} else {
  console.log(`Validation PASSED: all ${files.length} asset(s) are schema-valid.`);
}

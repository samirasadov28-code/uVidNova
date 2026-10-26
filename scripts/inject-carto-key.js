#!/usr/bin/env node
/**
 * inject-carto-key.js — Build-time injection of CARTO Basemaps API key.
 *
 * Reads CARTO_BASEMAPS_KEY from the environment (Netlify env var) and writes
 * public/js/carto-config.js so app.js can use the keyed tile URL at runtime.
 * Fails the build loudly if the key is missing.
 *
 * Run: node scripts/inject-carto-key.js   (called by netlify.toml build command)
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const key = process.env.CARTO_BASEMAPS_KEY;
if (!key) {
  console.error('FATAL: CARTO_BASEMAPS_KEY environment variable is not set.');
  console.error('Add it in the Netlify site environment variables before deploying.');
  process.exit(1);
}

const outPath = join(ROOT, 'public', 'js', 'carto-config.js');
writeFileSync(
  outPath,
  `// Generated at build time by scripts/inject-carto-key.js — do not commit\nwindow.CARTO_BASEMAPS_KEY = ${JSON.stringify(key)};\n`,
  'utf8'
);
console.log('inject-carto-key: wrote public/js/carto-config.js');

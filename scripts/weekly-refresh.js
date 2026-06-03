#!/usr/bin/env node
/**
 * scripts/weekly-refresh.js
 *
 * Weekly automated refresh — Module B.
 *
 * Run: node scripts/weekly-refresh.js [--dry-run]
 *
 * What it does (per WEEKLY_REFRESH_SPEC.md):
 *   1. Fetch RSS feeds from OCHA, EBRD, and KSE for Ukraine damage/reconstruction news.
 *   2. Check each existing asset for re-damage signals (new mentions in fetched items).
 *   3. Check for lifecycle progression signals (e.g. "reconstruction started", "completed").
 *   4. Detect candidate new assets from feed items not matching any existing asset_id.
 *   5. Write a JSON summary to reports/weekly-<date>.json for human review.
 *
 * NOTHING auto-merges. The GitHub Actions workflow turns the report into a draft PR
 * with a human-readable summary. A maintainer reviews and merges or closes.
 *
 * LLM classification (Stage 1) is called for candidate new assets only.
 * All existing-asset signals use heuristic keyword matching — no LLM needed.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function log(...args) {
  console.log('[weekly-refresh]', ...args);
}

// ── RSS fetch ─────────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  {
    id: 'ocha',
    url: 'https://reliefweb.int/updates/rss.xml?primary_country=174',
    label: 'UN OCHA / ReliefWeb Ukraine',
  },
  {
    id: 'ebrd',
    url: 'https://www.ebrd.com/rss/projects.rss',
    label: 'EBRD Projects',
  },
  {
    id: 'kse',
    url: 'https://kse.ua/feed/',
    label: 'KSE Institute',
  },
];

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'uVidNova-weekly-refresh/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRssItems(xml, feed.id);
  } catch (err) {
    log(`WARN: failed to fetch ${feed.label}: ${err.message}`);
    return [];
  }
}

function parseRssItems(xml, sourceId) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = (/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(block) ||
                   /<title[^>]*>(.*?)<\/title>/i.exec(block))?.[1]?.trim() ?? '';
    const link  = (/<link>(.*?)<\/link>/i.exec(block))?.[1]?.trim() ?? '';
    const desc  = (/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i.exec(block) ||
                   /<description>([\s\S]*?)<\/description>/i.exec(block))?.[1]
                    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/i.exec(block))?.[1]?.trim() ?? '';
    if (title) items.push({ sourceId, title, link, desc, pubDate });
  }
  return items;
}

// ── Signal detection ──────────────────────────────────────────────────────────

const REDAMAGE_KEYWORDS   = /re-?strik|second strike|again attack|hit again|damaged again|re-?damaged|повторн/i;
const LIFECYCLE_KEYWORDS  = {
  in_pipeline:         /tender|procurement|design phase|feasibility|планується/i,
  funded:              /signed|funding agreement|grant awarded|loan approved|profin|фінансуван/i,
  under_reconstruction:/reconstruction (begin|start|underway|ongoing)|будівництв|ремонт розпоч/i,
  complete:            /reopened|completed|restored|inaugurated|відновлен|відкрит/i,
};

function detectSignals(items, assets) {
  const reDamageSignals   = [];
  const lifecycleSignals  = [];
  const candidateItems    = [];

  for (const item of items) {
    const text = `${item.title} ${item.desc}`;

    // Match against existing assets by name keywords
    const matchedAssets = assets.filter(a => {
      const name = (a.name?.en ?? '').toLowerCase();
      return name.split(/\s+/).filter(w => w.length > 4).some(w => text.toLowerCase().includes(w));
    });

    if (matchedAssets.length > 0) {
      if (REDAMAGE_KEYWORDS.test(text)) {
        for (const asset of matchedAssets) {
          reDamageSignals.push({ asset_id: asset.asset_id, item });
        }
      }
      for (const [stage, re] of Object.entries(LIFECYCLE_KEYWORDS)) {
        if (re.test(text)) {
          for (const asset of matchedAssets) {
            lifecycleSignals.push({ asset_id: asset.asset_id, new_lifecycle: stage, item });
          }
        }
      }
    } else {
      // No match — candidate for new asset if it contains infrastructure keywords
      if (/hospital|school|bridge|power plant|substation|water|railway|port|housing|theatre|museum/i.test(text)) {
        candidateItems.push(item);
      }
    }
  }

  return { reDamageSignals, lifecycleSignals, candidateItems };
}

// ── Groq Stage-1 classification for candidate items ───────────────────────────

async function classifyCandidate(item) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    log('WARN: GROQ_API_KEY not set — skipping LLM classification for candidates.');
    return null;
  }

  const systemPrompt = readFileSync(
    join(ROOT, 'functions/_shared/prompts/stage1-classify.md'), 'utf8'
  );

  const userMessage = JSON.stringify({
    description: `${item.title}. ${item.desc}`.slice(0, 1000),
    sources: [item.link].filter(Boolean),
    location_hint: null,
    photo_description: null,
  }, null, 2);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(stripped);
  } catch (err) {
    log(`WARN: LLM classification failed for "${item.title.slice(0, 60)}": ${err.message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting weekly refresh (dry-run: ${DRY_RUN})`);

  // Load index — index.json is a flat array of full asset objects
  const indexData = loadJSON('public/data/assets/index.json');
  const assets    = Array.isArray(indexData) ? indexData : (indexData.assets ?? []);

  log(`Loaded ${assets.length} assets.`);

  // Fetch all feeds
  log('Fetching RSS feeds…');
  const allItems = (await Promise.all(RSS_FEEDS.map(fetchFeed))).flat();
  log(`Fetched ${allItems.length} feed items.`);

  // Detect signals
  const { reDamageSignals, lifecycleSignals, candidateItems } = detectSignals(allItems, assets);
  log(`Re-damage signals: ${reDamageSignals.length}`);
  log(`Lifecycle signals: ${lifecycleSignals.length}`);
  log(`Candidate new assets: ${candidateItems.length}`);

  // ── Local data-quality scan (runs even when RSS feeds are unavailable) ────
  const STALE_DAYS = 30;
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const staleAssets = assets
    .filter(a => (a.last_reviewed ?? '2000-01-01') < cutoff)
    .map(a => ({ asset_id: a.asset_id, last_reviewed: a.last_reviewed ?? 'never' }));

  const pendingDataAssets = assets.filter(a => {
    const specs = a.physical_specs ?? {};
    return Object.values(specs).some(v => v?.source === 'pending_data');
  }).map(a => ({ asset_id: a.asset_id, name: a.name?.en }));

  const highReDamage = assets
    .filter(a => (a.damage?.re_damage_count ?? 0) >= 2)
    .map(a => ({ asset_id: a.asset_id, re_damage_count: a.damage.re_damage_count, name: a.name?.en }));

  log(`Stale assets (>${STALE_DAYS}d): ${staleAssets.length}`);
  log(`Pending-data specs: ${pendingDataAssets.length}`);
  log(`High re-damage (≥2): ${highReDamage.length}`);

  // LLM classify top 5 candidates (rate-limit friendly)
  const candidates = [];
  for (const item of candidateItems.slice(0, 5)) {
    log(`Classifying candidate: "${item.title.slice(0, 60)}…"`);
    const classification = await classifyCandidate(item);
    candidates.push({ item, classification });
  }

  // Build report
  const report = {
    generated_at:   new Date().toISOString(),
    date:           today(),
    feed_items_fetched: allItems.length,
    re_damage_signals:    reDamageSignals,
    lifecycle_signals:    lifecycleSignals,
    candidate_new_assets: candidates,
    data_quality: {
      stale_assets:        staleAssets,
      pending_data_assets: pendingDataAssets,
      high_redamage_assets: highReDamage,
    },
    note: 'All signals require human review. Nothing auto-merges.',
  };

  if (!DRY_RUN) {
    const reportsDir = join(ROOT, 'reports');
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    const outPath = join(reportsDir, `weekly-${today()}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    log(`Report written to ${outPath}`);
  } else {
    log('Dry run — report not written. Summary:');
    console.log(JSON.stringify(report, null, 2));
  }

  log('Done.');
}

main().catch(err => {
  console.error('[weekly-refresh] Fatal error:', err);
  process.exit(1);
});

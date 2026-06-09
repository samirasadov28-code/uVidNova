/**
 * uVidNova Service Worker
 * Provides offline capability for the map shell and cached asset data.
 * Strategy: cache-first for static assets; network-first for data files.
 */

const CACHE_VERSION = 'uvidnova-v96';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/asset.html',
  '/about.html',
  '/trust.html',
  '/finance.html',
  '/css/app.css',
  '/css/vendor/leaflet.css',
  '/js/vendor/leaflet.js',
  '/js/app.js',
  '/js/asset-view.js',
  '/js/finance-page.js',
  '/js/finance-wizard.js',
  '/js/trust-page.js',
  '/js/cost-calculator.js',
  '/js/filters.js',
  '/js/data-loader.js',
  '/js/lang.js',
  '/js/trust-calculator.js',
  '/css/trust.css',
  '/js/growth-sectors.js',
  '/js/scenario-engine.js',
  '/js/aggregation.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

const DATA_ASSETS = [
  '/data/assets/index.json',
  '/data/geo/ua_oblasts.geojson',
  '/data/oblasts_info.json',
  '/data/cities.json',
  '/data/development_opportunities.json',
  '/data/growth_sectors.json',
  '/data/trust_model/capital_sources.json',
  '/data/trust_model/scenarios.json',
  '/data/trust_model/return_assumptions.json',
  '/data/trust_model/allocation_defaults.json',
  '/data/trust_model/leverage_multipliers.json',
  '/data/trust_model/ap_financing_thresholds.json',
  '/data/trust_model/strategic_assets.json',
  '/data/trust_model/precedents.json'
];

// Chart.js CDN is cached separately via the service worker fetch handler
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// ── Message (SKIP_WAITING from page) ─────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(DATA_CACHE).then(cache => cache.addAll(DATA_ASSETS))
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Netlify function calls
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return;

  // CDN assets (Chart.js, etc.): cache-first
  if (url.hostname.endsWith('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        });
      })
    );
    return;
  }

  // CartoDB Positron tiles: network-first with 5 s timeout, fallback to cache
  if (url.hostname.endsWith('.basemaps.cartocdn.com')) {
    event.respondWith(
      Promise.race([
        fetch(request).then(response => {
          if (response.ok) {
            caches.open(DATA_CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('tile timeout')), 5000))
      ]).catch(() => caches.match(request))
    );
    return;
  }

  // Only intercept same-origin requests beyond this point
  if (url.origin !== self.location.origin) return;

  // Data files: stale-while-revalidate (serve cache immediately, update in background)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }

  // CSS and JS: network-first so updated translations/styles are never served stale.
  // Falls back to cache only when offline.
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (HTML, images, SVG, fonts, manifest): network-first
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(STATIC_CACHE).then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

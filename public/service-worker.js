/**
 * uVidNova Service Worker
 * Provides offline capability for the map shell and cached asset data.
 * Strategy: cache-first for static assets; network-first for data files.
 */

const CACHE_VERSION = 'uvidnova-v4';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/asset.html',
  '/about.html',
  '/css/app.css',
  '/js/app.js',
  '/js/asset-view.js',
  '/js/data-loader.js',
  '/js/filters.js',
  '/js/cost-calculator.js',
  '/js/aggregation.js',
  '/js/lang.js',
  '/assets/ukraine-bg.svg',
  '/manifest.webmanifest'
];

const DATA_ASSETS = [
  '/data/assets/index.json',
  '/data/geo/ua_oblasts.geojson'
];

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

  // Only intercept same-origin GET requests; skip Netlify function calls
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return;

  // Data files: network-first (fresh data when available, cache fallback)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(DATA_CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // CSS and JS: network-first so deployments are always reflected immediately.
  // Fall back to cache when offline.
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

  // Everything else (HTML, images, SVG, fonts): cache-first, network fallback.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          caches.open(STATIC_CACHE).then(c => c.put(request, response.clone()));
        }
        return response;
      });
    })
  );
});

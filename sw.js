/* =====================================================
   Service Worker — Flight Management BVA
   Stratégie : Network-first + cache offline
   ===================================================== */

const CACHE_NAME = 'turnaround-v1';

/* Fichiers précachés au premier chargement */
const PRECACHE = [
  'index.html',
  'css/bulma.min.css',
  'icon-192.png',
  'icon-512.png',
  'manifest.json',
];

/* ── Install : précache ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
});

/* ── Activate : nettoie les anciens caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch : Network-first, fallback cache ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Ne pas intercepter les appels API externes (AeroDataBox, R2...)
  const url = event.request.url;
  if (url.includes('rapidapi.com') || url.includes('r2.dev')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

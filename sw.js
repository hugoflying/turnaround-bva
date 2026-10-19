/* =====================================================
   Service Worker — Companion Turnaround (v3.02)
   - Cache nommé par version (?v= de l'enregistrement) : chaque mise à jour
     repart d'un cache neuf et supprime les anciens.
   - Réseau d'abord, cache si hors ligne (tarmac sans 4G).
   - /api/ (Keeper) jamais mis en cache.
   ===================================================== */
const VER = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = 'ct-' + VER;

const PRECACHE = [
  './', './index.html', './manifest.json', './version.json',
  './css/app.css', './fonts/fonts.css', './fonts/manrope-var.woff2',
  './edition.js', './contacts.js', './app.js', './app-load.js', './app-onglets.js', './app-retard.js', './app-timeline.js', './app-keeper.js', './app-outils.js', './ui.js', './tools.js', './dlcodes.js',
  './icon-180.png', './icon-192.png', './icon-512.png',
  './home-bg-1.jpg', './home-bg-2.jpg', './home-bg-3.jpg', './home-bg-4.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  // Un fichier manquant ne doit pas bloquer l'installation
  event.waitUntil(caches.open(CACHE_NAME).then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // CDN, r2.dev… : navigateur
  if (url.pathname.includes('/api/')) return;                // Keeper : toujours en direct
  if (url.pathname.endsWith('/version.json')) return;        // contrôle de version : toujours en direct

  event.respondWith(
    fetch(req)
      .then(resp => {
        if (resp.ok) { const copy = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
        return resp;
      })
      .catch(() =>
        // Les fichiers sont appelés avec ?v=… : on ignore la query pour retrouver la copie
        caches.match(req, { ignoreSearch: true }).then(hit =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : undefined)
        ).then(hit => hit || new Response('', { status: 503, statusText: 'Offline' }))
      )
  );
});

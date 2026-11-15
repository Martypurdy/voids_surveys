// Service worker: precache the app shell, serve it cache-first so the app works offline.
// Bump VERSION whenever any file below changes, so devices pick up the update.
const VERSION = 'v59';
const CACHE = `voids-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/idb-keyval.js',
  'vendor/jspdf.umd.min.js',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js',
  'js/app.js',
  'js/router.js',
  'js/db.js',
  'js/model.js',
  'js/ui.js',
  'js/torch.js',
  'js/signature.js',
  'js/geo.js',
  'js/photos.js',
  'js/camera.js',
  'js/surveyors.js',
  'js/views/chrome.js',
  'js/views/property.js',
  'js/sor.js',
  'js/templates.js',
  'js/defectOptions.js',
  'js/views/defectLists.js',
  'js/views/settings.js',
  'js/theme.js',
  'js/views/syncDemo.js',
  'js/views/jobList.js',
  'js/views/jobActions.js',
  'js/views/jobAddress.js',
  'js/views/security.js',
  'js/views/gifted.js',
  'js/views/materials.js',
  'js/views/signoff.js',
  'js/pricing.js',
  'js/views/costSheet.js',
  'js/views/priceTotals.js',
  'js/linkfill.js',
  'js/views/shareLink.js',
  'js/views/keysRtl.js',
  'js/materials.js',
  'js/views/featureList.js',
  'js/data/features.js',
  'js/views/rooms.js',
  'js/views/room.js',
  'js/data/parts.js',
  'js/views/keySafe.js',
  'js/views/meters.js',
  'js/export/deliver.js',
  'js/export/json.js',
  'js/export/pdf.js',
  'js/export/preview.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache so a new version gets fresh files.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('voids-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over when the user taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle our own GET requests; postcodes.io, maps etc. go straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

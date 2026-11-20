// Service worker: precache the app shell, serve it cache-first so the app works offline.
// Bump VERSION whenever any file below changes, so devices pick up the update.
const VERSION = 'v117';
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
  'js/update.js',
  'js/views/syncDemo.js',
  'js/views/jobList.js',
  'js/properties.js',
  'js/views/startForm.js',
  'js/views/addressEditor.js',
  'js/views/pickProperty.js',
  'js/views/propertyPage.js',
  'js/views/propertyList.js',
  'js/views/propertySplit.js',
  'js/export/zip.js',
  'js/export/pack.js',
  'js/export/engine.js',
  'js/export/xlsx.js',
  'js/export/docx.js',
  'js/export/docs/costing.js',
  'js/export/docs/inspection.js',
  'js/export/docs/plan.js',
  'js/export/docs/repair.js',
  'js/repair.js',
  'js/raLibrary.js',
  'js/rams.js',
  'js/calc/calculators.js',
  'js/docs/money.js',
  'js/docs/create.js',
  'js/docs/colors.js',
  'js/docs/ui.js',
  'js/export/docs/document.js',
  'js/views/businessDialog.js',
  'js/views/docItems.js',
  'js/views/docTerms.js',
  'js/accounts/hmrc.js',
  'js/accounts/parse.js',
  'js/accounts/ocr.js',
  'js/accounts/store.js',
  'js/accounts/totals.js',
  'js/accounts/export.js',
  'js/views/accounts.js',
  'js/views/receiptReview.js',
  'js/export/docs/calc.js',
  'js/views/calcView.js',
  'js/views/calcMaterials.js',
  'js/data/hazards.js',
  'js/export/docs/rams.js',
  'js/views/ramsUi.js',
  'js/views/ramsStart.js',
  'js/views/ramsPlan.js',
  'js/views/ramsRisks.js',
  'js/views/ramsMethods.js',
  'js/views/ramsBriefing.js',
  'js/views/repairVisit.js',
  'js/views/repairSheet.js',
  'js/views/repairMaterials.js',
  'js/views/exportChooser.js',
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
  'js/startRtl.js',
  'js/lockDoors.js',
  'js/views/manage.js',
  'js/views/rtlStart.js',
  'js/views/shareLink.js',
  'js/views/priceHelp.js',
  'js/plan.js',
  'js/measure.js',
  'js/views/planEditor.js',
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
  'js/export/email.js',
  'js/export/json.js',
  'js/export/pdf.js',
  'js/export/preview.js',
  'js/files.js',
  'js/views/propertyFiles.js',
  'js/views/inbox.js',
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

// Files (and links) shared to the app from another app's Share menu arrive as a POST to ./share-target. Files wait in
// the 'shared-inbox-v1' cache until the app files them (Shared files screen); a link goes to the product-link screen.
// The cache name must not start with "voids-" (old app caches with that prefix are deleted on update).
async function receiveShare(req) {
  const scope = self.registration.scope;
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f) => typeof f !== 'string' && f.size >= 0);
    if (files.length) {
      const cache = await caches.open('shared-inbox-v1');
      const stamp = Date.now().toString(36);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await cache.put(new URL(`./shared-inbox/${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`, scope).href, new Response(f, {
          headers: {
            'Content-Type': f.type || 'application/octet-stream',
            'X-Name': encodeURIComponent(f.name || 'File'),
            'X-Added': new Date().toISOString(),
          },
        }));
      }
      return Response.redirect(new URL('./#/inbox', scope).href, 303);
    }
    const q = new URLSearchParams();
    for (const k of ['title', 'text', 'url']) { const v = form.get(k); if (typeof v === 'string' && v) q.set(k, v); }
    return Response.redirect(new URL(q.toString() ? `./?${q}` : './', scope).href, 303);
  } catch (e) {
    return Response.redirect(new URL('./', scope).href, 303);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(req));
    return;
  }
  // Only handle our own GET requests; postcodes.io, maps etc. go straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // The receipt scanner's files (about 7 MB) are kept apart from the app: fetched the first time they are needed, then
  // cached for good. Their cache name does not start with "voids-", so updates to the app leave them alone.
  if (url.pathname.includes('/vendor/tesseract/')) {
    event.respondWith((async () => {
      const cache = await caches.open('ocr-files-v1');
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

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

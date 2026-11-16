// Entry point: routes, autosave flushing, service worker.
import { route, start } from './router.js';
import { flushSave, adoptOrphans } from './db.js';
import { toast } from './ui.js';
import { findUrl, setPendingLink } from './linkfill.js';

// No browser right-click menu on the app (right-click is used for editing and dragging the plan);
// text boxes keep theirs for cut / copy / paste.
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest?.('input, textarea, [contenteditable="true"]')) e.preventDefault();
});

route('/', () => import('./views/jobList.js'));
route('/property/:id', () => import('./views/propertyPage.js'));
route('/settings', () => import('./views/settings.js'));
route('/settings/:tab', () => import('./views/settings.js'));
route('/job/:id', () => import('./views/jobAddress.js'));
route('/job/:id/property', () => import('./views/property.js'));
route('/job/:id/security', () => import('./views/security.js'));
route('/job/:id/keys', () => import('./views/security.js')); // old links
route('/job/:id/keysafe', () => import('./views/security.js'));
route('/job/:id/rooms', () => import('./views/rooms.js'), { kind: 'rooms' });
route('/job/:id/rooms/:roomId', () => import('./views/room.js'), { kind: 'rooms' });
route('/job/:id/externals', () => import('./views/rooms.js'), { kind: 'externals' });
route('/job/:id/externals/:roomId', () => import('./views/room.js'), { kind: 'externals' });
route('/job/:id/meters', () => import('./views/meters.js'));
route('/job/:id/gifted', () => import('./views/gifted.js'));
route('/job/:id/materials', () => import('./views/materials.js'));
route('/job/:id/signoff', () => import('./views/signoff.js'));
route('/job/:id/costs', () => import('./views/costSheet.js'), { kind: 'materials' });
route('/job/:id/labour', () => import('./views/costSheet.js'), { kind: 'labour' });
route('/job/:id/totals', () => import('./views/priceTotals.js'));
route('/share', () => import('./views/shareLink.js'));
route('/job/:id/dimensions', () => import('./views/planEditor.js'), { mode: 'dimensions' });
route('/job/:id/plan', () => import('./views/planEditor.js'), { mode: 'layout' });

// Shared to the app from another app (Android share sheet): ./?url=…&text=…&title=…
{
  const q = new URLSearchParams(location.search);
  if (q.has('url') || q.has('text') || q.has('title')) {
    const link = findUrl(q.get('url')) || findUrl(q.get('text')) || findUrl(q.get('title'));
    history.replaceState(null, '', location.pathname + (link ? '#/share' : '#/'));
    if (link) setPendingLink(link);
    else setTimeout(() => toast('Nothing to add – share a product page’s link'), 500);
  }
}

// File any entries that are not in a property yet (existing jobs, imports), then show the first screen.
adoptOrphans()
  .catch((e) => console.error('Filing entries into properties failed', e))
  .then(() => start(document.getElementById('app')));

// Make sure pending edits hit IndexedDB if the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('pagehide', () => flushSave());

registerServiceWorker();

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const offerUpdate = (worker) => {
      toast('A new version is available', {
        action: 'Reload',
        timeout: 0,
        onAction: async () => {
          await flushSave();
          worker.postMessage('skipWaiting');
        },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        // Only prompt for updates, not on the very first install.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // clients.claim() also fires controllerchange on first install – don't reload then.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      location.reload();
    });
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
}

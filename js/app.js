// Entry point: routes, autosave flushing, service worker.
import { route, start } from './router.js';
import { flushSave } from './db.js';
import { toast } from './ui.js';

route('/', () => import('./views/jobList.js'));
route('/job/:id', () => import('./views/jobAddress.js'));
route('/job/:id/rooms', () => import('./views/rooms.js'));
route('/job/:id/rooms/:roomId', () => import('./views/room.js'));
route('/job/:id/externals', () => import('./views/items.js'), { kind: 'externals' });
route('/job/:id/keys', () => import('./views/property.js')); // old tab -> key safe now lives on Property
route('/job/:id/property', () => import('./views/property.js'));
route('/job/:id/keysafe', () => import('./views/property.js'));
route('/job/:id/meters', () => import('./views/meters.js'));

start(document.getElementById('app'));

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

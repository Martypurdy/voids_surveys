// Entry point: routes, autosave flushing, service worker.
import { route, start } from './router.js';
import { flushSave } from './db.js';

route('/', () => import('./views/jobList.js'));

start(document.getElementById('app'));

// Make sure pending edits hit IndexedDB if the app is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('pagehide', () => flushSave());

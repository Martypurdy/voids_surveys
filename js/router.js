// Minimal hash router: '#/job/:id/rooms' -> view module default export(root, params).
import { flushSave } from './db.js';
import { releaseObjectUrls, h } from './ui.js';

const routes = [];
let outlet = null;
let seq = 0;

/**
 * Register a route.
 * @param {string} pattern  e.g. '/job/:id/rooms'
 * @param {() => Promise<{default: Function}>} load  lazy module loader
 * @param {object} extra  static params merged into the view's params
 */
export function route(pattern, load, extra = {}) {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '/?$');
  routes.push({ re, names, load, extra });
}

export function start(el) {
  outlet = el;
  window.addEventListener('hashchange', render);
  render();
}

export const go = (path) => { location.hash = '#' + path; };

/** Re-render the current route (e.g. after an import). */
export const refresh = render;

async function render() {
  const my = ++seq;
  await flushSave();
  const path = decodeURI(location.hash.slice(1)) || '/';
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = { ...r.extra };
    r.names.forEach((n, i) => { params[n] = m[i + 1]; });
    try {
      const mod = await r.load();
      if (my !== seq) return; // superseded by a newer navigation
      releaseObjectUrls();
      const root = document.createElement('div');
      await mod.default(root, params);
      if (my !== seq) return;
      outlet.replaceChildren(root);
      window.scrollTo(0, 0);
    } catch (err) {
      console.error(err);
      if (my === seq) outlet.replaceChildren(errorPage(err));
    }
    return;
  }
  go('/');
}

function errorPage(err) {
  return h('div', { class: 'content' },
    h('h2', null, 'Something went wrong'),
    h('p', { class: 'hint' }, String(err?.message || err)),
    h('a', { class: 'btn', href: '#/' }, 'Back to jobs'));
}

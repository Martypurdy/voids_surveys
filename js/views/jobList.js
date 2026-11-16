// Screen 1: home – properties. Search by postcode, address or reference; tap a property to see
// everything done there (newest first) and to start a new entry.
import { listProperties, storageInfo } from '../db.js';
import { fmtDate } from '../model.js';
import { addressTitle, entryForm, matches } from '../properties.js';
import { h, icon, ICONS, torchButton } from '../ui.js';
import { go, refresh } from '../router.js';
import { getLastSurveyor } from '../surveyors.js';
import { addPropertyDialog } from './addressEditor.js';

// App logo (house on a notepad), drawn on the white square in the header.
const LOGO_SVG = '<svg viewBox="8 8 84 84" aria-hidden="true"><rect x="23" y="21" width="54" height="63" rx="7" fill="#eef4f9"/>'
  + [33, 43, 53, 63].map((x) => `<rect x="${x}" y="14" width="5" height="14" rx="2.5" fill="#f2b233" stroke="#174a6d" stroke-width="1.5"/>`).join('')
  + '<path d="M50 33 66 46h-4v13H38V46h-4z" fill="#1f5f8b"/><rect x="46.5" y="50" width="7" height="9" rx="1" fill="#eef4f9"/>'
  + '<rect x="33" y="65" width="34" height="3.5" rx="1.75" fill="#9cc3dd"/><rect x="33" y="72" width="22" height="3.5" rx="1.75" fill="#9cc3dd"/></svg>';
function logo() {
  const el = h('span', { class: 'hero-logo' });
  el.innerHTML = LOGO_SVG;
  return el;
}

const PAGE = 50; // properties shown at a time (the list can run to thousands)

function greeting() {
  const hr = new Date().getHours();
  const part = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const first = getLastSurveyor().trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export default async function jobList(root) {
  const props = (await listProperties()).sort((a, b) => (b.last || '').localeCompare(a.last || ''));

  const importInput = h('input', {
    type: 'file',
    accept: '.json,.txt,.zip,application/json,application/zip,text/plain', // backups shared from a phone arrive as .txt
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const { importJobFile } = await import('../export/json.js');
      const job = await importJobFile(file);
      if (job) refresh();
    },
  });

  // ---------- Hero ----------
  const entries = props.reduce((n, p) => n + p.entries.length, 0);
  const inProgress = props.reduce((n, p) => n + p.entries.filter((e) => e.done < e.total).length, 0);
  const stat = (n, label, kind) => h('div', { class: `hero-stat hero-stat-${kind}` }, h('strong', null, String(n)), h('span', null, label));
  const hero = h('header', { class: 'hero' },
    h('div', { class: 'hero-top' },
      logo(),
      h('div', { class: 'hero-brand' }, h('h1', null, 'PropertyPad'), h('span', null, 'Surveys & site forms')),
      h('button', { type: 'button', class: 'hero-btn hero-icon', onclick: () => importInput.click(), 'aria-label': 'Import a survey file or pack', title: 'Import a survey file or pack' }, icon(ICONS.import)),
      importInput,
      torchButton('hero-btn hero-icon torch-btn'),
      h('a', { class: 'hero-btn hero-icon', href: '#/settings', 'aria-label': 'Settings' }, icon(ICONS.settings))),
    h('p', { class: 'hero-hello' }, greeting(), h('span', null, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))),
    h('div', { class: 'hero-stats' },
      stat(props.length, `Propert${props.length === 1 ? 'y' : 'ies'}`, 'progress'),
      stat(entries, entries === 1 ? 'Entry' : 'Entries', 'done'),
      stat(inProgress, 'In progress', 'photos')));

  // ---------- Properties ----------
  let query = '';
  let shown = PAGE;
  const listEl = h('div', { class: 'job-list' });
  const countEl = h('p', { class: 'hint prop-count' });
  const renderList = () => {
    const found = props.filter((p) => matches(p, query));
    const page = found.slice(0, shown);
    countEl.textContent = query.trim() ? `${found.length} match${found.length === 1 ? '' : 'es'}` : '';
    listEl.replaceChildren(...(page.length ? page.map(propertyCard) : [h('p', { class: 'empty' }, 'No property matches your search.')]),
      ...(found.length > shown
        ? [h('button', { type: 'button', class: 'btn-block', onclick: () => { shown += PAGE; renderList(); } }, `Show more (${found.length - shown} more)`)]
        : []));
  };
  const search = h('input', {
    type: 'search',
    placeholder: '🔍 Search postcode, address or reference…',
    'aria-label': 'Search properties',
    oninput: (e) => { query = e.target.value; shown = PAGE; renderList(); },
  });
  if (props.length) renderList();

  root.append(
    hero,
    h('div', { class: 'content home' },
      h('button', {
        type: 'button',
        class: 'btn-primary btn-big btn-block',
        onclick: async () => {
          const p = await addPropertyDialog();
          if (p) go(`/property/${p.id}`);
        },
      }, '＋ Add property'),
      h('h2', { class: 'home-h' }, 'Properties'),
      props.length
        ? [search, countEl, listEl]
        : h('div', { class: 'home-empty' },
          h('span', { 'aria-hidden': 'true' }, '🏠'),
          h('strong', null, 'No properties yet'),
          h('span', null, 'Tap “Add property”, then start an inspection, plan or costing inside it.')),
      footnote()));
}

/** A property: address, reference, how many entries, what kinds, and when it was last worked on. */
function propertyCard(p) {
  const n = p.entries.length;
  const open = p.entries.filter((e) => e.done < e.total).length;
  const state = !n ? 'new' : open ? 'progress' : 'done';
  const kinds = new Map();
  for (const e of p.entries) { const f = entryForm(e); kinds.set(f.emoji, (kinds.get(f.emoji) || 0) + 1); }
  return h('div', { class: 'card job-card', dataset: { state } },
    h('a', { href: `#/property/${p.id}` },
      h('div', { class: 'job-head' },
        h('div', { class: 'job-title' }, addressTitle(p.address)),
        h('span', { class: 'job-pill' }, `${n} entr${n === 1 ? 'y' : 'ies'}`)),
      p.ref ? h('div', { class: 'job-sub' }, `Ref ${p.ref}`) : null,
      n ? h('div', { class: 'job-sub' }, [...kinds].map(([emoji, c]) => `${emoji} ${c}`).join('  ·  ')) : null,
      h('div', { class: 'job-meta' }, n ? `📅 Last activity ${fmtDate(p.last)}${open ? ` · ${open} in progress` : ''}` : 'Nothing done here yet')));
}

function footnote() {
  const text = h('span', null, 'All survey data is stored on this device only.');
  const el = h('div', { class: 'home-foot' }, h('span', { 'aria-hidden': 'true' }, '🔒'), text);
  storageInfo().then(({ persisted, usage }) => {
    const parts = ['All survey data is stored on this device only.'];
    if (usage != null) parts.push(`Using ${(usage / 1048576).toFixed(1)} MB.`);
    parts.push(persisted ? 'Protected storage is on.' : 'Back up regularly – installing the app (Add to Home screen) helps keep data safe.');
    text.textContent = parts.join(' ');
  });
  return el;
}

// Properties and history: every address and everything done there. Search by postcode, address or reference;
// tap a property to see its history (newest first) and to start a new entry. Reached from the Properties button on the home screen.
import { listProperties, consolidateProperties } from '../db.js';
import { fmtDate } from '../model.js';
import { addressTitle, entryForm, matches, hasAddress } from '../properties.js';
import { h, pageHeader } from '../ui.js';
import { go, refresh } from '../router.js';
import { addPropertyDialog } from './addressEditor.js';

const PAGE = 50; // properties shown at a time (the list can run to thousands)

export default async function propertyList(root) {
  await consolidateProperties(); // the same address twice (e.g. a quick job given an address later) becomes one property
  const props = (await listProperties()).sort((a, b) => (b.last || '').localeCompare(a.last || ''));

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
    pageHeader('Properties', { back: '#/' }),
    h('div', { class: 'content home' },
      h('button', {
        type: 'button',
        class: 'btn-primary btn-big btn-block',
        onclick: async () => {
          const p = await addPropertyDialog();
          if (p) go(`/property/${p.id}`);
        },
      }, '＋ Add property'),
      h('p', { class: 'hint' }, 'Quick jobs started from the home screen appear here too, under “No address yet”, until you give them an address.'),
      props.length
        ? [search, countEl, listEl]
        : h('div', { class: 'home-empty' },
          h('span', { 'aria-hidden': 'true' }, '🏠'),
          h('strong', null, 'No properties yet'),
          h('span', null, 'Tap “Add property”, or start a form from the home screen.'))));
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
      !hasAddress(p.address) && n ? h('div', { class: 'job-sub' }, p.entries.map((e) => e.nature || entryForm(e).title).join(', ')) : null,
      n ? h('div', { class: 'job-sub' }, [...kinds].map(([emoji, c]) => `${emoji} ${c}`).join('  ·  ')) : null,
      h('div', { class: 'job-meta' }, n ? `📅 Last activity ${fmtDate(p.last)}${open ? ` · ${open} in progress` : ''}` : 'Nothing done here yet')));
}

// A product link shared to PropertyPad from another app (Android: Share › PropertyPad).
// Pick which Materials & labour costing to add it to, or start a new one.
import { listProperties } from '../db.js';
import { fmtDate } from '../model.js';
import { addressTitle } from '../properties.js';
import { h, pageHeader } from '../ui.js';
import { go } from '../router.js';
import { setPendingLink, takePendingLink, supplierOf } from '../linkfill.js';
import { createEntry } from './startForm.js';

export default async function shareLink(root) {
  const url = takePendingLink();
  if (!url) return go('/');
  // Keep it waiting for the costing's Materials tab to pick up.
  setPendingLink(url);
  // The 20 most recently worked-on costings, found from the property summaries (no jobs are loaded).
  const costings = (await listProperties())
    .flatMap((p) => p.entries.filter((e) => e.form === 'price').map((e) => ({ e, p })))
    .sort((a, b) => (b.e.updated || '').localeCompare(a.e.updated || ''))
    .slice(0, 20);

  const open = (id) => go(`/job/${id}/costs`);
  const startNew = async () => open((await createEntry('price', null)).id); // goes in a new property, to be filled in later

  root.append(
    pageHeader('Add product', { back: '#/' }),
    h('div', { class: 'content' },
      h('p', { class: 'hint' }, `Product from ${supplierOf(url)}. Which costing should it go on?`),
      h('button', { type: 'button', class: 'btn-primary btn-big btn-block', onclick: startNew }, '＋ New Materials & labour costing'),
      costings.length ? h('h2', null, 'Your costings') : null,
      h('div', { class: 'share-list' }, costings.map(({ e, p }) => h('button', {
        type: 'button',
        class: 'card share-pick',
        onclick: () => open(e.id),
      },
      h('strong', null, addressTitle(p.address)),
      h('span', null, [e.ref, fmtDate(e.created)].filter(Boolean).join(' · ')))))));
}

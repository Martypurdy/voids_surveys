// A search-as-you-type pop-up for choosing a property (moving an entry, merging properties).
import { listProperties } from '../db.js';
import { addressTitle, matches } from '../properties.js';
import { h } from '../ui.js';

/** Resolves with the chosen property, or null if cancelled. */
export async function pickProperty({ title = 'Choose a property', exclude = [] } = {}) {
  const props = (await listProperties()).filter((p) => !exclude.includes(p.id)).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  return new Promise((resolve) => {
    const list = h('div', { class: 'share-list' });
    const render = (q) => {
      const shown = props.filter((p) => matches(p, q)).slice(0, 30);
      list.replaceChildren(...(shown.length
        ? shown.map((p) => h('button', { type: 'button', class: 'card share-pick', onclick: () => done(p) },
          h('strong', null, addressTitle(p.address)),
          h('span', null, `${p.entries.length} entr${p.entries.length === 1 ? 'y' : 'ies'}${p.ref ? ` · Ref ${p.ref}` : ''}`)))
        : [h('p', { class: 'hint' }, 'No property matches.')]));
    };
    const input = h('input', { type: 'search', placeholder: '🔍 Postcode, address or reference', 'aria-label': 'Search properties', oninput: (e) => render(e.target.value) });
    const dlg = h('dialog', null,
      h('div', { class: 'dialog-body' }, h('h3', null, title), input, list),
      h('div', { class: 'dialog-buttons' }, h('button', { type: 'button', onclick: () => done(null) }, 'Cancel')));
    const done = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) done(null); });
    document.body.append(dlg);
    dlg.showModal();
    render('');
  });
}

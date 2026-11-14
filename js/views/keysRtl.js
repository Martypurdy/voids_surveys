// Ready to let › Security: which keys we have, how many, and a photo of each key type.
// One line per key type: tick it (turns green), then a quantity box and camera button
// on the same line. Saved in job.keys as { id, keySet, quantity, photos } – the same key
// register as the Empty home inspection, so it prints in the same table on the PDF.
import { scheduleSave, deletePhotos } from '../db.js';
import { RTL_KEY_TYPES, newKey } from '../model.js';
import { h, worksButton, confirmDialog, toast } from '../ui.js';
import { photoButton } from '../photos.js';

export function rtlKeysSection(job) {
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'works-list rtl-keys' });
  const find = (type) => job.keys.find((k) => k.keySet === type);

  const item = (type) => {
    const row = h('div', { class: 'inline-row rtl-key' });
    const render = () => {
      const k = find(type);
      const btn = worksButton(type, k ? 'Have this key' : 'Tap if you have this key', Boolean(k), () => toggle(type, render));
      if (!k) return row.replaceChildren(btn);
      const qty = h('input', {
        type: 'text',
        inputmode: 'numeric',
        value: String(k.quantity ?? ''),
        'aria-label': `How many ${type} keys`,
        onfocus: (e) => e.target.select(),
        oninput: (e) => {
          k.quantity = e.target.value.replace(/[^\d]/g, '');
          if (e.target.value !== k.quantity) e.target.value = k.quantity;
          save();
        },
      });
      row.replaceChildren(btn,
        h('label', { class: 'inline-qty' }, h('span', { class: 'inline-qty-label' }, 'Qty'), qty),
        photoButton(job, k.photos, () => {}, { label: `${type} key photos` }));
    };
    render();
    return row;
  };

  const toggle = async (type, render) => {
    const k = find(type);
    if (!k) {
      job.keys.push({ ...newKey(), keySet: type, quantity: '1', receivedFrom: '', issuedTo: '' });
    } else {
      if (k.photos.length && !(await confirmDialog(`Remove ${type} and its ${k.photos.length} photo${k.photos.length === 1 ? '' : 's'}?`, { ok: 'Remove' }))) return;
      job.keys.splice(job.keys.indexOf(k), 1);
      await deletePhotos(k.photos);
    }
    save();
    render();
  };

  const renderList = () => {
    const own = job.keys.map((k) => k.keySet).filter((t) => t && !RTL_KEY_TYPES.includes(t));
    list.replaceChildren(...[...RTL_KEY_TYPES, ...new Set(own)].map(item));
  };
  renderList();

  const ownInput = h('input', { type: 'text', placeholder: 'e.g. Bin store, Bike shed…', autocapitalize: 'sentences', 'aria-label': 'Another key type' });
  const addOwn = () => {
    const type = ownInput.value.trim();
    if (!type) return ownInput.focus();
    if (find(type) || RTL_KEY_TYPES.some((t) => t.toLowerCase() === type.toLowerCase())) return toast(`${type} is already in the list`);
    job.keys.push({ ...newKey(), keySet: type, quantity: '1', receivedFrom: '', issuedTo: '' });
    ownInput.value = '';
    save();
    renderList();
  };
  ownInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOwn(); });

  return h('div', null,
    h('h2', null, 'Keys'),
    h('p', { class: 'hint' }, 'Tick each key you have, enter how many, and tap 📷 to photograph it. Hold 📷 to view or edit photos. Fobs go under Communal key / fob.'),
    list,
    h('div', { class: 'add-own' },
      h('span', { class: 'field-label' }, '+ Add another key type'),
      h('div', { class: 'add-own-row', style: 'grid-template-columns:1fr auto' }, ownInput,
        h('button', { type: 'button', class: 'btn-primary', onclick: addOwn }, 'Add'))));
}

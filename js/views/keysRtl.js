// Ready to let › Security: which keys we have, how many, and a photo of each key type.
// Tick a key type (it turns green), then enter the quantity and take photos.
// Saved in job.keys as { id, keySet, quantity, photos } – the same key register as the
// Empty home inspection, so it prints in the same table on the PDF.
import { scheduleSave, deletePhotos } from '../db.js';
import { RTL_KEY_TYPES, newKey } from '../model.js';
import { h, worksButton, textField, confirmDialog, toast } from '../ui.js';
import { photoField } from '../photos.js';

const keysText = (k) => {
  const n = Number(k.quantity) || 0;
  const parts = [n ? `${n} key${n === 1 ? '' : 's'}` : 'Enter how many', k.photos.length ? `📷 ${k.photos.length}` : ''];
  return parts.filter(Boolean).join(' · ');
};

export function rtlKeysSection(job) {
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'works-list rtl-keys' });
  const find = (type) => job.keys.find((k) => k.keySet === type);

  const item = (type) => {
    const wrap = h('div', { class: 'works-list rtl-key' });
    const render = () => {
      const k = find(type);
      const btn = worksButton(type, k ? keysText(k) : 'Tap if you have this key', Boolean(k), () => toggle(type, render));
      if (!k) return wrap.replaceChildren(btn);
      const btnSlot = h('div', { class: 'works-list', style: 'margin:0' }, btn);
      const refreshBtn = () => btnSlot.replaceChildren(worksButton(type, keysText(k), true, () => toggle(type, render)));
      const panel = h('div', { class: 'card card-body works-panel' },
        textField('Quantity', String(k.quantity ?? ''), (v) => {
          k.quantity = v.replace(/[^\d]/g, '');
          save();
          refreshBtn();
        }, { inputmode: 'numeric', placeholder: 'How many?' }),
        h('span', { class: 'field-label' }, `Photos of the ${type.toLowerCase()} key${type === 'Window keys' ? 's' : ''}`),
        photoField(job, k.photos, refreshBtn));
      wrap.replaceChildren(btnSlot, panel);
    };
    render();
    return wrap;
  };

  const toggle = async (type, render) => {
    const k = find(type);
    if (!k) {
      const nk = { ...newKey(), keySet: type, quantity: '1', receivedFrom: '', issuedTo: '' };
      job.keys.push(nk);
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
    h('p', { class: 'hint' }, 'Tick each type of key you have – it turns green. Enter how many and take a photo of each type. Fobs go under Communal key / fob.'),
    list,
    h('div', { class: 'add-own' },
      h('span', { class: 'field-label' }, '+ Add another key type'),
      h('div', { class: 'add-own-row', style: 'grid-template-columns:1fr auto' }, ownInput,
        h('button', { type: 'button', class: 'btn-primary', onclick: addOwn }, 'Add'))));
}

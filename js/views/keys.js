// Screen: keys & key safe – key register plus the key safe section.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { newKey, fmtDate } from '../model.js';
import { h, textField, confirmDialog } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';
import { keySafeSection } from './keySafe.js';

export default async function keys(root, { id }) {
  const job = await loadJobOr404(id);
  const save = () => scheduleSave(job);
  const container = h('div');
  const empty = h('p', { class: 'empty' }, 'No keys recorded yet.');
  const syncEmpty = () => { empty.hidden = job.keys.length > 0; };

  const keyCard = (k, open = false) => {
    const title = h('span', { class: 'summary-title' });
    const meta = h('span', { class: 'summary-meta' });
    const sync = () => {
      title.textContent = k.keySet || 'Key set';
      meta.textContent = [`×${k.quantity || 0}`, k.date && fmtDate(k.date), k.photos.length && `📷 ${k.photos.length}`]
        .filter(Boolean).join(' · ');
    };
    sync();
    const bind = (key, label, opts) => textField(label, k[key], (v) => {
      k[key] = opts?.type === 'number' ? (v === '' ? '' : Number(v)) : v;
      sync();
      save();
    }, opts);

    const card = h('details', { class: 'card', open },
      h('summary', null, title, meta),
      h('div', { class: 'card-body' },
        bind('keySet', 'Key set', { placeholder: 'e.g. Front door – Yale', autocapitalize: 'sentences' }),
        h('div', { class: 'grid-2' },
          bind('quantity', 'Quantity', { type: 'number', inputmode: 'numeric' }),
          bind('date', 'Date', { type: 'date' })),
        bind('receivedFrom', 'Received from', { placeholder: 'e.g. Outgoing tenant, locksmith', autocapitalize: 'words' }),
        bind('issuedTo', 'Issued to', { placeholder: 'e.g. Contractor, housing officer', autocapitalize: 'words' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, k.photos, sync),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn-danger btn-small',
            onclick: async () => {
              if (!(await confirmDialog(`Delete “${k.keySet || 'this key set'}”?`))) return;
              job.keys.splice(job.keys.indexOf(k), 1);
              await deletePhotos(k.photos);
              scheduleSave(job, 0);
              await flushSave();
              card.remove();
              syncEmpty();
            },
          }, 'Delete key set'))));
    return card;
  };

  container.append(...job.keys.map((k) => keyCard(k)));
  syncEmpty();

  root.append(
    ...jobChrome(job, 'keys'),
    h('div', { class: 'content' },
      h('h2', { class: 'section-title' }, 'Key register'),
      h('button', {
        type: 'button',
        class: 'btn-primary btn-block',
        style: 'margin-bottom:16px',
        onclick: () => {
          const k = newKey();
          job.keys.push(k);
          save();
          const card = keyCard(k, true);
          container.append(card);
          syncEmpty();
          card.querySelector('input')?.focus();
        },
      }, '+ Add key set'),
      container,
      empty,
      keySafeSection(job),
      completeFooter(job, 'keys')));
}

// Screen 6: meters – gas, electric, water (plus any extra meters).
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { newMeter, UTILITIES, METER_TYPES, SUPPLY_STATUSES } from '../model.js';
import { h, textField, selectField, confirmDialog } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome } from './jobAddress.js';

export default async function meters(root, { id }) {
  const job = await loadJobOr404(id);
  const save = () => scheduleSave(job);
  const container = h('div');

  const meterCard = (m, open = false) => {
    const title = h('span', { class: 'summary-title' });
    const meta = h('span', { class: 'summary-meta' });
    const sync = () => {
      title.textContent = `${m.utility} meter`;
      meta.textContent = [m.type, m.supply, m.photos.length && `📷 ${m.photos.length}`].filter(Boolean).join(' · ');
    };
    sync();
    const bind = (key, label, opts) => textField(label, m[key], (v) => {
      m[key] = v;
      sync();
      save();
    }, opts);
    const pick = (key, label, options, opts) => selectField(label, m[key], options, (v) => {
      m[key] = v;
      sync();
      save();
      syncPrepay();
    }, opts);

    const prepay = h('div', { class: 'grid-2' },
      pick('balanceType', 'Prepayment balance', ['Credit', 'Debt'], { placeholder: null }),
      bind('balance', 'Amount (£)', { inputmode: 'decimal', placeholder: '0.00' }));
    const syncPrepay = () => { prepay.hidden = m.type !== 'Prepayment'; };
    syncPrepay();

    const card = h('details', { class: 'card', open },
      h('summary', null, title, meta),
      h('div', { class: 'card-body' },
        h('div', { class: 'grid-2' },
          pick('utility', 'Utility', UTILITIES, { placeholder: null }),
          pick('supply', 'Supply status', SUPPLY_STATUSES)),
        pick('type', 'Meter type', METER_TYPES),
        prepay,
        bind('serial', 'Serial number', { autocapitalize: 'characters', spellcheck: 'false' }),
        h('div', { class: 'grid-2' },
          bind('reading', 'Reading', { inputmode: 'decimal' }),
          bind('date', 'Date read', { type: 'date' })),
        bind('location', 'Location', { placeholder: 'e.g. Under stairs cupboard', autocapitalize: 'sentences' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, m.photos, sync),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn-danger btn-small',
            onclick: async () => {
              if (!(await confirmDialog(`Delete this ${m.utility.toLowerCase()} meter?`))) return;
              job.meters.splice(job.meters.indexOf(m), 1);
              await deletePhotos(m.photos);
              scheduleSave(job, 0);
              await flushSave();
              card.remove();
            },
          }, 'Delete meter'))));
    return card;
  };

  container.append(...job.meters.map((m) => meterCard(m)));

  root.append(
    ...jobChrome(job, 'meters'),
    h('div', { class: 'content' },
      container,
      h('button', {
        type: 'button',
        class: 'btn-block',
        onclick: () => {
          const m = newMeter('Electric');
          job.meters.push(m);
          save();
          const card = meterCard(m, true);
          container.append(card);
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, '+ Add another meter')));
}

// Screen: services – heating, fuse board, stop tap & meters – heating type (pop-up), then each meter's location and photos.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { newMeter, UTILITIES, HEATING_TYPES, serviceTitle } from '../model.js';
import { h, textField, selectField, confirmDialog, multiSelect } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const DEFAULT_UTILITIES = new Set(UTILITIES);
const LOCATION_HINTS = {
  'Fuse board': 'e.g. Under stairs cupboard, above front door',
  'Mains stop tap': 'e.g. Under kitchen sink, in front garden',
  Gas: 'e.g. External box at front of property',
  Electric: 'e.g. Under stairs cupboard',
  Water: 'e.g. Pavement outside, under kitchen sink',
}; // the first gas/electric/water meters can't be deleted

export default async function meters(root, { id }) {
  const job = await loadJobOr404(id);
  const save = () => scheduleSave(job);
  const container = h('div');

  // ----- Heating type -----
  const heatingBtn = h('button', { type: 'button', class: 'works-item' });
  const renderHeating = () => {
    const on = job.heating.length > 0;
    heatingBtn.setAttribute('aria-pressed', String(on));
    heatingBtn.replaceChildren(
      h('span', { class: 'works-tick', 'aria-hidden': 'true' }, on ? '✓' : ''),
      h('span', { class: 'works-text' },
        h('span', { class: 'works-label' }, 'Heating type'),
        h('span', { class: 'works-detail' }, on ? job.heating.join(', ') : 'Tap to choose')),
      h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, '›'));
  };
  heatingBtn.addEventListener('click', async () => {
    const r = await multiSelect({
      title: 'Heating type',
      message: 'Select all that apply.',
      groups: [{ options: HEATING_TYPES, selected: job.heating }],
    });
    if (!r) return;
    [job.heating] = r;
    save();
    renderHeating();
  });
  renderHeating();

  // ----- Meters: location + photos -----
  const firstOfType = (m) => job.meters.find((x) => x.utility === m.utility) === m;

  const meterCard = (m, open = false) => {
    const title = h('span', { class: 'summary-title' });
    const meta = h('span', { class: 'summary-meta' });
    const sync = () => {
      title.textContent = serviceTitle(m.utility);
      meta.textContent = [m.location.trim() ? 'Located' : '', m.photos.length ? `📷 ${m.photos.length}` : ''].filter(Boolean).join(' · ');
    };
    sync();
    const removable = !(DEFAULT_UTILITIES.has(m.utility) && firstOfType(m));

    const card = h('details', { class: 'card', open },
      h('summary', null, title, meta),
      h('div', { class: 'card-body' },
        removable
          ? selectField('Type', m.utility, UTILITIES.map((u) => [u, serviceTitle(u)]), (v) => { m.utility = v; sync(); save(); }, { placeholder: null })
          : null,
        textField('Location', m.location, (v) => {
          m.location = v;
          sync();
          save();
        }, { placeholder: LOCATION_HINTS[m.utility] || 'e.g. Under stairs cupboard', autocapitalize: 'sentences' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, m.photos, sync),
        removable
          ? h('div', { class: 'btn-row' },
            h('button', {
              type: 'button',
              class: 'btn-danger btn-small',
              onclick: async () => {
                if (!(await confirmDialog(`Delete this ${serviceTitle(m.utility).toLowerCase()}?`))) return;
                job.meters.splice(job.meters.indexOf(m), 1);
                await deletePhotos(m.photos);
                scheduleSave(job, 0);
                await flushSave();
                card.remove();
              },
            }, 'Delete meter'))
          : null));
    return card;
  };

  container.append(...job.meters.map((m) => meterCard(m)));

  root.append(
    ...jobChrome(job, 'meters'),
    h('div', { class: 'content' },
      h('h2', null, 'Heating'),
      h('div', { class: 'works-list' }, heatingBtn),
      h('h2', null, 'Fuse board, stop tap & meters'),
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
      }, '+ Add another meter / service'),
      completeFooter(job, 'meters')));
}

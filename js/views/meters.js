// Screen: services – heating, fuse board, stop tap & meters – heating type (pop-up), then each meter's location and photos.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { newMeter, UTILITIES, HEATING_TYPES, serviceTitle, hasMeterDoor } from '../model.js';
import { h, textField, selectField, confirmDialog, multiSelect } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const DEFAULT_UTILITIES = new Set(UTILITIES);
const LOCATION_HINTS = {
  'Fuse board': 'e.g. Under-stairs cupboard, above front door',
  'Mains stop tap': 'e.g. Under kitchen sink, in front garden',
  Gas: 'e.g. External box at front of property',
  Electric: 'e.g. Under-stairs cupboard',
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

    // Gas / electric: is the meter box door damaged? (Yes / No), then a notes box.
    const doorBtns = h('div', { class: 'segmented yes-no', role: 'group', 'aria-label': 'Meter box door damaged?' });
    const renderDoor = () => doorBtns.replaceChildren(...[['yes', 'Yes'], ['no', 'No']].map(([v, label]) => h('button', {
      type: 'button',
      dataset: { v },
      'aria-pressed': String(m.doorDamaged === v),
      onclick: () => {
        m.doorDamaged = m.doorDamaged === v ? '' : v;
        renderDoor();
        sync();
        save();
      },
    }, label)));
    renderDoor();
    const doorBlock = h('div', { class: 'meter-door' },
      h('span', { class: 'field-label' }, 'Is the meter box door damaged?'),
      doorBtns,
      textField('Notes', m.notes ?? '', (v) => { m.notes = v; save(); },
        { multiline: true, autocapitalize: 'sentences', placeholder: 'e.g. Door hanging off, lock broken, key missing' }));

    const sync = () => {
      title.textContent = serviceTitle(m.utility);
      doorBlock.hidden = !hasMeterDoor(m.utility);
      meta.textContent = [
        m.location.trim() ? 'Located' : '',
        hasMeterDoor(m.utility) && m.doorDamaged === 'yes' ? '⚠ Door damaged' : '',
        m.photos.length ? `📷 ${m.photos.length}` : '',
      ].filter(Boolean).join(' · ');
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
        }, { placeholder: LOCATION_HINTS[m.utility] || 'e.g. Under-stairs cupboard', autocapitalize: 'sentences' }),
        doorBlock,
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

  // ----- Legionella flush: the paper form is left on site; tick it and photo the form -----
  const leg = job.legionella;
  const legBtn = h('button', { type: 'button', class: 'works-item legionella-tick' });
  const renderLeg = () => {
    legBtn.setAttribute('aria-pressed', String(leg.done));
    legBtn.replaceChildren(
      h('span', { class: 'works-tick', 'aria-hidden': 'true' }, leg.done ? '✓' : ''),
      h('span', { class: 'works-text' },
        h('span', { class: 'works-label' }, 'Legionella flush completed'),
        h('span', { class: 'works-detail' }, leg.done ? 'Done – form left on site' : 'Tap to tick when done')));
  };
  legBtn.addEventListener('click', () => {
    leg.done = !leg.done;
    renderLeg();
    save();
  });
  renderLeg();
  const legionellaCard = h('div', { class: 'card card-body legionella' },
    h('div', { class: 'works-list' }, legBtn),
    h('span', { class: 'field-label' }, 'Photo of the legionella form'),
    photoField(job, leg.photos, () => {}),
    textField('Notes', leg.notes, (v) => { leg.notes = v; save(); },
      { multiline: true, autocapitalize: 'sentences', placeholder: 'Anything to note about the flush' }));

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
      h('h2', null, 'Legionella flush'),
      legionellaCard,
      completeFooter(job, 'meters', {
        check: () => leg.done || confirmDialog('The legionella flush isn’t ticked yet. Mark Services complete anyway?', { ok: 'Mark complete' }),
      })));
}

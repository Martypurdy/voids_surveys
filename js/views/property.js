// Screen: property – type/style/size, property photo (shown at the top of the PDF)
// and clearance / clean. Key safe, locks and gain entry live on the Security tab.
import { scheduleSave } from '../db.js';
import {
  PROPERTY_TYPES, PROPERTY_STYLES,
  CLEARANCE_OPTIONS, CLEARANCE_HINTS, CLEARANCE_OWNERS, syncClearance, ownerLabel, isRtl,
} from '../model.js';
import { h, textField, selectField, worksButton, toast } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const HAS_STYLE = new Set(['House', 'Bungalow']);
const HAS_FLOOR = new Set(['Flat', 'Maisonette', 'Bedsit']);

export default async function property(root, { id }) {
  const job = await loadJobOr404(id);
  const p = job.property;
  const w = job.works;
  const save = () => scheduleSave(job);

  // ----- Property type buttons -----
  const typeButtons = h('div', { class: 'choice-grid', role: 'group', 'aria-label': 'Property type' });
  const renderTypes = () => {
    typeButtons.replaceChildren(...PROPERTY_TYPES.map((t) => h('button', {
      type: 'button',
      'aria-pressed': String(p.type === t),
      onclick: () => {
        p.type = p.type === t ? '' : t;
        save();
        renderTypes();
        syncVisibility();
      },
    }, t)));
  };

  const styleField = selectField('Style', p.style, PROPERTY_STYLES, (v) => { p.style = v; save(); });
  const floorField = textField('Floor level', p.floor, (v) => { p.floor = v; save(); },
    { placeholder: 'e.g. Ground, 1st, 2nd', autocapitalize: 'words' });
  const syncVisibility = () => {
    styleField.hidden = !HAS_STYLE.has(p.type);
    floorField.hidden = !HAS_FLOOR.has(p.type);
  };
  renderTypes();
  syncVisibility();

  // ----- Clearance -----
  // Pick Operative (orange) or Contractor (red), then tap tasks: each turns that colour. Tap again to clear it.
  let mode = '';
  const list = h('div', { class: 'alloc' });
  const renderList = () => {
    const who = w.clearanceWho;
    list.replaceChildren(
      h('div', { class: 'alloc-who', role: 'group', 'aria-label': 'Who does the task' },
        ...CLEARANCE_OWNERS.map(([k, label]) => h('button', {
          type: 'button', class: `alloc-mode alloc-${k}`, 'aria-pressed': String(mode === k),
          onclick: () => { mode = mode === k ? '' : k; renderList(); },
        }, label))),
      h('p', { class: 'hint' }, mode
        ? `Now tap each task ${ownerLabel(mode)} will do. Tap a task again to clear it.`
        : 'Tap Operative or Contractor first, then tap the tasks they will do.'),
      h('div', { class: 'works-list' }, ...CLEARANCE_OPTIONS.map((t) => {
        const owner = who[t];
        const on = t in who;
        const btn = worksButton(t, [CLEARANCE_HINTS[t], owner ? ownerLabel(owner) : ''].filter(Boolean).join(' – '), on, () => {
          if (!mode) { toast('Tap Operative or Contractor first'); return; }
          if (who[t] === mode) delete who[t]; else who[t] = mode;
          syncClearance(w);
          save();
          renderList();
        });
        if (owner) btn.dataset.owner = owner;
        return btn;
      })));
  };
  renderList();

  // Ready to let: clearance and cleaning are each a Yes tick with notes.
  const rtlCheck = (key, label) => {
    const c = job.rtl[key];
    const slot = h('div', { class: 'works-list' });
    const render = () => slot.replaceChildren(worksButton(label, c.done ? 'Yes' : 'Tap to tick', c.done, () => { c.done = !c.done; save(); render(); }));
    render();
    return [slot, textField('Notes', c.notes, (v) => { c.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences' })];
  };
  const rtl = isRtl(job);

  root.append(
    ...jobChrome(job, 'property'),
    h('div', { class: 'content' },
      rtl && job.fromId ? h('p', { class: 'copied-note' }, '✓ Copied from the inspection') : null,
      h('h2', null, 'Property type'),
      typeButtons,
      styleField,
      h('div', { class: 'grid-2' },
        textField('Bedrooms', p.bedrooms, (v) => { p.bedrooms = v; save(); }, { inputmode: 'numeric' }),
        textField('Storeys', p.storeys, (v) => { p.storeys = v; save(); }, { inputmode: 'numeric' })),
      floorField,

      h('h2', null, 'Property photo'),
      h('p', { class: 'hint' }, 'The first photo appears at the top of the PDF report.'),
      photoField(job, p.photos),

      rtl ? [
        h('h2', null, 'Clearance'), ...rtlCheck('clearance', 'Cleared'),
        h('h2', null, 'Cleaning'), ...rtlCheck('cleaning', 'Cleaned'),
      ] : [h('h2', null, 'Clearance / clean'), list],
      completeFooter(job, 'property')));
}

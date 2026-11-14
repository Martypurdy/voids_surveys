// Screen: property – type/style/size, property photo (shown at the top of the PDF)
// and clearance / clean. Key safe, locks and gain entry live on the Security tab.
import { scheduleSave } from '../db.js';
import {
  PROPERTY_TYPES, PROPERTY_STYLES,
  CLEARANCE_OPTIONS, CLEARANCE_HINTS, CLEARANCE_BY, isRtl,
} from '../model.js';
import { h, textField, selectField, multiSelect, worksButton } from '../ui.js';
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
  const list = h('div', { class: 'works-list' });
  const renderList = () => {
    const detail = [w.clearance.join(', '), w.clearanceBy.length ? `by ${w.clearanceBy.join(' / ')}` : '']
      .filter(Boolean).join(' – ');
    list.replaceChildren(
      worksButton('Clearance / clean', detail || 'Tap to choose',
        Boolean(w.clearance.length || w.clearanceBy.length), async () => {
          const r = await multiSelect({
            title: 'Clearance / clean',
            groups: [
              { label: 'Clearance / clean needed', options: CLEARANCE_OPTIONS, hints: CLEARANCE_HINTS, selected: w.clearance },
              { label: 'Carried out by', options: CLEARANCE_BY, selected: w.clearanceBy },
            ],
          });
          if (!r) return;
          [w.clearance, w.clearanceBy] = r;
          save();
          renderList();
        }, { chevron: '›' }));
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
        h('h2', null, 'Clearance'), ...rtlCheck('clearance', 'Clearance completed'),
        h('h2', null, 'Cleaning'), ...rtlCheck('cleaning', 'Cleaning completed'),
      ] : [h('h2', null, 'Clearance / clean'), list],
      completeFooter(job, 'property')));
}

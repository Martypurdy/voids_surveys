// Screen: property type – type/style/size, property photo (shown at the top of
// the PDF), and the "works required" list with its pop-ups and key safe details.
import { scheduleSave } from '../db.js';
import {
  PROPERTY_TYPES, PROPERTY_STYLES,
  CYLINDER_OPTIONS, CYLINDER_DEFAULT, CLEARANCE_OPTIONS, CLEARANCE_BY,
} from '../model.js';
import { h, textField, selectField, multiSelect } from '../ui.js';
import { photoField } from '../photos.js';
import { keySafeSection } from './keySafe.js';
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

  // ----- Works required list -----
  const list = h('div', { class: 'works-list' });
  const keySafePanel = h('div', { class: 'card card-body works-panel' }, keySafeSection(job));
  let keySafeOpen = false;

  const item = (label, detail, on, onclick, { chevron, ...attrs } = {}) => h('button', {
    type: 'button',
    class: 'works-item',
    'aria-pressed': String(on),
    onclick,
    ...attrs,
  },
  h('span', { class: 'works-tick', 'aria-hidden': 'true' }, on ? '✓' : ''),
  h('span', { class: 'works-text' },
    h('span', { class: 'works-label' }, label),
    detail ? h('span', { class: 'works-detail' }, detail) : null),
  chevron ? h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, chevron) : null);

  const keySafeHasInfo = () => Boolean(job.keySafe.location.trim() || job.keySafe.code || job.keySafe.photos.length || job.keySafe.lat != null);

  const renderList = () => {
    const ks = job.keySafe;
    list.replaceChildren(
      item('Fit key safe', '', w.keySafe, () => { w.keySafe = !w.keySafe; save(); renderList(); }),
      item('Gain entry', '', w.gainEntry, () => { w.gainEntry = !w.gainEntry; save(); renderList(); }),
      item('Renew locks', w.cylinders?.length ? w.cylinders.join(', ') : 'Tap to choose locks',
        Boolean(w.cylinders?.length), async () => {
          const r = await multiSelect({
            title: 'Renew locks',
            message: 'Select every lock that needs renewing.',
            groups: [{ options: CYLINDER_OPTIONS, selected: w.cylinders ?? CYLINDER_DEFAULT }],
          });
          if (!r) return;
          [w.cylinders] = r;
          save();
          renderList();
        }, { chevron: '›' }),
      item('Property clearance',
        [w.clearance.join(', '), w.clearanceBy.length ? `by ${w.clearanceBy.join(' / ')}` : ''].filter(Boolean).join(' – ') || 'Tap to choose',
        Boolean(w.clearance.length || w.clearanceBy.length), async () => {
          const r = await multiSelect({
            title: 'Property clearance',
            groups: [
              { label: 'Clearance needed', options: CLEARANCE_OPTIONS, selected: w.clearance },
              { label: 'Carried out by', options: CLEARANCE_BY, selected: w.clearanceBy },
            ],
          });
          if (!r) return;
          [w.clearance, w.clearanceBy] = r;
          save();
          renderList();
        }, { chevron: '›' }),
      item('Key safe details',
        [ks.location.trim() && 'Location', ks.code && 'Code', ks.photos.length && `${ks.photos.length} photo${ks.photos.length === 1 ? '' : 's'}`]
          .filter(Boolean).join(' · ') || 'Location, code and photos',
        keySafeHasInfo(), () => {
          keySafeOpen = !keySafeOpen;
          keySafePanel.hidden = !keySafeOpen;
          renderList();
          if (keySafeOpen) keySafePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, { chevron: keySafeOpen ? '▴' : '▾', 'aria-expanded': String(keySafeOpen) }),
    );
  };
  keySafePanel.hidden = true;
  // Refresh the summary line when key safe details are edited.
  keySafePanel.addEventListener('input', () => renderList());
  keySafePanel.addEventListener('click', () => setTimeout(renderList, 400));
  renderList();

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

      h('h2', null, 'Works required'),
      h('p', { class: 'hint' }, 'Tap to select – selected items turn green.'),
      list,
      keySafePanel,
      completeFooter(job, 'property')));
}

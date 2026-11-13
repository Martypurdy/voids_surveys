// Screen: property type – type, style, bedrooms, storeys/floor, notes.
import { scheduleSave } from '../db.js';
import { PROPERTY_TYPES, PROPERTY_STYLES } from '../model.js';
import { h, textField, selectField } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const HAS_STYLE = new Set(['House', 'Bungalow']);
const HAS_FLOOR = new Set(['Flat', 'Maisonette', 'Bedsit']);

export default async function property(root, { id }) {
  const job = await loadJobOr404(id);
  const p = job.property;
  const save = () => scheduleSave(job);

  // Big tap-friendly choice buttons for the property type.
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
  const storeysField = textField('Storeys', p.storeys, (v) => { p.storeys = v; save(); }, { inputmode: 'numeric' });

  const syncVisibility = () => {
    styleField.hidden = !HAS_STYLE.has(p.type);
    floorField.hidden = !HAS_FLOOR.has(p.type);
  };

  renderTypes();
  syncVisibility();

  root.append(
    ...jobChrome(job, 'property'),
    h('div', { class: 'content' },
      h('h2', null, 'Property type'),
      typeButtons,
      styleField,
      h('div', { class: 'grid-2' },
        textField('Bedrooms', p.bedrooms, (v) => { p.bedrooms = v; save(); }, { inputmode: 'numeric' }),
        storeysField),
      floorField,
      textField('Notes', p.notes, (v) => { p.notes = v; save(); },
        { multiline: true, placeholder: 'e.g. Non-standard construction, communal entrance, lift access', autocapitalize: 'sentences' }),
      completeFooter(job, 'property')));
}

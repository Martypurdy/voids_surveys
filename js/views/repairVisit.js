// Property repair survey › Visit: project details and the purpose of the visit.
import { scheduleSave } from '../db.js';
import { PROPERTY_TYPES, REPAIR_REASONS, OCCUPANCY } from '../model.js';
import { h, textField, selectField } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

/** A row of buttons for choosing one of a few options (tap the chosen one again to clear it). */
function choice(label, options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const render = () => wrap.replaceChildren(...options.map(([v, text]) => h('button', {
    type: 'button',
    'aria-pressed': String(value === v),
    onclick: () => { value = value === v ? '' : v; render(); onChange(value); },
  }, text)));
  render();
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), wrap);
}

export default async function repairVisit(root, { id }) {
  const job = await loadJobOr404(id);
  const r = job.repair;
  const save = () => scheduleSave(job);

  root.append(
    ...jobChrome(job, 'visit'),
    h('div', { class: 'content' },
      h('h2', null, 'Project details'),
      h('div', { class: 'card card-body form-cols' },
        textField('Date of inspection', r.date, (v) => { r.date = v; save(); }, { type: 'date' }),
        selectField('Property type', r.propertyType, PROPERTY_TYPES, (v) => { r.propertyType = v; save(); }),
        choice('Occupancy', OCCUPANCY, r.occupancy, (v) => { r.occupancy = v; save(); }),
        textField('Weather conditions', r.weather, (v) => { r.weather = v; save(); }, { autocapitalize: 'sentences', placeholder: 'e.g. Dry, overcast' }),
        textField('Access arrangements', r.access, (v) => { r.access = v; save(); }, { autocapitalize: 'sentences', placeholder: 'e.g. Key from housing office' })),
      h('h2', null, 'Purpose of visit'),
      h('div', { class: 'card card-body' },
        choice('Reason for visit', REPAIR_REASONS, r.reason, (v) => { r.reason = v; save(); }),
        textField('Brief of the issue (as reported)', r.brief, (v) => { r.brief = v; save(); }, { multiline: true, autocapitalize: 'sentences', placeholder: 'What was reported, and by whom' })),
      h('p', { class: 'hint' }, 'The surveyor, the tenant or contact, the job number and the property address are on the Address tab.'),
      completeFooter(job, 'visit')));
}

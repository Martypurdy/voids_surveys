// RAMS pack › Plan: the construction phase plan (CDM 2015) for a small job – who is doing what, the site rules and
// welfare, what the client has told you, and the main dangers with their controls. Kept short on purpose: risk
// assessments and method statements are separate documents (the Risks and Methods tabs).
import { scheduleSave } from '../db.js';
import { newDanger } from '../model.js';
import { notifiable } from '../rams.js';
import { h, textField } from '../ui.js';
import { sheetEditor, pickHazards } from './ramsUi.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function ramsPlan(root, { id }) {
  const job = await loadJobOr404(id);
  const cpp = job.rams.cpp;
  const save = () => scheduleSave(job);
  const text = (label, k, { multiline = true, ph = '', type } = {}) => textField(label, cpp[k], (v) => { cpp[k] = v; save(); }, { multiline, type, placeholder: ph, autocapitalize: 'sentences' });

  const warn = h('p', { class: 'warn-note', hidden: true }, '⚠️ A job this big has to be told to the HSE (form F10) and needs a fuller plan than this simple one. Check with your health and safety adviser.');
  const check = () => { warn.hidden = !notifiable(cpp); };
  const size = (label, k, ph) => textField(label, cpp[k], (v) => { cpp[k] = v; save(); check(); }, { inputmode: 'decimal', placeholder: ph });

  const dangers = sheetEditor({
    job, items: cpp.dangers, make: () => newDanger(), onChange: save, numbered: false, removeLabel: 'Remove this danger',
    cols: [{ k: 'present', label: 'Present', kind: 'check', w: '72px' }, { k: 'hazard', label: 'Danger', ph: 'e.g. Working at height', w: '1fr' }, { k: 'controls', label: 'How it will be controlled', ph: 'Controls', w: '2fr' }],
  });
  const addBtn = h('button', {
    type: 'button',
    class: 'btn-small',
    onclick: async () => {
      const rows = await pickHazards();
      if (!rows?.length) return;
      const have = new Set(cpp.dangers.map((d) => d.hazard.trim().toLowerCase()));
      for (const r of rows) if (!have.has(r.hazard.trim().toLowerCase())) cpp.dangers.splice(Math.max(0, cpp.dangers.length - 1), 0, { ...newDanger(r.hazard, r.controls), present: true });
      save();
      dangers.refresh();
    },
  }, '+ Add from the hazard list');

  root.append(
    ...jobChrome(job, 'cpp'),
    h('div', { class: 'content wide' },
      h('p', { class: 'hint' }, 'A short plan for a small job under the Construction (Design and Management) Regulations 2015. Fill in what applies; anything left blank stays out of the document.'),
      h('h2', null, 'The job'),
      h('div', { class: 'card card-body' },
        text('Who is in charge (principal contractor, or the contractor if you are the only one)', 'principal', { multiline: false, ph: 'Name and contact details' }),
        text('Designer or principal designer', 'designer', { multiline: false, ph: 'Name and contact details, if there is one' }),
        h('div', { class: 'input-row' }, text('Start date', 'startDate', { multiline: false, type: 'date' }), text('Finish date', 'endDate', { multiline: false, type: 'date' }))),
      h('h2', null, 'Working together'),
      h('div', { class: 'card card-body' },
        text('Who else is on site, and how to reach them', 'others', { ph: 'Other trades, specialists, labourers' }),
        text('How everyone will be kept up to date', 'updates', { ph: 'e.g. A quick update at the start of each day' }),
        text('Who is responsible for the job running safely', 'responsible', { multiline: false }),
        text('How the work will be supervised', 'supervision')),
      h('h2', null, 'Site rules and welfare'),
      h('div', { class: 'card card-body' },
        text('Site rules', 'rules', { ph: 'e.g. Protective equipment, parking, smoking, restricted areas, mobile phones' }),
        text('Toilet, washing and rest facilities', 'welfare', { ph: 'Where they are and who can use them' }),
        text('Fire and emergency arrangements', 'emergency', { ph: 'Escape route, assembly point, first aid, who to call' })),
      h('h2', null, 'What the client has told you'),
      h('div', { class: 'card card-body' },
        text('Asbestos', 'asbestos', { ph: 'Survey or register checked? Anything known or suspected?' }),
        text('Services and isolation points', 'services', { ph: 'Where power, gas and water can be switched off' })),
      h('h2', null, 'Main dangers on site'),
      h('p', { class: 'hint' }, 'Tick the ones that apply to this job; only ticked ones are printed. Add your own at the bottom.'),
      dangers,
      h('div', { class: 'btn-row' }, addBtn),
      h('h2', null, 'Size of the job'),
      h('div', { class: 'card card-body' },
        h('div', { class: 'input-row' }, size('Working days', 'days', ''), size('Most people on site at once', 'workers', '')),
        size('Total person-days (optional)', 'personDays', 'days x people'),
        warn),
      completeFooter(job, 'cpp')));
  check();
}

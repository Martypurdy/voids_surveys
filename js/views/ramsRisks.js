// RAMS pack › Risks: risk assessments in the simple HSE layout (hazard, who might be harmed and how, controls in place,
// further action, who, when, done), a library you build up, and a short on-the-day "stop and check" card.
import { scheduleSave } from '../db.js';
import { newRisk, newRiskRow, newDynamic } from '../model.js';
import { DYNAMIC_CHECKS, DYNAMIC_OUTCOMES, SAFETY_NOTE } from '../data/hazards.js';
import { saveSet } from '../raLibrary.js';
import { h, textField, toast, confirmDialog } from '../ui.js';
import { sheetEditor, pickHazards, libraryCard } from './ramsUi.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const RISK_COLS = [
  { k: 'hazard', label: 'What are the hazards?', ph: 'Hazard', w: '1.1fr' },
  { k: 'who', label: 'Who might be harmed and how?', ph: 'Who and how', w: '1fr' },
  { k: 'controls', label: 'What is already being done to control the risk?', ph: 'Controls in place', w: '1.5fr' },
  { k: 'action', label: 'What further action is needed?', ph: 'Further action', w: '1.1fr' },
  { k: 'owner', label: 'Who will do it?', ph: 'Name', w: '.7fr' },
  { k: 'when', label: 'By when?', ph: 'Date', w: '.7fr' },
  { k: 'done', label: 'Done', kind: 'check', w: '60px' },
];

export default async function ramsRisks(root, { id }) {
  const job = await loadJobOr404(id);
  const rams = job.rams;
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'ra-list' });
  const library = libraryCard();

  /** Add picked hazards before the empty spare row of a sheet's items. */
  const addRows = (items, rows) => {
    const spare = items.length && ![items[items.length - 1].hazard, items[items.length - 1].who, items[items.length - 1].controls, items[items.length - 1].action].some((t) => String(t || '').trim());
    if (spare) items.pop();
    for (const r of rows) items.push({ ...newRiskRow(), hazard: r.hazard, who: r.who, controls: r.controls, action: r.action || '' });
  };

  const riskCard = (ra) => {
    const summary = h('summary', null, ra.title || 'Risk assessment');
    const sheet = sheetEditor({ job, items: ra.rows, make: newRiskRow, cols: RISK_COLS, onChange: save, removeLabel: 'Remove this hazard' });
    const body = h('div', { class: 'ra-body' },
      h('div', { class: 'card card-body' },
        textField('Title', ra.title, (v) => { ra.title = v; summary.textContent = v || 'Risk assessment'; save(); }, { autocapitalize: 'sentences', placeholder: 'e.g. Replacing a bathroom suite' }),
        h('div', { class: 'input-row' },
          textField('Reference', ra.ref, (v) => { ra.ref = v; save(); }, { placeholder: 'Optional' }),
          textField('Date assessed', ra.date, (v) => { ra.date = v; save(); }, { type: 'date' })),
        textField('Date of next review', ra.reviewDate, (v) => { ra.reviewDate = v; save(); }, { type: 'date' })),
      sheet,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-small btn-primary', onclick: async () => { const rows = await pickHazards(); if (!rows?.length) return; addRows(ra.rows, rows); save(); sheet.refresh(); } }, '+ Add hazards'),
        h('button', { type: 'button', class: 'btn-small', onclick: () => { const s = saveSet(ra.title, ra.rows); if (s) { toast(`Saved “${s.title}” to your library`); library.refresh(); } else toast('Add at least one hazard first'); } }, 'Save to library'),
        h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async () => { if (!(await confirmDialog(`Delete “${ra.title || 'this risk assessment'}”?`, { ok: 'Delete' }))) return; rams.risks.splice(rams.risks.indexOf(ra), 1); for (const m of rams.methods) m.raIds = m.raIds.filter((x) => x !== ra.id); save(); render(); } }, 'Delete')));
    return h('details', { class: 'card ra-card', open: ra.rows.length <= 1 || rams.risks.length === 1 }, summary, body);
  };

  const dynamicCard = (d) => {
    const summary = h('summary', null, `On-the-day check: ${d.task || 'new check'}`);
    const found = sheetEditor({ job, items: d.found, make: newRiskRow, onChange: save, removeLabel: 'Remove this hazard', cols: [{ k: 'hazard', label: 'Hazard found', ph: 'What you spotted', w: '1fr' }, { k: 'controls', label: 'What you did about it', ph: 'Controls', w: '1.5fr' }] });
    const answers = DYNAMIC_CHECKS.map(([key, q]) => {
      const group = h('div', { class: 'segmented dyn-ans', role: 'group', 'aria-label': q });
      const paint = () => group.replaceChildren(...[['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']].map(([v, t]) => h('button', { type: 'button', dataset: { v }, 'aria-pressed': String(d.checks[key] === v), onclick: () => { d.checks[key] = d.checks[key] === v ? '' : v; paint(); save(); } }, t)));
      paint();
      return h('div', { class: 'dyn-q' }, h('span', null, q), group);
    });
    const outcome = h('div', { class: 'segmented dyn-out', role: 'group', 'aria-label': 'Outcome' });
    const paintOutcome = () => outcome.replaceChildren(...DYNAMIC_OUTCOMES.map(([v, t]) => h('button', { type: 'button', dataset: { v }, 'aria-pressed': String(d.outcome === v), onclick: () => { d.outcome = d.outcome === v ? '' : v; paintOutcome(); save(); } }, t)));
    paintOutcome();
    const body = h('div', { class: 'ra-body' },
      h('div', { class: 'card card-body' },
        textField('Task', d.task, (v) => { d.task = v; summary.textContent = `On-the-day check: ${v || 'new check'}`; save(); }, { autocapitalize: 'sentences', placeholder: 'What you are about to do' }),
        h('div', { class: 'input-row' },
          textField('Where', d.location, (v) => { d.location = v; save(); }, { autocapitalize: 'sentences', placeholder: 'Room or area' }),
          textField('Date', d.date, (v) => { d.date = v; save(); }, { type: 'date' }))),
      h('div', { class: 'card card-body dyn-list' }, h('strong', null, 'Stop and check before you start'), answers),
      h('h3', { class: 'mat-title' }, 'Anything found'),
      found,
      h('div', { class: 'card card-body' }, h('span', { class: 'field-label' }, 'Outcome'), outcome,
        textField('Notes', d.notes, (v) => { d.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences' })),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-small', onclick: () => { const s = saveSet(d.task || 'On-the-day check', d.found.map((r) => ({ ...r }))); if (s) { toast(`Saved “${s.title}” to your library`); library.refresh(); } else toast('Add at least one hazard found first'); } }, 'Save hazards to library'),
        h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async () => { if (!(await confirmDialog('Delete this check?', { ok: 'Delete' }))) return; rams.dynamics.splice(rams.dynamics.indexOf(d), 1); save(); render(); } }, 'Delete')));
    return h('details', { class: 'card ra-card', open: true }, summary, body);
  };

  const render = () => {
    list.replaceChildren(
      ...rams.risks.map(riskCard),
      ...rams.dynamics.map(dynamicCard),
      !rams.risks.length && !rams.dynamics.length ? h('p', { class: 'hint' }, 'No risk assessments yet. Add one below – you can start from a list of common hazards and change everything.') : null);
  };
  render();

  const addRisk = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      const ra = newRisk(`Risk assessment ${rams.risks.length + 1}`);
      ra.rows = [];
      const rows = await pickHazards();
      if (rows?.length) addRows(ra.rows, rows);
      if (!ra.rows.length) ra.rows.push(newRiskRow());
      rams.risks.push(ra);
      save();
      render();
      list.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
    },
  }, '+ New risk assessment');
  const addDyn = h('button', { type: 'button', onclick: () => { rams.dynamics.push(newDynamic()); save(); render(); } }, '+ On-the-day check');

  root.append(
    ...jobChrome(job, 'risks'),
    h('div', { class: 'content wide' },
      h('p', { class: 'hint' }, 'Write down the hazards, who could be harmed, what is already controlling the risk, and what more needs doing. Keep it specific to this job. '),
      h('p', { class: 'hint' }, SAFETY_NOTE),
      list,
      h('div', { class: 'btn-row' }, addRisk, addDyn),
      h('h2', null, 'Library'),
      library,
      completeFooter(job, 'risks')));
}

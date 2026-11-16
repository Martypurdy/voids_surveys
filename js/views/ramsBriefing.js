// RAMS pack › Briefing: a record that the people doing the work were briefed on the risk assessments and method
// statements (or a toolbox talk): who, what about, and their signatures.
import { scheduleSave } from '../db.js';
import { newBriefing, newAttendee } from '../model.js';
import { BRIEFING_KINDS } from '../data/hazards.js';
import { h, textField, confirmDialog } from '../ui.js';
import { sheetEditor, pickField } from './ramsUi.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function ramsBriefing(root, { id }) {
  const job = await loadJobOr404(id);
  const rams = job.rams;
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'ra-list' });

  const card = (b) => {
    const summary = h('summary', null, b.subject || 'Briefing');
    const body = h('div', { class: 'ra-body' },
      h('div', { class: 'card card-body' },
        pickField('What was the briefing about?', BRIEFING_KINDS, b.kinds, save),
        textField('Subject', b.subject, (v) => { b.subject = v; summary.textContent = v || 'Briefing'; save(); }, { autocapitalize: 'sentences', placeholder: 'e.g. Replacing the waste trap' }),
        h('div', { class: 'input-row' },
          textField('Date', b.date, (v) => { b.date = v; save(); }, { type: 'date' }),
          textField('Where', b.location, (v) => { b.location = v; save(); }, { autocapitalize: 'sentences' })),
        textField('Given by', b.by, (v) => { b.by = v; save(); }, { autocapitalize: 'words', placeholder: job.surveyor || 'Name' })),
      h('h3', { class: 'mat-title' }, 'Who was briefed'),
      sheetEditor({ job, items: b.attendees, make: newAttendee, onChange: save, removeLabel: 'Remove this person', cols: [{ k: 'name', label: 'Name', ph: 'Name', w: '1fr' }, { k: 'trade', label: 'Trade', ph: 'Trade', w: '.8fr' }, { k: 'company', label: 'Company', ph: 'Company', w: '1fr' }, { k: 'signature', label: 'Signature', kind: 'sign', w: '110px' }] }),
      h('div', { class: 'card card-body' }, textField('Comments or feedback from the team', b.feedback, (v) => { b.feedback = v; save(); }, { multiline: true, autocapitalize: 'sentences' })),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async () => { if (!(await confirmDialog('Delete this briefing?', { ok: 'Delete' }))) return; rams.briefings.splice(rams.briefings.indexOf(b), 1); save(); render(); } }, 'Delete')));
    return h('details', { class: 'card ra-card', open: rams.briefings.length === 1 }, summary, body);
  };
  const render = () => list.replaceChildren(...rams.briefings.map(card), ...(!rams.briefings.length ? [h('p', { class: 'hint' }, 'No briefings recorded yet.')] : []));
  render();

  root.append(
    ...jobChrome(job, 'briefing'),
    h('div', { class: 'content wide' },
      h('p', { class: 'hint' }, 'Before work starts, brief everyone doing it and check they understand. Record who was there and have them sign.'),
      list,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn-primary', onclick: () => { rams.briefings.push(newBriefing()); save(); render(); list.lastElementChild?.scrollIntoView?.({ block: 'nearest' }); } }, '+ New briefing')),
      completeFooter(job, 'briefing')));
}

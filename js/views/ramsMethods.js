// RAMS pack › Methods: method statements – how a task will be done safely, step by step. Each one points at the
// risk assessments it goes with. Tasks copied from a repair survey can be turned into method statements in one tap.
import { scheduleSave } from '../db.js';
import { newMethod, newPerson, newStep, newTool } from '../model.js';
import { PPE, PERMITS, SAFETY_NOTE } from '../data/hazards.js';
import { h, textField, toast, confirmDialog } from '../ui.js';
import { sheetEditor, pickField, yesNoField } from './ramsUi.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function ramsMethods(root, { id }) {
  const job = await loadJobOr404(id);
  const rams = job.rams;
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'ra-list' });
  const tasksBox = h('div', { class: 'card card-body' });

  const tf = (m, label, k, opts = {}) => textField(label, m[k], (v) => { m[k] = v; save(); }, { autocapitalize: 'sentences', ...opts });

  const card = (m) => {
    const summary = h('summary', null, m.title || 'Method statement');
    const selectedTitles = rams.risks.filter((r) => m.raIds.includes(r.id)).map((r) => r.title || 'Risk assessment');
    const raPick = rams.risks.length
      ? pickField('Goes with these risk assessments', rams.risks.map((r) => r.title || 'Risk assessment'), selectedTitles, () => {
        m.raIds = rams.risks.filter((r) => selectedTitles.includes(r.title || 'Risk assessment')).map((r) => r.id);
        save();
      }, { empty: 'Tap to choose' })
      : h('p', { class: 'hint' }, 'Add a risk assessment on the Risks tab first, then link it here.');
    const dustControls = tf(m, 'Controls for dust and fumes', 'dustControls', { multiline: true, placeholder: 'e.g. Cut outside, use extraction, wear a mask' });
    const hazControls = tf(m, 'Controls for hazardous materials', 'hazControls', { multiline: true, placeholder: 'e.g. Where the data sheet is kept and the safe use rules' });
    const showDust = () => { dustControls.hidden = m.dust !== 'yes'; };
    const showHaz = () => { hazControls.hidden = m.hazmat !== 'yes'; };
    showDust();
    showHaz();
    const body = h('div', { class: 'ra-body' },
      h('div', { class: 'card card-body' },
        textField('Title', m.title, (v) => { m.title = v; summary.textContent = v || 'Method statement'; save(); }, { autocapitalize: 'sentences', placeholder: 'e.g. Replace kitchen waste trap' }),
        tf(m, 'Reference', 'ref', { placeholder: 'Optional' }),
        tf(m, 'Description of the work', 'description', { multiline: true }),
        raPick,
        h('div', { class: 'input-row' }, tf(m, 'Starts', 'start', { type: 'date' }), tf(m, 'How long', 'duration', { placeholder: 'e.g. 2 days' })),
        h('div', { class: 'input-row' }, tf(m, 'Number of workers', 'workers', { inputmode: 'decimal' }), tf(m, 'Areas to be worked in', 'areas', { placeholder: 'Rooms or areas' }))),
      h('h3', { class: 'mat-title' }, 'People doing the work'),
      sheetEditor({ job, items: m.personnel, make: newPerson, onChange: save, removeLabel: 'Remove this person', cols: [{ k: 'name', label: 'Name', ph: 'Name', w: '1fr' }, { k: 'role', label: 'Role', ph: 'Role', w: '1fr' }, { k: 'competence', label: 'Training or competence', ph: 'Cards, certificates, experience', w: '1.4fr' }] }),
      h('h3', { class: 'mat-title' }, 'Emergency arrangements'),
      h('div', { class: 'card card-body' },
        tf(m.emergency, 'Fire and getting out', 'fire', { multiline: true }),
        tf(m.emergency, 'First aid', 'firstAid', { multiline: true }),
        tf(m.emergency, 'Spills and pollution', 'spill', { multiline: true }),
        tf(m.emergency, 'Anything else', 'other', { multiline: true })),
      h('h3', { class: 'mat-title' }, 'Protection, dust and materials'),
      h('div', { class: 'card card-body' },
        pickField('Protective equipment (PPE)', PPE, m.ppe, save),
        tf(m, 'Other protective equipment', 'ppeOther'),
        yesNoField('Will the work create dust or fumes?', m.dust, (v) => { m.dust = v; save(); showDust(); }),
        dustControls,
        yesNoField('Will any hazardous materials be used?', m.hazmat, (v) => { m.hazmat = v; save(); showHaz(); }),
        yesNoField('Are the safety data sheets (COSHH) to hand?', m.coshh, (v) => { m.coshh = v; save(); }),
        hazControls),
      h('h3', { class: 'mat-title' }, 'Permits'),
      h('div', { class: 'card card-body' },
        pickField('Permits needed', PERMITS, m.permits, save, { empty: 'None' }),
        tf(m, 'Other permit', 'permitOther'),
        tf(m, 'Who issues them', 'permitBy')),
      h('h3', { class: 'mat-title' }, 'Safe method of work, step by step'),
      sheetEditor({ job, items: m.steps, make: newStep, onChange: save, photos: true, numbered: true, removeLabel: 'Remove this step', cols: [{ k: 'text', label: 'What to do, and how to do it safely', ph: 'e.g. Isolate the water and drain the pipe', w: '1fr' }] }),
      h('h3', { class: 'mat-title' }, 'Tools, plant and equipment'),
      sheetEditor({ job, items: m.tools, make: newTool, onChange: save, removeLabel: 'Remove this item', cols: [{ k: 'type', label: 'Type', ph: 'e.g. Stepladder', w: '1fr' }, { k: 'details', label: 'Checks, tests or certificates', ph: 'e.g. Checked before use', w: '1.4fr' }] }),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async () => { if (!(await confirmDialog(`Delete “${m.title || 'this method statement'}”?`, { ok: 'Delete' }))) return; rams.methods.splice(rams.methods.indexOf(m), 1); save(); render(); } }, 'Delete this method statement')));
    return h('details', { class: 'card ra-card', open: rams.methods.length === 1 }, summary, body);
  };

  const renderTasks = () => {
    tasksBox.hidden = !rams.tasks.length;
    tasksBox.replaceChildren(
      h('strong', null, 'From the repair survey'),
      h('p', { class: 'hint' }, 'Tap a repair to start a method statement for it.'),
      h('div', { class: 'task-chips' }, rams.tasks.map((t) => h('button', {
        type: 'button',
        class: 'btn-small',
        onclick: () => {
          const m = newMethod(t.location || t.text, [t.location, t.fix].filter(Boolean).join(': '));
          rams.methods.push(m);
          save();
          render();
          toast('Method statement started');
        },
      }, `+ ${t.text}`))));
  };

  const render = () => {
    list.replaceChildren(...rams.methods.map(card), ...(!rams.methods.length ? [h('p', { class: 'hint' }, 'No method statements yet.')] : []));
    renderTasks();
  };
  render();

  root.append(
    ...jobChrome(job, 'methods'),
    h('div', { class: 'content wide' },
      h('p', { class: 'hint' }, 'A method statement says how a task will be done safely. Write it after the risk assessment, and link the two.'),
      h('p', { class: 'hint' }, SAFETY_NOTE),
      tasksBox,
      list,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn-primary', onclick: () => { rams.methods.push(newMethod()); save(); render(); list.lastElementChild?.scrollIntoView?.({ block: 'nearest' }); } }, '+ New method statement')),
      completeFooter(job, 'methods')));
}

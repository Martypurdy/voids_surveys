// RAMS pack › Address tab extras: the job description and "Start from a repair survey", which copies the tenant or
// contact, job number, the brief and the repairs from a repair survey at the same property.
import { getProperty, getJob } from '../db.js';
import { fmtDate } from '../model.js';
import { usedRows } from '../repair.js';
import { h, textField, toast, choose, confirmDialog } from '../ui.js';

export function ramsDetails(job, save, onChange = () => {}) {
  const r = job.rams;
  const desc = textField('Job description', r.description, (v) => { r.description = v; save(); }, { multiline: true, autocapitalize: 'sentences', placeholder: 'What the work is, in a sentence or two' });
  const area = desc.querySelector('textarea');
  area.rows = 3;
  const company = textField('Company', r.company, (v) => { r.company = v; save(); }, { autocapitalize: 'words', placeholder: 'Your company or team (printed on the documents)' });

  const status = h('p', { class: 'hint' });
  const paintStatus = () => {
    status.textContent = r.sourceId
      ? `Started from a repair survey. ${r.tasks.length} repair${r.tasks.length === 1 ? '' : 's'} are ready to turn into method statements on the Methods tab.`
      : 'At an address with a repair survey? Copy its details here instead of typing them again.';
  };
  paintStatus();

  const start = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      const prop = job.propertyId ? await getProperty(job.propertyId) : null;
      const surveys = (prop?.entries || []).filter((e) => e.form === 'repair');
      if (!surveys.length) return toast('No repair survey at this property yet. Start one under Property inspection.');
      let pick = surveys[0];
      if (surveys.length > 1) {
        const id = await choose({
          title: 'Which repair survey?',
          buttons: [...surveys.map((e) => ({ label: `${e.nature || 'Repair survey'} · ${fmtDate(e.updated)}`, value: e.id })), { label: 'Cancel', value: null }],
        });
        if (!id) return;
        pick = surveys.find((e) => e.id === id);
      }
      const src = await getJob(pick.id);
      if (!src?.repair) return toast('That survey could not be opened');
      if (r.description.trim() && !(await confirmDialog('Replace the job description with the one from the repair survey?', { title: 'Replace description?', ok: 'Replace', danger: false }))) return;
      const rows = usedRows(src.repair);
      const lines = rows.map((row, i) => `${i + 1}. ${[row.location, row.fix].filter((x) => x && x.trim()).map((x) => x.trim().replace(/\s+/g, ' ')).join(' – ')}`);
      r.description = [src.repair.brief?.trim(), lines.join('\n')].filter(Boolean).join('\n\n');
      if (!r.customer.trim()) r.customer = src.repair.customer || '';
      if (!r.customerAddress.text.trim() && !r.customerAddress.postcode.trim()) r.customerAddress = { ...src.repair.customerAddress };
      if (!r.ref.trim()) r.ref = src.repair.ref || '';
      r.tasks = rows.map((row) => ({ id: row.id, text: [row.location, row.fix].filter((x) => x && x.trim()).map((x) => x.trim().replace(/\s+/g, ' ')).join(' – '), location: row.location || '', fix: row.fix || '' }));
      r.sourceId = src.id;
      area.value = r.description;
      save();
      paintStatus();
      onChange();
      toast(`Copied from the repair survey (${rows.length} repair${rows.length === 1 ? '' : 's'})`);
    },
  }, 'Start from a repair survey');

  return h('div', { class: 'card card-body ref-box' }, company, desc, h('div', { class: 'btn-row' }, start), status);
}

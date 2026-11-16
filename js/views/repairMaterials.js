// Property repair survey › Materials: a running list of what the repairs need. Lines sent across from the Repairs
// tab ("→ Materials") say which repair they came from; add your own too. Prices and costing come later (Phase 4).
import { scheduleSave } from '../db.js';
import { newRepairMaterial } from '../model.js';
import { rowNumbers, materialSource } from '../repair.js';
import { h } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function repairMaterials(root, { id }) {
  const job = await loadJobOr404(id);
  const rep = job.repair;
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'rep-mats' });

  const line = (m) => {
    const src = materialSource(rep, m.rowId, rowNumbers(rep));
    const input = (k, ph, label, extra = {}) => h('input', { type: 'text', value: m[k], placeholder: ph, 'aria-label': label, oninput: (e) => { m[k] = e.target.value; save(); }, ...extra });
    return h('div', { class: 'rep-mat' },
      h('span', { class: 'rep-mat-src' }, src || 'Added by you'),
      input('item', 'Material', 'Material', { autocapitalize: 'sentences' }),
      input('qty', 'Qty', 'Quantity', { inputmode: 'decimal' }),
      input('unit', 'Unit', 'Unit'),
      h('button', { type: 'button', class: 'defect-remove', 'aria-label': 'Remove this material', onclick: () => { rep.materials.splice(rep.materials.indexOf(m), 1); save(); render(); } }, '−'));
  };
  const render = () => {
    list.replaceChildren(...(rep.materials.length
      ? rep.materials.map(line)
      : [h('p', { class: 'hint' }, 'Nothing here yet. On the Repairs tab, tap “→ Materials” on a repair, or add a line below.')]));
  };
  render();

  root.append(
    ...jobChrome(job, 'repmat'),
    h('div', { class: 'content' },
      h('p', { class: 'hint' }, 'Everything the repairs need, as one list. It goes in the report after the schedule of repairs.'),
      list,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn-primary', onclick: () => { rep.materials.push(newRepairMaterial('')); save(); render(); list.querySelector('.rep-mat:last-child input[aria-label="Material"]')?.focus(); } }, '+ Add material')),
      completeFooter(job, 'repmat')));
}

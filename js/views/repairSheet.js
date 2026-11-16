// Property repair survey › Repairs: the schedule of repairs, as an open sheet. One row per repair: location /
// element, current condition, suggested causation, recommended rectification and photos. Wide screens show it as a
// table; a phone shows each row as a card. There is always an empty row at the bottom (typing in it, or taking a
// photo, adds the next), and "→ Materials" sends what a row needs across to the Materials tab.
import { scheduleSave } from '../db.js';
import { newRepairRow, newRepairMaterial } from '../model.js';
import { isBlankRow, rowNumbers } from '../repair.js';
import { h, toast, choose, confirmDialog } from '../ui.js';
import { photoButton } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const COLS = [
  ['location', 'Location / element', 'e.g. Kitchen, under sink'],
  ['condition', 'Current condition', 'What you can see'],
  ['causation', 'Suggested causation', 'Likely cause'],
  ['fix', 'Recommended rectification', 'What should be done'],
];

export default async function repairSheet(root, { id }) {
  const job = await loadJobOr404(id);
  const rep = job.repair;
  const save = () => scheduleSave(job);
  const sheet = h('div', { class: 'rep-sheet' });
  let numberEls = new Map(); // row id -> its number badge

  /** Keep one empty row at the bottom. */
  const ensureSpare = () => {
    const last = rep.rows[rep.rows.length - 1];
    if (!last || !isBlankRow(last)) {
      rep.rows.push(newRepairRow());
      return true;
    }
    return false;
  };
  const refreshNumbers = () => {
    const nums = rowNumbers(rep);
    for (const [rowId, el] of numberEls) el.textContent = nums.has(rowId) ? String(nums.get(rowId)) : '+';
  };

  /** Ask what the row needs, and put it on the Materials tab (linked to the row). */
  const toMaterials = async (row) => {
    const item = h('input', { type: 'text', placeholder: 'e.g. Plasterboard 12.5 mm', 'aria-label': 'Material', autocapitalize: 'sentences' });
    const qty = h('input', { type: 'text', inputmode: 'decimal', placeholder: '1', 'aria-label': 'Quantity' });
    const unit = h('input', { type: 'text', placeholder: 'each, m², m…', 'aria-label': 'Unit' });
    const n = rowNumbers(rep).get(row.id);
    const v = await choose({
      title: `→ Materials${n ? ` (repair ${n})` : ''}`,
      content: h('div', { class: 'rep-mat-form' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Material'), item),
        h('div', { class: 'input-row' },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Quantity'), qty),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Unit'), unit))),
      buttons: [{ label: 'Add to Materials', value: 'ok', class: 'btn-primary btn-big' }, { label: 'Cancel', value: null }],
    });
    if (v !== 'ok') return;
    if (!item.value.trim()) return toast('Type the material first');
    const m = newRepairMaterial(row.id);
    m.item = item.value.trim();
    m.qty = qty.value.trim();
    m.unit = unit.value.trim();
    rep.materials.push(m);
    save();
    toast(`Added “${m.item}” to Materials`);
  };

  const rowEl = (row) => {
    const num = h('span', { class: 'rep-num', 'aria-hidden': 'true' });
    numberEls.set(row.id, num);
    const change = () => {
      save();
      if (row === rep.rows[rep.rows.length - 1] && !isBlankRow(row)) { ensureSpare(); sheet.append(rowEl(rep.rows[rep.rows.length - 1])); }
      refreshNumbers();
    };
    const cells = COLS.map(([k, label, ph]) => {
      const ta = h('textarea', {
        rows: 2,
        placeholder: ph,
        autocapitalize: 'sentences',
        'aria-label': label,
        oninput: (e) => { row[k] = e.target.value; ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`; change(); },
      }, row[k]);
      return h('label', { class: 'rep-cell' }, h('span', { class: 'rep-lbl' }, label), ta);
    });
    const photos = photoButton(job, row.photos, change, { label: 'Photos' });
    const remove = h('button', {
      type: 'button',
      class: 'defect-remove',
      'aria-label': 'Remove this repair',
      onclick: async () => {
        if (!isBlankRow(row) && !(await confirmDialog('Remove this repair and its photos from the list?', { ok: 'Remove' }))) return;
        rep.rows.splice(rep.rows.indexOf(row), 1);
        ensureSpare();
        save();
        render();
      },
    }, '−');
    const toMat = h('button', { type: 'button', class: 'btn-small rep-tomat', onclick: () => toMaterials(row) }, '→ Materials');
    const el = h('div', { class: 'rep-row', dataset: { id: row.id } },
      num,
      cells,
      h('div', { class: 'rep-cell rep-photos' }, h('span', { class: 'rep-lbl' }, 'Images'), photos),
      h('div', { class: 'rep-actions' }, toMat, remove));
    requestAnimationFrame(() => el.querySelectorAll('textarea').forEach((t) => { t.style.height = 'auto'; if (t.value) t.style.height = `${Math.min(t.scrollHeight, 220)}px`; }));
    return el;
  };

  const render = () => {
    numberEls = new Map();
    ensureSpare();
    sheet.replaceChildren(
      h('div', { class: 'rep-head', 'aria-hidden': 'true' }, h('span', null, 'No.'), COLS.map(([, label]) => h('span', null, label)), h('span', null, 'Images'), h('span', null, '')),
      ...rep.rows.map(rowEl));
    refreshNumbers();
  };
  render();

  root.append(
    ...jobChrome(job, 'repairs'),
    h('div', { class: 'content wide' },
      h('p', { class: 'hint' }, 'One row per repair. Photograph each with the 📷 button (hold it to view or delete). “→ Materials” puts what the repair needs on the Materials tab.'),
      sheet,
      completeFooter(job, 'repairs')));
}

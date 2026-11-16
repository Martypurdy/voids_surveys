// Calculation › Materials: the running list of what the calculation says to buy. Edit it, add your own lines, and send it to
// the materials list of a repair survey or costing at the same property. Prices and links come in Phase 4.
import { scheduleSave, getProperty, getJob, saveJob } from '../db.js';
import { newCalcLine, newRepairMaterial, newMaterialLine, fmtDate } from '../model.js';
import { h, toast, choose } from '../ui.js';
import { sheetEditor } from './ramsUi.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const used = (m) => [m.item, m.qty, m.unit].some((t) => String(t ?? '').trim());

export default async function calcMaterials(root, { id }) {
  const job = await loadJobOr404(id);
  const c = job.calc;
  const save = () => scheduleSave(job);
  const sheet = sheetEditor({
    job, items: c.materials, make: newCalcLine, onChange: save, removeLabel: 'Remove this line',
    cols: [{ k: 'item', label: 'Material', ph: 'What to buy', w: '2fr' }, { k: 'qty', label: 'Quantity', ph: '1', w: '.6fr' }, { k: 'unit', label: 'Unit', ph: 'each, bags, tonnes…', w: '.8fr' }],
  });

  const sendTo = async () => {
    const lines = c.materials.filter(used);
    if (!lines.length) return toast('Nothing in the list yet');
    const prop = job.propertyId ? await getProperty(job.propertyId) : null;
    const targets = (prop?.entries || []).filter((e) => e.id !== job.id && ['repair', 'price'].includes(e.form));
    if (!targets.length) return toast('No repair survey or costing at this property to send them to');
    const pick = await choose({
      title: 'Send the list to…',
      message: `${lines.length} line${lines.length === 1 ? '' : 's'} will be added to its materials list.`,
      buttons: [...targets.map((e) => ({ label: `${e.form === 'repair' ? '🛠️ Repair survey' : '🧮 Costing'} · ${e.nature || ''} · ${fmtDate(e.updated)}`.replace(' ·  ·', ' ·'), value: e.id })), { label: 'Cancel', value: null }],
    });
    if (!pick) return;
    const dest = await getJob(pick);
    if (!dest) return toast('That entry could not be opened');
    for (const l of lines) {
      if (dest.form === 'repair') {
        const m = newRepairMaterial('');
        Object.assign(m, { item: l.item, qty: l.qty, unit: l.unit });
        dest.repair.materials.push(m);
      } else {
        const m = newMaterialLine();
        Object.assign(m, { item: l.item, qty: l.qty, unit: l.unit });
        dest.pricing.materials.push(m);
      }
    }
    await saveJob(dest);
    toast(`Sent ${lines.length} line${lines.length === 1 ? '' : 's'}`);
  };

  root.append(
    ...jobChrome(job, 'calcmat'),
    h('div', { class: 'content wide' },
      h('p', { class: 'hint' }, 'Press “Add to materials list” on the Calculate tab to put the results here. Change the lines freely, or add your own.'),
      sheet,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn-primary', onclick: sendTo }, '➡ Send to a repair survey or costing')),
      completeFooter(job, 'calcmat')));
}

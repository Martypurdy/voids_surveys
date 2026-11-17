// Calculation › Calculate: the calculator itself. Type the sizes and the results update as you go; the formulas and
// assumptions are shown so they can be checked; wastage can be added as a percentage or a fixed extra; and the results can
// be added to the Materials tab. The last sizes and settings used are remembered for next time.
import { scheduleSave } from '../db.js';
import { newCalcLine } from '../model.js';
import { calcByKey, runCalc, remember } from '../calc/calculators.js';
import { h, textField, selectField, toast } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function calcView(root, { id }) {
  const job = await loadJobOr404(id);
  const c = job.calc;
  const spec = calcByKey(c.kind);
  const save = () => {
    scheduleSave(job);
    remember(c.kind, { inputs: c.inputs, assumptions: c.assumptions, wastage: c.wastage });
  };

  const results = h('div', { class: 'card card-body calc-results', 'aria-live': 'polite' });
  const how = h('details', { class: 'card calc-how' });
  const addBtn = h('button', { type: 'button', class: 'btn-primary btn-big btn-block', onclick: () => addToMaterials() }, '＋ Add to materials list');
  let last = null;

  const fields = [];
  const updateVisibility = () => {
    for (const { input, el } of fields) {
      if (!input.showIf) continue;
      el.hidden = !Object.entries(input.showIf).every(([k, v]) => c.inputs[k] === v);
    }
  };

  const inputField = (i) => {
    const label = i.unit ? `${i.label} (${i.unit})` : i.label;
    if (i.kind === 'select') {
      return selectField(label, c.inputs[i.k], i.options, (v) => { c.inputs[i.k] = v; save(); updateVisibility(); refresh(); }, { placeholder: null });
    }
    const f = textField(label, c.inputs[i.k], (v) => { c.inputs[i.k] = v; save(); refresh(); }, { inputmode: i.kind === 'frac' ? 'text' : 'decimal', placeholder: i.hint || (i.opt ? 'Optional' : '') });
    return f;
  };
  const inputBox = h('div', { class: 'card card-body calc-inputs' }, spec.inputs.flatMap((i) => {
    const el = inputField(i);
    fields.push({ input: i, el });
    return i.heading ? [h('h3', { class: 'mat-title calc-sub' }, i.heading), el] : [el];
  }));

  // ----- wastage -----
  let wasteBox = null;
  if (spec.waste !== false) {
    const wasteInput = textField('Amount', c.wastage.value, (v) => { c.wastage.value = v; save(); refresh(); }, { inputmode: 'decimal' });
    const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Wastage' });
    const unitLabel = () => (c.wastage.mode === 'extra' ? `Extra ${spec.mainUnit || 'quantity'}` : 'Wastage (%)');
    const paint = () => {
      seg.replaceChildren(...[['pct', 'Add a percentage'], ['extra', 'Add a fixed extra']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(c.wastage.mode === v), onclick: () => { c.wastage.mode = v; save(); paint(); refresh(); } }, t)));
      wasteInput.querySelector('.field-label').textContent = unitLabel();
    };
    wasteBox = h('div', { class: 'card card-body' },
      h('strong', null, 'Wastage'),
      seg, wasteInput,
      h('p', { class: 'hint' }, 'A percentage is added to everything. A fixed extra is added to the main item only (' + (spec.mainUnit || 'the main quantity') + '). Things bought in packs are rounded up to whole packs afterwards.'));
    paint();
  }

  // ----- assumptions -----
  const assumptions = spec.assumptions.length
    ? h('details', { class: 'card calc-assume' },
      h('summary', null, h('span', { class: 'summary-title' }, 'Assumptions – change them to match your product')),
      h('div', { class: 'card-body' }, spec.assumptions.map((s) => textField(s.unit ? `${s.label} (${s.unit})` : s.label, c.assumptions[s.k], (v) => { c.assumptions[s.k] = v; save(); refresh(); }, { inputmode: 'decimal', placeholder: s.def }))))
    : null;

  function refresh() {
    const out = runCalc(c.kind, c.inputs, c.assumptions, c.wastage);
    last = out;
    if (!out.ok) {
      results.replaceChildren(h('strong', null, 'Results'), h('p', { class: 'hint' }, out.error));
      how.hidden = true;
      addBtn.hidden = true;
      return;
    }
    results.replaceChildren(
      h('strong', null, 'Results'),
      h('div', { class: 'calc-grid' }, out.results.map((r) => h('div', { class: r.total ? 'calc-res calc-res-total' : 'calc-res' }, h('span', { class: 'calc-res-label' }, r.label), h('span', { class: 'calc-res-val' }, r.value, r.unit ? h('small', null, ` ${r.unit}`) : null)))));
    how.hidden = false;
    how.replaceChildren(h('summary', null, h('span', { class: 'summary-title' }, 'How this is worked out')), h('ol', { class: 'calc-steps' }, out.steps.map((t) => h('li', null, t))), h('p', { class: 'hint' }, 'These are estimates. Check quantities against the product labels and the real job.'));
    addBtn.hidden = !out.lines.length;
  }

  function addToMaterials() {
    if (!last?.ok || !last.lines.length) return;
    while (c.materials.length && ![c.materials.at(-1).item, c.materials.at(-1).qty, c.materials.at(-1).unit].some((t) => String(t ?? '').trim())) c.materials.pop(); // drop the empty spare row first
    for (const l of last.lines) {
      const m = newCalcLine();
      m.item = l.item;
      m.qty = String(l.qty);
      m.unit = l.unit;
      c.materials.push(m);
    }
    scheduleSave(job);
    toast(`Added ${last.lines.length} line${last.lines.length === 1 ? '' : 's'} to the Materials tab`);
  }

  updateVisibility();
  refresh();
  root.append(
    ...jobChrome(job, 'calculate'),
    h('div', { class: 'content wide calc-page' },
      h('h2', null, `${spec.emoji} ${spec.title}`),
      h('p', { class: 'hint' }, spec.text),
      h('div', { class: 'calc-cols' },
        h('div', null, inputBox, wasteBox, assumptions),
        h('div', null, results, how, addBtn)),
      completeFooter(job, 'calculate')));
}

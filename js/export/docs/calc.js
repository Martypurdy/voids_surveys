// A calculation (Calculators button) as Word, PDF and Excel: your sizes, the results, how they were worked out, the
// assumptions, the wastage and the materials list. Word and PDF share one description (calcModel).
import { textLines, addressLines, fmtDate, formOf } from '../../model.js';
import { calcByKey, runCalc, fmt } from '../../calc/calculators.js';

const ACCENT = '1F4E5C';
const has = (v) => String(v ?? '').trim() !== '';
const NOTE = 'Estimates only: check quantities against the product labels and the real job.';

function pairsToRows(pairs) {
  const items = pairs.filter(([, v]) => has(v));
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items[i + 1] ? [...items[i], ...items[i + 1]] : [...items[i]]);
  return rows;
}

function collect(job) {
  const c = job.calc;
  const spec = calcByKey(c.kind);
  const out = runCalc(c.kind, c.inputs, c.assumptions, c.wastage);
  const optionLabel = (i) => (i.kind === 'select' ? i.options.find(([v]) => v === c.inputs[i.k])?.[1] ?? c.inputs[i.k] : c.inputs[i.k]);
  const visible = (i) => !i.showIf || Object.entries(i.showIf).every(([k, v]) => c.inputs[k] === v);
  const inputs = spec.inputs.filter(visible).map((i) => [i.unit ? `${i.label} (${i.unit})` : i.label, optionLabel(i)]).filter(([, v]) => has(v));
  const assumptions = spec.assumptions.map((s) => [s.label, `${has(c.assumptions[s.k]) ? c.assumptions[s.k] : s.def}${s.unit ? ` ${s.unit}` : ''}`]);
  const wasteText = spec.waste === false ? '' : c.wastage.mode === 'extra' ? `Extra ${c.wastage.value || 0} ${spec.mainUnit || ''} on the main item` : `${c.wastage.value || 0}% added`;
  const cust = [c.customer, addressLines(c.customerAddress || {}).join(', ')].filter(Boolean).join(' - ');
  return { c, spec, out, inputs, assumptions, wasteText, cust, where: textLines(job.address).join(', '), mats: c.materials.filter((m) => [m.item, m.qty, m.unit].some(has)) };
}

export function calcModel(job) {
  const d = collect(job);
  const sections = [];
  sections.push({ paras: [NOTE] });
  sections.push({ band: 'CALCULATION', grid: pairsToRows([['Calculator', d.spec.title], ['Date', fmtDate(job.created.slice(0, 10))], ['Property address', d.where], ['Job number', d.c.ref], ['Client or tenant', d.cust], ['Prepared by', job.surveyor]]) });
  if (d.inputs.length || d.wasteText) sections.push({ band: 'YOUR SIZES AND SETTINGS', grid: [...pairsToRows(d.inputs), ...(d.wasteText ? [['Wastage', d.wasteText]] : [])] });
  if (d.out.ok) {
    sections.push({ band: 'RESULTS', table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Result', w: 4 }, { title: 'Amount', w: 2, align: 'right' }, { title: 'Unit', w: 2 }], rows: d.out.results.map((r) => [r.label, r.value, r.unit]) } });
    sections.push({ band: 'HOW THIS WAS WORKED OUT' });
    sections.push({ paras: d.out.steps.map((t, i) => `${i + 1}.  ${t}`) });
  } else {
    sections.push({ band: 'RESULTS', grid: [['Note', d.out.error]] });
  }
  if (d.assumptions.length) sections.push({ band: 'ASSUMPTIONS USED', grid: pairsToRows(d.assumptions) });
  if (d.mats.length) {
    sections.push({ band: 'MATERIALS LIST', table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Material', w: 5 }, { title: 'Quantity', w: 1.4, align: 'right' }, { title: 'Unit', w: 1.6 }], rows: d.mats.map((m) => [m.item, m.qty, m.unit]) } });
  }
  return { title: formOf(job).pdfTitle.toUpperCase(), subtitle: d.where || 'No address recorded', landscape: false, accent: ACCENT, footer: d.where || formOf(job).title, sections };
}

export function calcWorkbook(job) {
  const d = collect(job);
  const head = (labels) => labels.map((v) => ({ v, s: 'headTeal' }));
  const label = { font: 1, fill: 3, border: 1, wrap: 1, v: 'top' };
  const rows = [[{ v: formOf(job).pdfTitle.toUpperCase(), s: 'title' }], [{ v: NOTE, s: 'note' }], []];
  const kv = (k, v) => rows.push([{ v: k, s: label }, { v: v ?? '', s: 'cell' }]);
  rows.push(head(['CALCULATION', '']));
  for (const [k, v] of [['Calculator', d.spec.title], ['Date', fmtDate(job.created.slice(0, 10))], ['Property address', d.where], ['Job number', d.c.ref], ['Client or tenant', d.cust], ['Prepared by', job.surveyor]]) if (has(v)) kv(k, v);
  rows.push([], head(['YOUR SIZES AND SETTINGS', '']));
  for (const [k, v] of d.inputs) kv(k, v);
  if (d.wasteText) kv('Wastage', d.wasteText);
  rows.push([], head(['RESULT', 'AMOUNT', 'UNIT']));
  if (d.out.ok) for (const r of d.out.results) rows.push([{ v: r.label, s: 'cell' }, { v: Number.isFinite(Number(r.value)) && r.value !== '' ? Number(r.value) : r.value, s: 'cell' }, { v: r.unit, s: 'cell' }]);
  else rows.push([{ v: d.out.error, s: 'cell' }]);
  if (d.out.ok) { rows.push([], head(['HOW THIS WAS WORKED OUT', ''])); d.out.steps.forEach((t, i) => rows.push([{ v: i + 1, s: 'cell' }, { v: t, s: 'cell' }])); }
  if (d.assumptions.length) { rows.push([], head(['ASSUMPTIONS USED', ''])); for (const [k, v] of d.assumptions) kv(k, v); }
  const sheets = [{ name: 'Calculation', cols: [{ w: 46 }, { w: 90 }, { w: 14 }], rows, hideGrid: true, landscape: false }];
  if (d.mats.length) {
    const m = [head(['Material', 'Quantity', 'Unit'])];
    for (const x of d.mats) m.push([{ v: x.item, s: 'cell' }, { v: Number.isFinite(Number(x.qty)) && has(x.qty) ? Number(x.qty) : x.qty, s: 'cell' }, { v: x.unit, s: 'cell' }]);
    sheets.push({ name: 'Materials', cols: [{ w: 56 }, { w: 12 }, { w: 18 }], rows: m, freeze: { row: 1 }, landscape: false });
  }
  void fmt;
  return { sheets };
}

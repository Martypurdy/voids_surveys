// Materials & labour costing › Materials / Labour tabs: a spreadsheet – one line per
// item, every field on the row, totals worked out as you type. Starts with at least
// MIN_LINES lines; "+ Add line" (or Enter on the last line) adds another. Empty lines
// are ignored in totals and the PDF.
import { scheduleSave } from '../db.js';
import { newMaterialLine, newLabourLine } from '../model.js';
import { lineTotals, sheetTotals, gbp, isBlankLine, VAT_MODES, LABOUR_BASIS, UNIT_SUGGESTIONS } from '../pricing.js';
import { h, toast } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const MATERIAL_COLS = [
  { k: 'item', label: 'Item', w: 190, ph: 'e.g. Plasterboard 12.5mm', first: true },
  { k: 'supplier', label: 'Supplier', w: 120, ph: 'Supplier' },
  { k: 'code', label: 'Code / SKU', w: 110, ph: 'Code' },
  { k: 'qty', label: 'Qty', w: 62, num: true, ph: '1' },
  { k: 'unit', label: 'Unit', w: 86, list: true, ph: 'each' },
  { k: 'price', label: 'Price £', w: 86, num: true, ph: '0.00' },
  { k: 'markup', label: 'Markup', w: 104, markup: true },
];
const LABOUR_COLS = [
  { k: 'item', label: 'Labour', w: 190, ph: 'e.g. Plasterer', first: true },
  { k: 'basis', label: 'Charged', w: 116, select: LABOUR_BASIS },
  { k: 'qty', label: 'Qty', w: 62, num: true, ph: '1' },
  { k: 'rate', label: 'Rate £', w: 86, num: true, ph: '0.00' },
  { k: 'markup', label: 'Markup', w: 104, markup: true },
];
const QTY_HINT = { item: 'items', hour: 'hours', day: 'days' };
const MIN_LINES = 4;

/** VAT mode buttons (shared by Materials, Labour and Totals). */
export function vatToggle(p, onChange) {
  const wrap = h('div', { class: 'segmented vat-toggle', role: 'group', 'aria-label': 'Prices entered' });
  const render = () => wrap.replaceChildren(...VAT_MODES.map(([v, label]) => h('button', {
    type: 'button',
    'aria-pressed': String(p.vat === v),
    onclick: () => { p.vat = v; render(); onChange(); },
  }, label)));
  render();
  return wrap;
}

/** Materials £… · Labour £… · Total £… bar. Call .update() after changes. */
export function runningTotal(p) {
  const el = h('div', { class: 'run-total', role: 'status', 'aria-live': 'polite' });
  el.update = () => {
    const t = sheetTotals(p);
    const vatNote = p.vat === 'none' ? 'no VAT' : `inc VAT ${gbp(t.vat)}`;
    el.replaceChildren(
      h('span', null, 'Materials ', h('b', null, gbp(t.materials.total))),
      h('span', null, 'Labour ', h('b', null, gbp(t.labour.total))),
      h('span', { class: 'run-grand' }, 'Total ', h('b', null, gbp(t.gross)), h('small', null, ` (${vatNote})`)));
  };
  el.update();
  return el;
}

export default async function costSheet(root, { id, kind }) {
  const job = await loadJobOr404(id);
  const p = job.pricing;
  const mat = kind === 'materials';
  const section = mat ? 'costs' : 'labour';
  const COLS = mat ? MATERIAL_COLS : LABOUR_COLS;
  const lines = p[kind];
  const save = () => scheduleSave(job);

  const units = h('datalist', { id: 'unit-list' }, UNIT_SUGGESTIONS.map((u) => h('option', { value: u })));
  const tbody = h('tbody');
  const foot = { cost: h('b'), markup: h('b'), total: h('b') };
  const bar = runningTotal(p);

  const updateFoot = () => {
    const t = sheetTotals(p)[kind];
    foot.cost.textContent = gbp(t.cost);
    foot.markup.textContent = gbp(t.markup);
    foot.total.textContent = gbp(t.total);
    bar.update();
  };

  const newLine = () => (mat ? newMaterialLine() : newLabourLine());
  /** Add a line at the bottom; returns its row. */
  const addLine = () => {
    const line = newLine();
    lines.push(line);
    const tr = row(line);
    tbody.append(tr);
    save();
    return tr;
  };
  /** Move to the same column on the next line (Enter key), like a spreadsheet; adds a line at the bottom. */
  const nextRow = (tr, k) => {
    const next = tr.nextElementSibling || addLine();
    const el = next.querySelector(`[data-k="${k}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  };

  const row = (line) => {
    const tr = h('tr');
    const totalCell = h('td', { class: 'total' });
    const showTotal = () => {
      totalCell.textContent = isBlankLine(line) ? '' : gbp(lineTotals(line).total);
    };
    const changed = () => {
      save();
      showTotal();
      updateFoot();
    };
    const input = (c) => h('input', {
      type: 'text',
      value: line[c.k] ?? '',
      placeholder: c.ph || '',
      inputmode: c.num ? 'decimal' : null,
      autocapitalize: c.num ? 'off' : 'sentences',
      enterkeyhint: 'next',
      list: c.list ? 'unit-list' : null,
      dataset: { k: c.k },
      'aria-label': c.label,
      oninput: (e) => { line[c.k] = e.target.value; changed(); },
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nextRow(tr, c.k); }
      },
    });
    const cells = COLS.map((c) => {
      if (c.select) {
        const sel = h('select', {
          dataset: { k: c.k },
          'aria-label': c.label,
          onchange: (e) => {
            line[c.k] = e.target.value;
            qtyInput.placeholder = QTY_HINT[line.basis] || '1';
            changed();
          },
        }, c.select.map(([v, label]) => h('option', { value: v, selected: line[c.k] === v }, label)));
        return h('td', null, sel);
      }
      if (c.markup) {
        const toggle = h('button', {
          type: 'button',
          class: 'mk-type',
          'aria-label': 'Markup as percent or pounds – tap to switch',
          onclick: () => {
            line.markupType = line.markupType === '£' ? '%' : '£';
            toggle.textContent = line.markupType;
            changed();
          },
        }, line.markupType || '%');
        return h('td', { class: 'num' }, h('div', { class: 'mk' }, input({ ...c, num: true, ph: '0' }), toggle));
      }
      return h('td', { class: [c.first ? 'col-first' : '', c.num ? 'num' : ''].filter(Boolean).join(' ') || null }, input(c));
    });
    const qtyInput = cells[COLS.findIndex((c) => c.k === 'qty')].querySelector('input');
    if (!mat) qtyInput.placeholder = QTY_HINT[line.basis] || '1';
    const del = h('button', {
      type: 'button',
      class: 'row-del',
      'aria-label': 'Remove line',
      onclick: () => {
        const i = lines.indexOf(line);
        if (i < 0) return;
        lines.splice(i, 1);
        const before = tr.nextElementSibling;
        tr.remove();
        save();
        updateFoot();
        toast(`${line.item || 'Line'} removed`, {
          action: 'Undo',
          onAction: () => {
            lines.splice(i, 0, line);
            tbody.insertBefore(tr, before?.isConnected ? before : tbody.lastElementChild);
            save();
            updateFoot();
          },
        });
      },
    }, '✕');
    tr.append(...cells, totalCell, h('td', { class: 'del-cell' }, del));
    showTotal();
    return tr;
  };

  // Always start with at least MIN_LINES lines to type in.
  if (lines.length < MIN_LINES) {
    while (lines.length < MIN_LINES) lines.push(newLine());
    save();
  }
  tbody.append(...lines.map((l) => row(l)));
  const addBtn = h('button', {
    type: 'button',
    class: 'btn-block add-line',
    onclick: () => {
      const tr = addLine();
      const el = tr.querySelector('[data-k="item"]');
      el.scrollIntoView({ block: 'center' });
      el.focus();
    },
  }, '+ Add line');

  const head = h('tr', null,
    COLS.map((c) => h('th', { class: [c.first ? 'col-first' : '', c.num || c.markup ? 'num' : ''].filter(Boolean).join(' ') || null, style: `min-width:${c.w}px;width:${c.w}px` }, c.label)),
    h('th', { class: 'num', style: 'min-width:96px' }, 'Total £'),
    h('th', { style: 'min-width:44px', 'aria-label': 'Remove' }));
  const table = h('table', { class: 'calc' }, h('thead', null, head), tbody);
  // Column totals sit under the table, so they're always in view (not off to the right).
  const sums = h('div', { class: 'calc-sum' },
    h('span', null, 'Cost', foot.cost),
    h('span', null, 'Markup', foot.markup),
    h('span', { class: 'calc-sum-total' }, mat ? 'Materials total' : 'Labour total', foot.total));

  root.append(
    ...jobChrome(job, section),
    h('div', { class: 'content' },
      h('h2', null, mat ? 'Materials' : 'Labour'),
      h('span', { class: 'field-label' }, 'Prices entered'),
      vatToggle(p, () => { save(); updateFoot(); }),
      h('p', { class: 'hint' }, mat
        ? 'One line per item. Price is per unit (each, pack, tonne, pallet…); Qty left blank counts as 1. Markup: tap % / £ to switch. Swipe the table sideways for more columns.'
        : 'Charge per item, per hour or per day. Qty is the number of items, hours or days (blank counts as 1). Markup: tap % / £ to switch.'),
      units,
      h('div', { class: 'calc-wrap' }, table),
      addBtn,
      sums,
      bar,
      completeFooter(job, section)));
  updateFoot();
}

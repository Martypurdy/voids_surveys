// Materials & labour costing › Materials / Labour tabs: a spreadsheet – one line per
// item, every field on the row, totals worked out as you type. Starts with at least
// MIN_LINES lines and always keeps an empty line at the bottom: typing in the last line,
// or removing a line, adds a new one. "+ Add line" (or Enter on the last line) adds
// another. Empty lines are ignored in totals and the PDF. Materials lines can be filled from a supplier's
// product link (🔗 – see linkfill.js).
import { scheduleSave } from '../db.js';
import { newMaterialLine, newLabourLine, newDelivery } from '../model.js';
import { lineTotals, sheetTotals, gbp, isBlankLine, money, VAT_MODES, LABOUR_BASIS, UNIT_SUGGESTIONS } from '../pricing.js';
import { h, toast, choose, busy } from '../ui.js';
import { lookupProduct, applyToLine, sheetPrice, findUrl, noPriceReason, LOOKUP_URL, takePendingLink } from '../linkfill.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const MATERIAL_COLS = [
  { k: 'item', label: 'Item', w: 190, ph: 'e.g. Plasterboard 12.5mm', first: true },
  { k: 'link', label: '🔗', w: 48, link: true },
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

/** Pop-up asking for a product link. Resolves the link, or null. */
async function askForLink() {
  const input = h('input', { type: 'url', inputmode: 'url', placeholder: 'https://www.…', autocomplete: 'off', 'aria-label': 'Product link' });
  const pasteBtn = h('button', {
    type: 'button',
    class: 'btn-small',
    onclick: async () => {
      try {
        const t = await navigator.clipboard.readText();
        input.value = findUrl(t) || t;
      } catch {
        toast('Press and hold in the box, then tap Paste');
        input.focus();
      }
    },
  }, '📋 Paste');
  const v = await choose({
    title: '🔗 Add from a product link',
    content: h('div', null,
      h('p', { class: 'hint' }, 'On the supplier’s website or app, open the product and copy its link (Share › Copy link). Paste it here.'),
      h('div', { class: 'input-row link-row' }, input, pasteBtn)),
    buttons: [
      { label: 'Add product', value: 'ok', class: 'btn-primary btn-big' },
      { label: 'Cancel', value: null },
    ],
  });
  if (v !== 'ok') return null;
  const url = findUrl(input.value);
  if (!url) toast('That isn’t a web link – copy the product’s link and try again');
  return url;
}

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
      t.delivery.count ? h('span', null, 'Delivery ', h('b', null, gbp(t.delivery.total))) : null,
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

  const refreshRow = (tr, line) => {
    const fresh = row(line);
    tr.replaceWith(fresh);
    updateFoot();
    return fresh;
  };

  /** Read a product link and fill a line (the given one, else the first empty line, else a new one). */
  const addFromLink = async (url, line, tr) => {
    url ||= await askForLink();
    if (!url) return;
    const progress = busy('Reading the product page…');
    let info;
    try {
      info = await lookupProduct(url);
    } finally {
      progress.close();
    }
    if (!line) {
      line = lines.find(isBlankLine);
      tr = line ? tbody.children[lines.indexOf(line)] : addLine();
      line ||= lines.at(-1);
    }
    const priced = applyToLine(line, info, p);
    save();
    const fresh = refreshRow(tr, line);
    // Next: the quantity – or the price, if the supplier's site didn't give one.
    const next = fresh.querySelector(priced ? '[data-k="qty"]' : '[data-k="price"]');
    next.scrollIntoView({ block: 'center', inline: 'center' });
    next.focus();
    if (lines.at(-1) === line) addLine();
    toast(priced
      ? `✓ ${info.supplier}: £${line.price}${p.vat === 'plus' ? ' + VAT' : ''} – now add the quantity`
      : `✓ ${info.supplier} details added. ${noPriceReason(info)}`, { timeout: 9000 });
  };

  /** Re-check one line's price on the supplier's site. Returns 'same' | 'changed' | 'failed'. */
  const recheck = async (line) => {
    const info = await lookupProduct(line.url);
    const price = sheetPrice(info, p);
    if (!info.looked || price == null) return { result: 'failed', info };
    const old = line.price;
    line.price = price;
    line.checked = { price: info.price, incVat: info.priceIncVat, date: new Date().toISOString() };
    return { result: money(old) === money(price) ? 'same' : 'changed', old, price, info };
  };

  /** 🔗 on a line: add a link, or open / update / change / remove it. */
  const linkMenu = async (line, tr) => {
    if (!line.url) return addFromLink(null, line, tr);
    const host = new URL(line.url).hostname.replace(/^www\./, '');
    const when = line.checked?.date ? ` Price checked ${new Date(line.checked.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : '';
    const v = await choose({
      title: line.item || 'Product link',
      message: `Linked to ${host}.${when}`,
      buttons: [
        { label: '🌐 Open the supplier’s page', value: 'open', class: 'btn-primary', onClick: () => window.open(line.url, '_blank', 'noopener') },
        LOOKUP_URL ? { label: '↻ Update price', value: 'update' } : null,
        { label: 'Change link', value: 'change' },
        { label: 'Remove link', value: 'remove', class: 'btn-danger' },
        { label: 'Cancel', value: null },
      ].filter(Boolean),
    });
    if (v === 'change') return addFromLink(null, line, tr);
    if (v === 'remove') {
      line.url = '';
      delete line.checked;
      save();
      refreshRow(tr, line);
      toast('Link removed – the line’s details are kept');
    }
    if (v === 'update') {
      const progress = busy('Checking the price…');
      const r = await recheck(line).finally(() => progress.close());
      save();
      refreshRow(tr, line);
      toast(r.result === 'failed' ? noPriceReason(r.info) : r.result === 'same' ? `Price unchanged: £${r.price}` : `Price updated: £${r.old || '–'} → £${r.price}`, { timeout: 6000 });
    }
  };

  /** ↻ Update prices: re-check every linked line. */
  const updateAll = async () => {
    const linked = lines.filter((l) => l.url);
    const progress = busy('Checking prices…');
    const changed = [];
    let failed = 0;
    try {
      for (const [i, l] of linked.entries()) {
        progress.update(`Checking price ${i + 1} of ${linked.length}…`);
        const r = await recheck(l);
        if (r.result === 'changed') changed.push(`${l.item || 'Line'}: £${r.old || '–'} → £${r.price}`);
        if (r.result === 'failed') failed++;
      }
    } finally {
      progress.close();
    }
    save();
    tbody.replaceChildren(...lines.map((l) => row(l)));
    updateFoot();
    await choose({
      title: changed.length ? `${changed.length} price${changed.length === 1 ? '' : 's'} changed` : 'Prices checked',
      message: [
        `${linked.length - failed} of ${linked.length} linked line${linked.length === 1 ? '' : 's'} checked.`,
        failed ? `${failed} couldn’t be checked (the supplier’s site blocks it, or no signal).` : '',
      ].filter(Boolean).join(' '),
      content: changed.length ? h('ul', { class: 'price-changes' }, changed.map((c) => h('li', null, c))) : h('p', { class: 'hint' }, 'No price changes.'),
      buttons: [{ label: 'OK', value: true, class: 'btn-primary' }],
    });
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
      // Started filling the bottom line: add a fresh empty one below it.
      if (lines.at(-1) === line && !isBlankLine(line)) addLine();
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
      if (c.link) {
        return h('td', { class: 'link-cell' }, h('button', {
          type: 'button',
          class: `row-link${line.url ? ' on' : ''}`,
          'aria-label': line.url ? 'Product link – open, update or change' : 'Fill this line from a product link',
          title: line.url ? 'Product link' : 'Add from a product link',
          onclick: () => linkMenu(line, tr),
        }, '🔗'));
      }
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
        // A fresh empty line at the bottom replaces it (and keep at least MIN_LINES).
        addLine();
        while (lines.length < MIN_LINES) addLine();
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

  // Always start with at least MIN_LINES lines to type in, and an empty one at the bottom.
  if (lines.length < MIN_LINES || !isBlankLine(lines.at(-1))) {
    while (lines.length < MIN_LINES || !isBlankLine(lines.at(-1))) lines.push(newLine());
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

  // ----- Delivery & lead times (materials only): separate lines, added to the totals -----
  const vatWord = () => ({ plus: ' (+ VAT)', inc: ' (inc VAT)' }[p.vat] || '');
  const deliveryList = h('div', { class: 'delivery-list' });
  const editDelivery = async (d) => {
    const isNew = !d;
    d ||= newDelivery();
    const suppliers = [...new Set(lines.map((l) => l.supplier.trim()).filter(Boolean))];
    const field = (label, key, opts = {}) => {
      const input = h('input', { type: 'text', value: d[key], placeholder: opts.ph || '', inputmode: opts.inputmode, list: opts.list, autocapitalize: opts.cap || 'sentences', 'aria-label': label });
      return { input, el: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input) };
    };
    const sup = field('Supplier', 'supplier', { ph: 'e.g. Wickes', list: 'delivery-suppliers', cap: 'words' });
    const cost = field(`Delivery cost £${vatWord()}`, 'cost', { ph: '0.00 (free = 0)', inputmode: 'decimal' });
    const lead = field('Lead time', 'leadTime', { ph: 'e.g. 3–5 working days' });
    const quick = h('div', { class: 'chips lead-chips' }, ['Next day', '2–3 days', '1 week', '2 weeks', 'Collect'].map((t) => h('button', {
      type: 'button',
      onclick: () => { lead.input.value = t; },
    }, t)));
    const notes = field('Notes', 'notes', { ph: 'e.g. Kerbside only, needs someone in' });
    const v = await choose({
      title: isNew ? '🚚 Add delivery' : '🚚 Delivery',
      content: h('div', null,
        h('datalist', { id: 'delivery-suppliers' }, suppliers.map((s) => h('option', { value: s }))),
        sup.el, cost.el, lead.el, quick, notes.el),
      buttons: [
        { label: isNew ? 'Add delivery' : 'Save', value: 'save', class: 'btn-primary btn-big' },
        isNew ? null : { label: 'Remove delivery', value: 'delete', class: 'btn-danger' },
        { label: 'Cancel', value: null },
      ].filter(Boolean),
    });
    if (v === 'delete') {
      p.deliveries.splice(p.deliveries.indexOf(d), 1);
    } else if (v === 'save') {
      Object.assign(d, { supplier: sup.input.value.trim(), cost: cost.input.value.trim(), leadTime: lead.input.value.trim(), notes: notes.input.value.trim() });
      if (isNew) p.deliveries.push(d);
    } else return;
    save();
    renderDeliveries();
    updateFoot();
  };
  const renderDeliveries = () => {
    deliveryList.replaceChildren(...p.deliveries.map((d) => h('button', {
      type: 'button',
      class: 'card delivery-item',
      onclick: () => editDelivery(d),
    },
    h('span', { class: 'dl-icon', 'aria-hidden': 'true' }, '🚚'),
    h('span', { class: 'dl-text' },
      h('strong', null, `${d.supplier || 'Delivery'} delivery`),
      h('span', null, [d.leadTime ? `Lead time: ${d.leadTime}` : 'Lead time not given', d.notes].filter(Boolean).join(' · '))),
    h('b', { class: 'dl-cost' }, money(d.cost) ? gbp(money(d.cost)) : 'Free'))));
  };
  renderDeliveries();
  const deliverySection = mat
    ? h('section', { class: 'delivery' },
      h('h3', null, 'Delivery & lead times'),
      deliveryList,
      h('button', { type: 'button', class: 'btn-block add-line', onclick: () => editDelivery() }, '+ Add delivery'))
    : null;
  const disclaimer = mat
    ? h('p', { class: 'calc-note' }, h('strong', null, 'Note: '), 'material prices don’t include delivery charges or lead times. Add them with ', h('strong', null, '+ Add delivery'), ' below so they’re included in the totals.')
    : null;
  const linkTools = mat
    ? h('div', { class: 'btn-row link-tools' },
      h('button', { type: 'button', class: 'btn-primary', onclick: () => addFromLink() }, '🔗 Add from a product link'),
      LOOKUP_URL && lines.some((l) => l.url) ? h('button', { type: 'button', onclick: updateAll }, '↻ Update prices') : null)
    : null;
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
      linkTools,
      disclaimer,
      h('div', { class: 'calc-wrap' }, table),
      addBtn,
      sums,
      deliverySection,
      bar,
      completeFooter(job, section)));
  updateFoot();

  // A product link shared to the app from another app (Android share sheet).
  const shared = mat ? takePendingLink() : null;
  if (shared) setTimeout(() => addFromLink(shared), 300);
}

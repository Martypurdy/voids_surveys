// Quote / invoice › Items: what the customer is being charged for, with the VAT, discount and totals worked out as you type.
// There are always at least three lines and an add-line button, like the other lists.
import { scheduleSave } from '../db.js';
import { newDocLine } from '../model.js';
import { docTotals, lineAmount, fmtMoney, isBlankDocLine } from '../docs/money.js';
import { businessBar } from '../docs/ui.js';
import { syncIncome } from '../accounts/store.js';
import { h, textField, selectField } from '../ui.js';
import { sheetEditor } from './ramsUi.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function docItems(root, { id }) {
  const job = await loadJobOr404(id);
  const d = job.doc;
  const isInvoice = d.kind === 'invoice';
  const chrome = jobChrome(job, 'items');
  const bar = await businessBar(job, chrome[0]);
  const totalsBox = h('div', { class: 'card card-body doc-totals', 'aria-live': 'polite' });

  const paintTotals = () => {
    const t = docTotals(d);
    const row = (label, value, cls = '') => h('div', { class: `doc-trow ${cls}` }, h('span', null, label), h('strong', null, value));
    totalsBox.replaceChildren(...[
      row('Subtotal', fmtMoney(t.subtotal)),
      t.discount ? row(d.discountType === '%' ? `Discount (${d.discount}%)` : 'Discount', `−${fmtMoney(t.discount)}`) : null,
      d.vat === 'plus' ? row(`VAT at ${t.rate}%`, fmtMoney(t.vat)) : null,
      row('Total', fmtMoney(t.total), 'doc-total'),
      isInvoice && t.paid ? row('Already paid', `−${fmtMoney(t.paid)}`) : null,
      isInvoice && t.paid ? row('Balance due', fmtMoney(t.due), 'doc-total') : null].filter(Boolean)); // (a null child would print as "null")
  };
  const save = () => {
    scheduleSave(job);
    paintTotals();
    if (isInvoice && d.status === 'paid') syncIncome(job, docTotals(d)); // a paid invoice's income follows its amount
  };

  const sheet = sheetEditor({
    job, items: d.lines, make: newDocLine, onChange: save, removeLabel: 'Remove this line',
    cols: [
      { k: 'item', label: 'Description', ph: 'What is being charged for', w: '2.4fr' },
      { k: 'qty', label: 'Qty', ph: '1', w: '.5fr' },
      { k: 'unit', label: 'Unit', ph: 'each, hour…', w: '.7fr' },
      { k: 'price', label: 'Price (£ each)', ph: '0.00', w: '.8fr' },
      { k: 'amount', label: 'Amount', kind: 'out', w: '.8fr', fmt: (l) => (isBlankDocLine(l) ? '' : fmtMoney(lineAmount(l))) },
    ],
  });

  const vatToggle = h('div', { class: 'segmented', role: 'group', 'aria-label': 'VAT' });
  const rateField = textField('VAT rate (%)', d.vatRate, (v) => { d.vatRate = v; save(); }, { inputmode: 'decimal' });
  const paintVat = () => {
    vatToggle.replaceChildren(...[['none', 'No VAT'], ['plus', 'Add VAT']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(d.vat === v), onclick: () => { d.vat = v; paintVat(); save(); } }, t)));
    rateField.hidden = d.vat !== 'plus';
  };
  paintVat();
  const discountRow = h('div', { class: 'input-row' },
    textField('Discount', d.discount, (v) => { d.discount = v; save(); }, { inputmode: 'decimal', placeholder: '0' }),
    selectField('Discount is', d.discountType, [['£', '£ amount'], ['%', '% of the subtotal']], (v) => { d.discountType = v; save(); }, { placeholder: null }));

  root.append(
    ...chrome,
    h('div', { class: 'content wide doc-page' },
      bar,
      h('p', { class: 'hint' }, isInvoice ? 'What the customer is being invoiced for. Prices are before VAT.' : 'What you are quoting for. Prices are before VAT.'),
      sheet,
      h('div', { class: 'doc-cols' },
        h('div', { class: 'card card-body' },
          h('span', { class: 'field-label' }, 'VAT'), vatToggle, rateField, discountRow,
          isInvoice ? textField('Already paid / deposit (£)', d.deposit, (v) => { d.deposit = v; save(); }, { inputmode: 'decimal', placeholder: '0.00' }) : null),
        totalsBox),
      completeFooter(job, 'items')));
  paintTotals();
}

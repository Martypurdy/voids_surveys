// Materials & labour costing › Totals: materials and labour separately, markup, VAT
// and the grand total, plus notes.
import { scheduleSave } from '../db.js';
import { sheetTotals, gbp, money, isBlankLine } from '../pricing.js';
import { h, textField } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';
import { vatToggle } from './costSheet.js';

export default async function priceTotals(root, { id }) {
  const job = await loadJobOr404(id);
  const p = job.pricing;
  const save = () => scheduleSave(job);
  const body = h('tbody');

  const render = () => {
    const t = sheetTotals(p);
    const row = (label, value, cls) => h('tr', { class: cls }, h('th', { scope: 'row' }, label), h('td', null, gbp(value)));
    const group = (title) => h('tr', { class: 'tot-group' }, h('th', { colspan: 2 }, title));
    const count = (lines) => { const n = lines.filter((l) => !isBlankLine(l)).length; return `${n} line${n === 1 ? '' : 's'}`; };
    const vatLabel = p.vat === 'none' ? 'VAT (none)' : `VAT @ ${t.rate}%`;
    body.replaceChildren(
      group(`Materials (${count(p.materials)})`),
      row('Cost', t.materials.cost),
      row('Markup', t.materials.markup),
      row('Materials total', t.materials.total, 'tot-sub'),
      group(`Labour (${count(p.labour)})`),
      row('Cost', t.labour.cost),
      row('Markup', t.labour.markup),
      row('Labour total', t.labour.total, 'tot-sub'),
      ...(t.delivery.count ? [
        group(`Delivery (${t.delivery.count})`),
        ...p.deliveries.map((d) => row(`${d.supplier || 'Delivery'}${d.leadTime ? ` – ${d.leadTime}` : ''}`, money(d.cost))),
        row('Delivery total', t.delivery.total, 'tot-sub'),
      ] : []),
      group('Job total'),
      row('Total markup', t.markup),
      row('Total before VAT', t.net),
      row(vatLabel, t.vat),
      row(p.vat === 'none' ? 'Total' : 'Total inc VAT', t.gross, 'tot-grand'));
  };

  const rateField = textField('VAT rate %', p.vatRate, (v) => { p.vatRate = v; save(); render(); }, { inputmode: 'decimal', placeholder: '20' });
  const rateInput = rateField.querySelector('input');
  rateInput.addEventListener('blur', () => {
    if (String(p.vatRate).trim() === '' || money(p.vatRate) < 0) {
      p.vatRate = 20;
      rateInput.value = '20';
      save();
      render();
    }
  });
  const syncRate = () => { rateField.hidden = p.vat === 'none'; };

  root.append(
    ...jobChrome(job, 'totals'),
    h('div', { class: 'content' },
      h('h2', null, 'Totals'),
      h('span', { class: 'field-label' }, 'Prices entered'),
      vatToggle(p, () => { save(); syncRate(); render(); }),
      h('p', { class: 'hint' }, '+ VAT: prices were typed before VAT, so VAT is added on top. Inc VAT: prices already include VAT. No VAT: nothing added.'),
      rateField,
      h('div', { class: 'card' }, h('table', { class: 'totals-table' }, body)),
      textField('Notes', p.notes, (v) => { p.notes = v; save(); }, { multiline: true, placeholder: 'Anything to note about this costing' }),
      completeFooter(job, 'totals')));
  syncRate();
  render();
}

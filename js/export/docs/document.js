// A quote or invoice as Word and Excel (the PDF is drawn in pdf.js). The customer sees what they are charged: lines, VAT, discount and
// totals. The Excel version has live formulas, so changing a quantity, a price, the discount, the VAT rate or what has been paid updates
// every total.
import { loadBusinesses, getBusinesses } from '../../accounts/store.js';
import { addressLines, textLines, fmtDate } from '../../model.js';
import { docTotals, lineAmount, lineQty, isBlankDocLine, fmtMoney, pounds, docStatus, STATUS_LABEL } from '../../docs/money.js';
import { money } from '../../pricing.js';
import { shadeHex } from '../../docs/colors.js';

const has = (v) => String(v ?? '').trim() !== '';
const date = (v) => (has(v) ? fmtDate(v) : '');

/** The business a document is from, and everything printed about it. */
export async function documentParts(job) {
  await loadBusinesses();
  const d = job.doc;
  const biz = getBusinesses().find((b) => b.id === d.businessId) || getBusinesses()[0];
  const isInvoice = d.kind === 'invoice';
  const lines = d.lines.filter((l) => !isBlankDocLine(l));
  const t = docTotals(d);
  return {
    d, biz, isInvoice, lines, t, label: isInvoice ? 'Invoice' : 'Quote',
    from: [biz.address, [biz.phone, biz.email].filter(has).join('  ·  '), biz.vatNumber ? `VAT number ${biz.vatNumber}` : '', biz.companyNumber ? `Company number ${biz.companyNumber}` : ''].filter(has).join('\n'),
    billTo: [d.customer, addressLines(d.customerAddress || {}).join('\n')].filter(has).join('\n'),
    site: textLines(job.address).join(', '),
    payment: isInvoice ? (has(d.payment) ? d.payment : biz.bank || '') : '',
    dueLabel: isInvoice ? 'Due by' : 'Valid until',
    status: STATUS_LABEL[docStatus(d)],
  };
}

const pairsToRows = (pairs) => {
  const items = pairs.filter(([, v]) => has(v));
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items[i + 1] ? [...items[i], ...items[i + 1]] : [...items[i]]);
  return rows;
};

export function documentModel(p, job) {
  const { d, biz, isInvoice, lines, t } = p;
  const accent = shadeHex(biz.color);
  const sections = [];
  sections.push({
    grid: pairsToRows([
      ['From', `${biz.name}${p.from ? `\n${p.from}` : ''}`], [`${p.label} number`, d.number],
      ['Bill to', p.billTo], ['Date', date(d.issued)],
      ['Site address', p.site], [p.dueLabel, date(d.due)],
      ['Reference', d.ref], ['Status', isInvoice ? p.status : ''],
    ]),
  });
  const foot = [['', '', '', 'Subtotal', fmtMoney(t.subtotal)]];
  if (t.discount) foot.push(['', '', '', d.discountType === '%' ? `Discount (${d.discount}%)` : 'Discount', `−${fmtMoney(t.discount)}`]);
  if (d.vat === 'plus') foot.push(['', '', '', `VAT at ${t.rate}%`, fmtMoney(t.vat)]);
  foot.push(['', '', '', 'Total', fmtMoney(t.total)]);
  if (isInvoice && t.paid) foot.push(['', '', '', 'Already paid', `−${fmtMoney(t.paid)}`], ['', '', '', 'Balance due', fmtMoney(t.due)]);
  sections.push({
    band: p.label.toUpperCase(),
    table: {
      headFill: accent, headColor: 'FFFFFF',
      cols: [{ title: 'Description', w: 5 }, { title: 'Qty', w: 0.9, align: 'right' }, { title: 'Unit', w: 1 }, { title: 'Price', w: 1.4, align: 'right' }, { title: 'Amount', w: 1.5, align: 'right' }],
      rows: lines.map((l) => [l.item, has(l.qty) ? l.qty : '1', l.unit, fmtMoney(Math.round(money(l.price) * 100)), fmtMoney(lineAmount(l))]),
      foot,
    },
  });
  if (has(d.notes)) sections.push({ band: 'NOTES', paras: [d.notes] });
  if (isInvoice && has(p.payment)) sections.push({ band: 'HOW TO PAY', paras: p.payment.split('\n') });
  if (has(d.terms)) sections.push({ band: 'TERMS', paras: d.terms.split('\n') });
  return { title: p.label.toUpperCase(), subtitle: biz.name, landscape: false, accent, footer: `${biz.name} – ${p.label} ${d.number}`, sections };
}

/** The Excel version: the lines with live line amounts, then the totals worked out by formulas from them. */
export function documentWorkbook(p) {
  const { d, biz, isInvoice, lines, t } = p;
  const head = (labels) => labels.map((v) => ({ v, s: 'headTeal' }));
  const label = { font: 1, fill: 3, border: 1, wrap: 1, v: 'top' };
  const rows = [[{ v: `${biz.name} – ${p.label.toUpperCase()} ${d.number}`, s: 'title' }], []];
  const kv = (k, v) => { if (has(v)) rows.push([{ v: k, s: label }, { v, s: 'cell' }]); };
  kv('From', `${biz.name}${p.from ? `\n${p.from}` : ''}`);
  kv('Bill to', p.billTo);
  kv('Site address', p.site);
  kv(`${p.label} number`, d.number);
  kv('Date', date(d.issued));
  kv(p.dueLabel, date(d.due));
  kv('Reference', d.ref);
  rows.push([]);
  const headRow = rows.length + 1;
  rows.push(head(['Description', 'Qty', 'Unit', 'Price (£ each)', 'Amount']));
  const first = rows.length + 1;
  const SPARE = 5;
  lines.forEach((l, i) => {
    const r = first + i;
    rows.push([{ v: l.item || '', s: 'cell' }, { v: has(l.qty) ? money(l.qty) : null, s: 'inNum' }, { v: l.unit || '', s: 'inText' }, { v: has(l.price) ? money(l.price) : null, s: 'inMoney' },
      { v: pounds(lineAmount(l)), f: `ROUND(IF(B${r}="",1,B${r})*N(D${r}),2)`, s: 'money' }]);
  });
  for (let i = 0; i < SPARE; i++) {
    const r = first + lines.length + i;
    rows.push([{ v: '', s: 'cell' }, { v: '', s: 'inNum' }, { v: '', s: 'inText' }, { v: '', s: 'inMoney' }, { v: '', f: `IF(AND(B${r}="",D${r}=""),"",ROUND(IF(B${r}="",1,B${r})*N(D${r}),2))`, s: 'money' }]);
  }
  const last = first + lines.length + SPARE - 1;
  rows.push([]);
  const cells = {};
  const at = (col) => `${col}${rows.length + 1}`;
  const put = (labelText, v, f, s = 'money', key) => { const r = rows.length + 1; rows.push([{ v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: labelText, s: 'bold' }, { v, f, s }]); if (key) cells[key] = `E${r}`; return r; };
  const rSub = put('Subtotal', pounds(t.subtotal), `SUM(E${first}:E${last})`, 'money', 'subtotal');
  // discount: an amount (or a percentage of the subtotal), never more than the subtotal
  const rDisc = rows.length + 1;
  rows.push([{ v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: d.discountType === '%' ? '%' : '£', s: 'inText' }, { v: 'Discount (amount, or % if marked %)', s: 'bold' }, { v: has(d.discount) ? money(d.discount) : null, s: 'inNum' }]);
  const rDiscAmt = put('Discount taken', pounds(t.discount), `MIN(E${rSub},IF(C${rDisc}="%",ROUND(E${rSub}*N(E${rDisc})/100,2),N(E${rDisc})))`, 'money', 'discount');
  const rNet = put('Total before VAT', pounds(t.net), `E${rSub}-E${rDiscAmt}`, 'money', 'net');
  const rRate = rows.length + 1;
  rows.push([{ v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: 'VAT rate (%) – 0 for none', s: 'bold' }, { v: d.vat === 'plus' ? money(d.vatRate) : 0, s: 'inNum' }]);
  const rVat = put('VAT', pounds(t.vat), `ROUND(E${rNet}*N(E${rRate})/100,2)`, 'money', 'vat');
  const rTotal = put('Total', pounds(t.total), `E${rNet}+E${rVat}`, 'totalMoney', 'total');
  if (isInvoice) {
    const rPaid = rows.length + 1;
    rows.push([{ v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: 'Already paid / deposit', s: 'bold' }, { v: has(d.deposit) ? money(d.deposit) : null, s: 'inMoney' }]);
    put('Balance due', pounds(t.due), `E${rTotal}-MIN(E${rTotal},N(E${rPaid}))`, 'totalMoney', 'due');
  }
  rows.push([]);
  if (has(d.notes)) kv('Notes', d.notes);
  if (isInvoice && has(p.payment)) kv('How to pay', p.payment);
  if (has(d.terms)) kv('Terms', d.terms);
  rows.push([], [{ v: 'Yellow cells can be changed: the amounts and totals recalculate.', s: 'note' }]);
  void headRow; void at;
  return { sheets: [{ name: p.label, cols: [{ w: 50 }, { w: 9 }, { w: 12 }, { w: 34 }, { w: 16 }], rows, landscape: false }], cells };
}

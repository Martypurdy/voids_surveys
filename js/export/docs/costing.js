// Materials & labour costing as Excel (with live formulas) and Word.
//
// The workbook reproduces pricing.js exactly, so changing a quantity, price, markup, the VAT mode or the VAT
// rate in Excel gives the same totals the app would:
//   line cost   = qty (blank counts as 1) x price
//   line markup = markup £ (a flat amount for the line) or cost x markup %
//   typed total = materials + labour + delivery
//   "+ VAT": VAT = typed x rate, total = typed + VAT      "Inc VAT": net = typed / (1 + rate), VAT = typed - net
import { addressLines, fmtDateTime } from '../../model.js';
import { sheetTotals, lineTotals, isBlankLine, money, gbp, LABOUR_BASIS } from '../../pricing.js';

const VAT_LABEL = { plus: '+ VAT', inc: 'Inc VAT', none: 'No VAT' };
const SPARE = 5; // empty formula rows left under each table so lines can be added in Excel

const blank = (v) => String(v ?? '').trim() === '';
const qtyCell = (l) => (blank(l.qty) ? null : money(l.qty));
const numCell = (v) => (blank(v) ? null : money(v));
const markupType = (l) => (l.markupType === '£' ? '£' : '%');

/** The workbook: { sheets, cells } – cells lists where the totals are (for checking). */
export function costingWorkbook(job) {
  const p = job.pricing;
  const t = sheetTotals(p);
  const mats = p.materials.filter((l) => !isBlankLine(l));
  const labour = p.labour.filter((l) => !isBlankLine(l));
  const dels = p.deliveries || [];
  const head = (labels) => labels.map((v) => ({ v, s: 'head' }));

  // ----- Materials -----
  const mRows = [head(['Item', 'Supplier', 'Code / SKU', 'Qty', 'Unit', 'Price (£ each)', 'Markup', 'Markup type', 'Cost', 'Markup (£)', 'Total'])];
  mats.forEach((l, i) => {
    const r = i + 2; // Excel row
    const lt = lineTotals(l);
    mRows.push([
      l.url ? { v: l.item || l.url, link: l.url, s: 'link' } : { v: l.item || '', s: 'cell' },
      { v: l.supplier || '', s: 'cell' }, { v: l.code || '', s: 'cell' },
      { v: qtyCell(l), s: 'inNum' }, { v: l.unit || '', s: 'inText' },
      { v: numCell(l.price), s: 'inMoney' }, { v: numCell(l.markup), s: 'inNum' }, { v: markupType(l), s: 'inText' },
      { v: lt.cost, f: `IF(D${r}="",1,D${r})*N(F${r})`, s: 'money' },
      { v: lt.markup, f: `IF(H${r}="£",N(G${r}),I${r}*N(G${r})/100)`, s: 'money' },
      { v: lt.total, f: `I${r}+J${r}`, s: 'money' },
    ]);
  });
  for (let i = 0; i < SPARE; i++) {
    const r = mats.length + 2 + i;
    mRows.push([
      { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'inNum' }, { v: '', s: 'inText' }, { v: '', s: 'inMoney' }, { v: '', s: 'inNum' }, { v: '%', s: 'inText' },
      { v: '', f: `IF(AND(D${r}="",F${r}=""),"",IF(D${r}="",1,D${r})*N(F${r}))`, s: 'money' },
      { v: '', f: `IF(I${r}="","",IF(H${r}="£",N(G${r}),I${r}*N(G${r})/100))`, s: 'money' },
      { v: '', f: `IF(I${r}="","",I${r}+J${r})`, s: 'money' },
    ]);
  }
  const mLast = mats.length + 1 + SPARE;
  const mSub = mLast + 1;
  mRows.push([{ v: 'Materials total', s: 'total' }, ...Array(7).fill({ v: '', s: 'total' }),
    { v: t.materials.cost, f: `SUM(I2:I${mLast})`, s: 'totalMoney' }, { v: t.materials.markup, f: `SUM(J2:J${mLast})`, s: 'totalMoney' }, { v: t.materials.total, f: `SUM(K2:K${mLast})`, s: 'totalMoney' }]);
  mRows.push([]);
  mRows.push([{ v: 'Yellow cells can be changed: the totals recalculate. Markup type: % or £ (a flat amount for the line). Prices are per unit; Qty left blank counts as 1.', s: 'note' }]);

  // ----- Labour -----
  const basis = Object.fromEntries(LABOUR_BASIS);
  const lRows = [head(['Labour', 'Charged', 'Qty', 'Rate (£)', 'Markup', 'Markup type', 'Cost', 'Markup (£)', 'Total'])];
  labour.forEach((l, i) => {
    const r = i + 2;
    const lt = lineTotals(l);
    lRows.push([
      { v: l.item || '', s: 'cell' }, { v: basis[l.basis] || '', s: 'cell' },
      { v: qtyCell(l), s: 'inNum' }, { v: numCell(l.rate), s: 'inMoney' }, { v: numCell(l.markup), s: 'inNum' }, { v: markupType(l), s: 'inText' },
      { v: lt.cost, f: `IF(C${r}="",1,C${r})*N(D${r})`, s: 'money' },
      { v: lt.markup, f: `IF(F${r}="£",N(E${r}),G${r}*N(E${r})/100)`, s: 'money' },
      { v: lt.total, f: `G${r}+H${r}`, s: 'money' },
    ]);
  });
  for (let i = 0; i < SPARE; i++) {
    const r = labour.length + 2 + i;
    lRows.push([
      { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'inNum' }, { v: '', s: 'inMoney' }, { v: '', s: 'inNum' }, { v: '%', s: 'inText' },
      { v: '', f: `IF(AND(C${r}="",D${r}=""),"",IF(C${r}="",1,C${r})*N(D${r}))`, s: 'money' },
      { v: '', f: `IF(G${r}="","",IF(F${r}="£",N(E${r}),G${r}*N(E${r})/100))`, s: 'money' },
      { v: '', f: `IF(G${r}="","",G${r}+H${r})`, s: 'money' },
    ]);
  }
  const lLast = labour.length + 1 + SPARE;
  const lSub = lLast + 1;
  lRows.push([{ v: 'Labour total', s: 'total' }, ...Array(5).fill({ v: '', s: 'total' }),
    { v: t.labour.cost, f: `SUM(G2:G${lLast})`, s: 'totalMoney' }, { v: t.labour.markup, f: `SUM(H2:H${lLast})`, s: 'totalMoney' }, { v: t.labour.total, f: `SUM(I2:I${lLast})`, s: 'totalMoney' }]);

  // ----- Delivery -----
  const dRows = [head(['Supplier', 'Lead time', 'Notes', 'Cost (£)'])];
  dels.forEach((d) => dRows.push([{ v: d.supplier || 'Delivery', s: 'cell' }, { v: d.leadTime || 'Not given', s: 'cell' }, { v: d.notes || '', s: 'cell' }, { v: numCell(d.cost), s: 'inMoney' }]));
  for (let i = 0; i < SPARE; i++) dRows.push([{ v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'inMoney' }]);
  const dLast = dels.length + 1 + SPARE;
  const dSub = dLast + 1;
  dRows.push([{ v: 'Delivery total', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: t.delivery.total, f: `SUM(D2:D${dLast})`, s: 'totalMoney' }]);

  // ----- Summary (first sheet) -----
  const addr = addressLines(job.address).join(', ');
  const cust = addressLines(p.customerAddress || {}).join(', ');
  const modeLabel = VAT_LABEL[p.vat] || 'No VAT';
  const S = []; // rows, 0-based; Excel row = index + 1
  const info = (label, value) => S.push([{ v: label, s: 'bold' }, { v: value ?? '', s: 'cell' }]);
  S.push([{ v: 'Materials & Labour Costing', s: 'title' }]);
  S.push([{ v: addr, s: 'note' }]);
  S.push([]);
  info('Customer', p.customer);
  info('Customer address', cust);
  info('Job reference', p.ref);
  info('Prepared by', job.surveyor);
  info('Created', fmtDateTime(job.created));
  S.push([]);
  const modeRow = S.length + 1;
  S.push([{ v: 'Prices entered', s: 'bold' }, { v: modeLabel, s: 'inText' }, { v: 'Choose + VAT (prices before VAT), Inc VAT (prices already include VAT) or No VAT.', s: 'note' }]);
  const rateRow = S.length + 1;
  S.push([{ v: 'VAT rate (%)', s: 'bold' }, { v: money(p.vatRate), s: 'inNum' }]);
  S.push([]);
  const mode = `$B$${modeRow}`;
  const rate = `IF(${mode}="No VAT",0,N($B$${rateRow})/100)`;
  const row = (label, value, f, style = 'money', lab = 'cell') => { S.push([{ v: label, s: lab }, { v: value, f, s: style }]); return S.length; };
  row('Materials cost', t.materials.cost, `Materials!I${mSub}`);
  row('Materials markup', t.materials.markup, `Materials!J${mSub}`);
  const rMat = row('Materials total', t.materials.total, `Materials!K${mSub}`, 'money');
  row('Labour cost', t.labour.cost, `Labour!G${lSub}`);
  row('Labour markup', t.labour.markup, `Labour!H${lSub}`);
  const rLab = row('Labour total', t.labour.total, `Labour!I${lSub}`, 'money');
  const rDel = row('Delivery', t.delivery.total, `Delivery!D${dSub}`);
  const typedTotal = t.materials.total + t.labour.total + t.delivery.total;
  const rTyped = row('Total as entered', typedTotal, `B${rMat}+B${rLab}+B${rDel}`, 'totalMoney', 'total');
  const rNet = row('Net (before VAT)', t.net, `IF(${mode}="Inc VAT",B${rTyped}/(1+${rate}),B${rTyped})`);
  const rVat = row('VAT', t.vat, `IF(${mode}="+ VAT",B${rTyped}*${rate},IF(${mode}="Inc VAT",B${rTyped}-B${rTyped}/(1+${rate}),0))`);
  const rGross = row(p.vat === 'none' ? 'Total' : 'Total inc VAT', t.gross, `IF(${mode}="+ VAT",B${rTyped}+B${rVat},B${rTyped})`, 'totalMoney', 'total');

  return {
    sheets: [
      { name: 'Summary', cols: [{ w: 24 }, { w: 24 }, { w: 70 }], rows: S, landscape: false, validations: [{ ref: `B${modeRow}`, list: '+ VAT,Inc VAT,No VAT' }] },
      { name: 'Materials', cols: [{ w: 34 }, { w: 18 }, { w: 14 }, { w: 8 }, { w: 9 }, { w: 14 }, { w: 10 }, { w: 12 }, { w: 12 }, { w: 12 }, { w: 12 }], rows: mRows, freeze: { row: 1 } },
      { name: 'Labour', cols: [{ w: 34 }, { w: 12 }, { w: 8 }, { w: 12 }, { w: 10 }, { w: 12 }, { w: 12 }, { w: 12 }, { w: 12 }], rows: lRows, freeze: { row: 1 } },
      { name: 'Delivery', cols: [{ w: 28 }, { w: 20 }, { w: 44 }, { w: 14 }], rows: dRows, freeze: { row: 1 } },
    ],
    cells: { typed: `Summary!B${rTyped}`, net: `Summary!B${rNet}`, vat: `Summary!B${rVat}`, gross: `Summary!B${rGross}`, mode: `Summary!B${modeRow}`, rate: `Summary!B${rateRow}`, materials: `Summary!B${rMat}`, labour: `Summary!B${rLab}`, delivery: `Summary!B${rDel}` },
    expected: { typed: typedTotal, net: t.net, vat: t.vat, gross: t.gross, materials: t.materials.total, labour: t.labour.total, delivery: t.delivery.total }, // full precision, exactly what the app computes (it only rounds for display)
  };
}

/** The same costing as a Word document (product links are clickable). */
export function costingModel(job) {
  const p = job.pricing;
  const t = sheetTotals(p);
  const addr = addressLines(job.address);
  const custAddr = addressLines(p.customerAddress || {}).join(', ');
  const markupText = (l) => (blank(l.markup) ? '' : l.markupType === '£' ? gbp(lineTotals(l).markup) : `${l.markup}%`);
  const qtyOf = (l) => (String(l.qty ?? '').trim() || '1');
  const vatText = { plus: `Prices entered before VAT - VAT added at ${t.rate}%`, inc: `Prices entered including VAT at ${t.rate}%`, none: 'No VAT' }[p.vat] || '';
  const sections = [];
  const mats = p.materials.filter((l) => !isBlankLine(l));
  if (mats.length) {
    sections.push({
      heading: 'Materials',
      paras: [p.deliveries?.length ? 'Material prices exclude delivery; delivery charges and lead times are listed below.' : 'Material prices exclude delivery charges and lead times.'],
      table: {
        cols: [{ title: 'Item', w: 4 }, { title: 'Supplier', w: 2.2 }, { title: 'Code / SKU', w: 1.8 }, { title: 'Qty', w: 0.9, align: 'right' }, { title: 'Unit', w: 1 }, { title: 'Price', w: 1.5, align: 'right' }, { title: 'Markup', w: 1.4, align: 'right' }, { title: 'Total', w: 1.6, align: 'right' }],
        rows: mats.map((l) => [l.url ? { t: l.item || l.url, link: l.url } : l.item || '', l.supplier || '', l.code || '', qtyOf(l), l.unit || '', blank(l.price) ? '' : gbp(lineTotals({ ...l, qty: 1, markup: '' }).cost), markupText(l), gbp(lineTotals(l).total)]),
        foot: [['Materials total', '', '', '', '', gbp(t.materials.cost), gbp(t.materials.markup), gbp(t.materials.total)]],
      },
    });
  }
  if (p.deliveries?.length) {
    sections.push({
      heading: 'Delivery & lead times',
      table: {
        cols: [{ title: 'Supplier', w: 3 }, { title: 'Lead time', w: 2.5 }, { title: 'Notes', w: 5 }, { title: 'Cost', w: 1.5, align: 'right' }],
        rows: p.deliveries.map((d) => [d.supplier || 'Delivery', d.leadTime || 'Not given', d.notes || '', money(d.cost) ? gbp(money(d.cost)) : 'Free']),
        foot: [['Delivery total', '', '', gbp(t.delivery.total)]],
      },
    });
  }
  const lab = p.labour.filter((l) => !isBlankLine(l));
  if (lab.length) {
    const basis = Object.fromEntries(LABOUR_BASIS);
    sections.push({
      heading: 'Labour',
      table: {
        cols: [{ title: 'Labour', w: 4.5 }, { title: 'Charged', w: 1.6 }, { title: 'Qty', w: 1, align: 'right' }, { title: 'Rate', w: 1.5, align: 'right' }, { title: 'Markup', w: 1.4, align: 'right' }, { title: 'Total', w: 1.6, align: 'right' }],
        rows: lab.map((l) => [l.item || '', basis[l.basis] || '', qtyOf(l), blank(l.rate) ? '' : gbp(lineTotals({ ...l, qty: 1, markup: '' }).cost), markupText(l), gbp(lineTotals(l).total)]),
        foot: [['Labour total', '', '', gbp(t.labour.cost), gbp(t.labour.markup), gbp(t.labour.total)]],
      },
    });
  }
  const totals = [['Materials', gbp(t.materials.total)], ['Labour', gbp(t.labour.total)]];
  if (t.delivery.count) totals.push(['Delivery', gbp(t.delivery.total)]);
  totals.push([p.vat === 'inc' ? 'Net (before VAT)' : 'Total before VAT', gbp(t.net)], [p.vat === 'none' ? 'VAT (none)' : `VAT @ ${t.rate}%`, gbp(t.vat)], [p.vat === 'none' ? 'Total' : 'Total inc VAT', gbp(t.gross)]);
  sections.push({ heading: 'Totals', table: { cols: [{ title: '', w: 3 }, { title: 'Amount', w: 1.4, align: 'right' }], rows: totals } });
  return {
    title: 'Materials & Labour Costing',
    subtitle: addr.join(', '),
    footer: addr[0] || 'Costing',
    landscape: true,
    meta: [['Customer', p.customer], ['Customer address', custAddr], ['Job reference', p.ref], ['Prepared by', job.surveyor], ['Created', fmtDateTime(job.created)], ['Prices', vatText]],
    sections,
  };
}

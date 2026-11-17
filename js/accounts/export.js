// Accountancy: one tax year's receipts as an Excel workbook – the list, and the totals by category and month worked out
// with live formulas (SUMIFS) from the list, so changing a receipt in Excel changes the totals. The full accountant pack
// (spreadsheet, profit summary and all the pictures in one download) is a later phase.
import { CATEGORIES, UNSORTED, categoryOf, taxYearLabel, taxYearMonths, monthLabel } from './hmrc.js';
import { receiptsInYear, receiptParts, yearTotals } from './totals.js';

const head = (labels) => labels.map((v) => ({ v, s: 'headTeal' }));
const pounds = (p) => p / 100;

export function receiptsWorkbook(receipts, start, vatRegistered, businessName = '') {
  const list = receiptsInYear(receipts, start).sort((a, b) => a.date.localeCompare(b.date) || (a.created || '').localeCompare(b.created || ''));
  const t = yearTotals(receipts, start, { vatRegistered });

  // ----- Receipts -----
  const rows = [head(['Date', 'Supplier', 'Category', 'Total paid', 'VAT', 'VAT counted', 'Cost', 'Month', 'Notes'])];
  list.forEach((r, i) => {
    const n = i + 2;
    const p = receiptParts(r, vatRegistered);
    rows.push([
      { v: r.date, s: 'cell' }, { v: r.supplier || '', s: 'cell' }, { v: categoryOf(r.category).label, s: 'cell' },
      { v: Number(r.total) || 0, s: 'money' }, { v: r.vatOn && r.vat != null ? Number(r.vat) : '', s: 'money' }, { v: p.vat > 0 ? 'Yes' : 'No', s: 'cell' },
      { v: pounds(p.cost), f: `D${n}-IF(F${n}="Yes",E${n},0)`, s: 'money' }, { v: r.date.slice(0, 7), s: 'cell' }, { v: r.notes || '', s: 'cell' },
    ]);
  });
  const last = Math.max(2, list.length + 1);
  const range = (col) => `Receipts!$${col}$2:$${col}$${last}`;
  rows.push([], [{ v: `VAT counted = Yes when you are VAT registered and the receipt has VAT on it. Cost is the total less that VAT.`, s: 'note' }]);

  // ----- Totals -----
  const months = t.months.filter((m, i) => i < 12 || t.monthTotals[m]);
  const cols = months.length;
  const colL = (i) => String.fromCharCode(66 + i); // B, C, D …
  const yearCol = colL(cols);
  const tRows = [[{ v: `Receipts ${taxYearLabel(start)}${businessName ? ` – ${businessName}` : ''}`, s: 'title' }], [{ v: `Costs by tax return heading and month${vatRegistered ? ', without reclaimable VAT' : ''}. Worked out from the Receipts sheet.`, s: 'note' }], [{ v: 'Month (key)', s: 'note' }, ...months.map((m) => ({ v: m, s: 'note' }))]];
  tRows.push(head(['Category', ...months.map(monthLabel), 'Year']));
  const firstData = tRows.length + 1;
  for (const r of t.rows) {
    const n = tRows.length + 1;
    tRows.push([
      { v: r.label, s: 'cell' },
      ...months.map((m, i) => ({ v: pounds(r.byMonth[m] || 0), f: `SUMIFS(${range('G')},${range('C')},$A${n},${range('H')},${colL(i)}$3)`, s: 'money' })),
      { v: pounds(r.total), f: `SUM(B${n}:${colL(cols - 1)}${n})`, s: 'totalMoney' },
    ]);
  }
  const lastData = tRows.length;
  const tn = tRows.length + 1;
  tRows.push([{ v: 'Total', s: 'total' }, ...months.map((m, i) => ({ v: pounds(t.monthTotals[m] || 0), f: `SUM(${colL(i)}${firstData}:${colL(i)}${lastData})`, s: 'totalMoney' })), { v: pounds(t.total), f: `SUM(${yearCol}${firstData}:${yearCol}${lastData})`, s: 'totalMoney' }]);
  if (vatRegistered) tRows.push([], [{ v: 'VAT to reclaim', s: 'bold' }, { v: pounds(t.vat), f: `SUMIFS(${range('E')},${range('F')},"Yes")`, s: 'money' }]);
  void tn; void CATEGORIES; void UNSORTED;

  return {
    sheets: [
      { name: 'Totals', cols: [{ w: 48 }, ...months.map(() => ({ w: 13 })), { w: 14 }], rows: tRows, hideGrid: true, landscape: true },
      { name: 'Receipts', cols: [{ w: 12 }, { w: 26 }, { w: 48 }, { w: 12 }, { w: 10 }, { w: 12 }, { w: 12 }, { w: 10 }, { w: 40 }], rows, freeze: { row: 1 }, autoFilter: `A1:I${last}`, landscape: true },
    ],
  };
}

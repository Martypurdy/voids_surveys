// Accountancy: spending totals per category per month and per year. Pure functions, no DOM.
//
// VAT: when the business is VAT registered, the VAT on a receipt can be reclaimed, so the cost of a receipt that has VAT is its
// total less the VAT, and the VAT is added up separately. When it is not registered (or the receipt has no VAT), the whole
// amount is the cost. Money is added up in pence so totals never drift.
import { CATEGORIES, UNSORTED, taxYearStart, taxYearMonths } from './hmrc.js';

const pence = (x) => Math.round((Number(x) || 0) * 100);

/** Cost (excluding any reclaimable VAT) and VAT of one receipt, in pence. */
export function receiptParts(r, vatRegistered) {
  const total = pence(r.total);
  const vat = vatRegistered && r.vatOn ? Math.min(pence(r.vat), total) : 0;
  return { cost: total - vat, vat, total };
}

export const receiptsInYear = (receipts, start) => receipts.filter((r) => r.kind !== 'income' && taxYearStart(r.date) === start);

/**
 * Totals for one tax year.
 * Returns { months: [yyyy-mm…], rows: [{ key, label, short, byMonth: { 'yyyy-mm': pence }, total, vat }], monthTotals, total, vat, gross, count }.
 * Only categories with spending are in rows (plus "Not sorted yet" when there are unsorted receipts).
 */
export function yearTotals(receipts, start, { vatRegistered = false } = {}) {
  const list = receiptsInYear(receipts, start);
  const months = taxYearMonths(start);
  const cats = [...CATEGORIES, UNSORTED];
  const rows = cats.map((c) => ({ key: c.key, label: c.label, short: c.short, byMonth: {}, total: 0, vat: 0 }));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const monthTotals = {};
  let total = 0, vat = 0, gross = 0;
  for (const r of list) {
    const row = byKey.get(r.category) || byKey.get('');
    const key = r.date.slice(0, 7);
    const p = receiptParts(r, vatRegistered);
    row.byMonth[key] = (row.byMonth[key] || 0) + p.cost;
    row.total += p.cost;
    row.vat += p.vat;
    monthTotals[key] = (monthTotals[key] || 0) + p.cost;
    total += p.cost;
    vat += p.vat;
    gross += p.total;
  }
  return { months, rows: rows.filter((r) => r.total !== 0 || r.vat !== 0 || Object.keys(r.byMonth).length), monthTotals, total, vat, gross, count: list.length };
}

export const money = (p) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

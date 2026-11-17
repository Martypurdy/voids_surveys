// Quotes and invoices: the sums. Pure functions, no DOM. Money is worked out in pence so totals never drift.
//   line amount = quantity (blank counts as 1) x price, rounded to the penny
//   subtotal    = the lines added up
//   discount    = a £ amount or a % of the subtotal (never more than the subtotal)
//   net         = subtotal - discount
//   VAT         = net x rate, rounded once, when the document charges VAT
//   total       = net + VAT
//   paid        = a deposit or amount already paid (invoices), never more than the total
//   due         = total - paid
import { money } from '../pricing.js';

const pence = (x) => Math.round((Number(x) + Number.EPSILON) * 100);
const pounds = (p) => p / 100;
export { pence, pounds };

export const isBlankDocLine = (l) => !['item', 'qty', 'unit', 'price'].some((k) => String(l[k] ?? '').trim());
export const lineQty = (l) => (String(l.qty ?? '').trim() === '' ? 1 : money(l.qty));
/** One line's amount in pence. */
export const lineAmount = (l) => pence(lineQty(l) * money(l.price));

export function docTotals(doc) {
  const lines = (doc.lines || []).filter((l) => !isBlankDocLine(l));
  const subtotal = lines.reduce((a, l) => a + lineAmount(l), 0);
  const d = money(doc.discount);
  const discount = Math.max(0, Math.min(subtotal, doc.discountType === '%' ? Math.round((subtotal * d) / 100 + Number.EPSILON) : pence(d)));
  const net = subtotal - discount;
  const rate = doc.vat === 'plus' ? money(doc.vatRate) : 0;
  const vat = doc.vat === 'plus' ? pence(pounds(net) * rate / 100) : 0;
  const total = net + vat;
  const paid = Math.max(0, Math.min(total, pence(money(doc.deposit))));
  return { lines: lines.length, subtotal, discount, net, vat, total, paid, due: total - paid, rate };
}

export const fmtMoney = (p) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const addDays = (iso, days) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Status as shown to the user: an invoice that has been sent and is past its due date is "Overdue". */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function docStatus(doc, today = localToday()) {
  if (doc.kind === 'invoice' && doc.status === 'sent' && doc.due && doc.due < today) return 'overdue';
  return doc.status || 'draft';
}
export const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', paid: 'Paid', overdue: 'Overdue' };

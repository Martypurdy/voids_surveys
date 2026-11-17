// Quotes and invoices: starting one (company, number, dates, VAT), changing its company, and making one from another document.
import { loadBusinesses, getBusinesses, currentBusiness, takeNumber, releaseNumber, documentNumber } from '../accounts/store.js';
import { saveJob } from '../db.js';
import { newJob, todayLocal, newDocLine } from '../model.js';
import { getLastSurveyor } from '../surveyors.js';
import { addDays } from './money.js';
import { money, lineTotals, isBlankLine, sheetTotals } from '../pricing.js';

const days = (b, kind) => (kind === 'invoice' ? b.payDays : b.validDays);

/** Give a new quote or invoice its company, number, dates, VAT setting and standard terms. */
export async function initDoc(job, { businessId } = {}) {
  await loadBusinesses();
  const b = (businessId && getBusinesses().find((x) => x.id === businessId)) || currentBusiness();
  const d = job.doc;
  d.businessId = b.id;
  d.number = await takeNumber(b.id, d.kind);
  d.numberAuto = true; // an untouched number follows the company if it is changed
  d.issued = todayLocal();
  d.due = addDays(d.issued, days(b, d.kind));
  d.vat = b.vatRegistered ? 'plus' : 'none';
  d.terms = b.terms || '';
  return job;
}

/** Move a document to another company: its number follows (if it was not typed over), and so do the due date and standard terms. */
export async function changeBusiness(job, businessId) {
  await loadBusinesses();
  const d = job.doc;
  const from = getBusinesses().find((b) => b.id === d.businessId);
  const to = getBusinesses().find((b) => b.id === businessId);
  if (!to || to.id === d.businessId) return job;
  if (d.numberAuto) {
    if (from) await releaseNumber(from.id, d.kind, d.number);
    d.number = await takeNumber(to.id, d.kind);
  }
  if (from && d.due === addDays(d.issued, days(from, d.kind))) d.due = addDays(d.issued, days(to, d.kind));
  if (from && (d.terms === (from.terms || '') || !d.terms)) d.terms = to.terms || '';
  d.businessId = to.id;
  return job;
}
export { documentNumber };

// ---------- from a costing ----------
const priceOf = (net, qty) => String(Math.round((net / (qty || 1)) * 1e4) / 1e4); // up to 4 decimals so qty x price comes back to the line's amount

/**
 * The customer's lines from a Materials & labour costing: what the customer pays (cost plus your markup, before VAT), one line each for
 * materials and labour, and delivery charges. Cost and markup are not shown.
 */
export function linesFromCosting(p) {
  const rate = p.vat === 'inc' ? 1 + money(p.vatRate) / 100 : 1; // prices typed with VAT in them are brought back to before-VAT
  const out = [];
  for (const l of p.materials) {
    if (isBlankLine(l)) continue;
    const qty = String(l.qty ?? '').trim() === '' ? 1 : money(l.qty);
    const net = lineTotals(l).total / rate;
    out.push({ ...newDocLine(), item: l.item || '', qty: String(l.qty ?? '').trim(), unit: l.unit || '', price: priceOf(net, qty) });
  }
  for (const l of p.labour) {
    if (isBlankLine(l)) continue;
    const qty = String(l.qty ?? '').trim() === '' ? 1 : money(l.qty);
    const net = lineTotals(l).total / rate;
    const unit = { hour: 'hour', day: 'day' }[l.basis] || '';
    out.push({ ...newDocLine(), item: l.item || 'Labour', qty: String(l.qty ?? '').trim(), unit, price: priceOf(net, qty) });
  }
  for (const d of p.deliveries || []) {
    if (!money(d.cost)) continue;
    out.push({ ...newDocLine(), item: `Delivery${d.supplier ? ` – ${d.supplier}` : ''}`, qty: '1', unit: '', price: priceOf(money(d.cost) / rate, 1) });
  }
  return out.length ? out : [newDocLine()];
}

/** A new quote from a costing, in the same property. Returns the saved job. */
export async function quoteFromCosting(cost) {
  const job = newJob({ surveyor: cost.surveyor || getLastSurveyor(), form: 'quote' });
  job.propertyId = cost.propertyId;
  job.address = structuredClone(cost.address);
  await initDoc(job);
  const p = cost.pricing;
  const d = job.doc;
  d.customer = p.customer || '';
  d.customerAddress = { ...p.customerAddress };
  d.ref = p.ref || '';
  d.lines = linesFromCosting(p);
  d.vat = p.vat === 'none' ? 'none' : 'plus';
  d.vatRate = String(p.vatRate || 20);
  d.notes = p.notes || '';
  d.sourceId = cost.id;
  await saveJob(job);
  return job;
}

/** A new invoice from a quote (same customer, lines and VAT), linked both ways. The quote is marked Accepted. */
export async function invoiceFromQuote(quote) {
  const job = newJob({ surveyor: quote.surveyor || getLastSurveyor(), form: 'invoice' });
  job.propertyId = quote.propertyId;
  job.address = structuredClone(quote.address);
  await initDoc(job, { businessId: quote.doc.businessId });
  const q = quote.doc;
  const d = job.doc;
  d.customer = q.customer;
  d.customerAddress = { ...q.customerAddress };
  d.ref = q.ref;
  d.lines = q.lines.map((l) => ({ ...l, id: newDocLine().id }));
  d.vat = q.vat;
  d.vatRate = q.vatRate;
  d.discount = q.discount;
  d.discountType = q.discountType;
  d.notes = q.notes;
  d.quoteId = quote.id;
  d.sourceId = q.sourceId;
  q.invoiceId = job.id;
  if (q.status !== 'accepted') q.status = 'accepted';
  await saveJob(job);
  await saveJob(quote);
  return job;
}
export { sheetTotals };

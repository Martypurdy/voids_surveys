// Accountancy storage, on this device only. Receipts live in their own IndexedDB store; their pictures go in the usual
// photo store (with jobId 'receipts'). Supplier rules (a supplier you have filed under a category is filed there again
// automatically) live in the same store under a reserved key.
//
// A receipt: { id, kind: 'expense' | 'income', date: 'yyyy-mm-dd', supplier, total (what was paid, number), vat (number),
//   vatOn (does this receipt have VAT on it), category (an HMRC heading key, '' = not sorted yet), notes, photoId,
//   source: 'scan' | 'manual', businessId (which company or project it is for), propertyId, created, updated }.
// "income" is for invoices (Phase 7) so they can slot in without changing the data. Anything finance-related that is added later
// (invoices, quotes, mileage…) carries a businessId the same way.
//
// A business (company or project): { id, name, color (hex), vatRegistered, plus the details printed on quotes and invoices: address,
// phone, email, vatNumber, companyNumber, bank, terms, quotePrefix, invoicePrefix, nextQuote, nextInvoice, payDays, validDays }.
// There is always at least one.
import { createStore, get, set, del, values } from '../../vendor/idb-keyval.js';
import { putPhoto, deletePhotos } from '../db.js';
import { resizeImage, makeThumb } from '../photos.js';
import { uid, nowISO } from '../model.js';
import { allCategories, setCustomCategories } from './hmrc.js';

const store = createStore('voids-receipts', 'receipts');
const RULES = '__rules';
const CATS = '__categories';
const BIZ = '__businesses';
const SETTINGS = 'voids.accounts';

// ---------- settings (small, kept in localStorage) ----------
const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS) || '{}'); } catch { return {}; } };
export const getSettings = () => ({ vatRegistered: false, year: null, ...readSettings() });
export function setSettings(patch) {
  try { localStorage.setItem(SETTINGS, JSON.stringify({ ...readSettings(), ...patch })); } catch { /* storage blocked */ }
}

// ---------- receipts ----------
// ---------- businesses (companies or projects) ----------
// Light and mid tones, so the business name can be black text on the bar. (A darker colour you pick yourself gets white text instead.)
export const BUSINESS_COLORS = ['#64b5f6', '#81c784', '#ffb74d', '#dfa8ea', '#ef9a9a', '#4dd0e1', '#ffd54f', '#b0bec5', '#f48fb1', '#bcaaa4'];
let BUSINESSES = [];

/** Black or white, whichever reads better on this colour. */
export function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#111' : '#fff';
}

/** The details a business prints on its quotes and invoices, with their starting values. */
export const BUSINESS_DETAIL_DEFAULTS = { address: '', phone: '', email: '', vatNumber: '', companyNumber: '', bank: '', terms: '', quotePrefix: 'Q-', invoicePrefix: 'INV-', nextQuote: 1, nextInvoice: 1, payDays: 14, validDays: 30 };
const withDefaults = (b) => ({ ...BUSINESS_DETAIL_DEFAULTS, ...b });

/** Load the businesses (making a first one, with the VAT setting you had before, if there are none). */
export async function loadBusinesses() {
  let list = (await get(BIZ, store)) || [];
  if (!list.length) {
    list = [{ id: uid(), name: 'My business', color: BUSINESS_COLORS[0], vatRegistered: Boolean(readSettings().vatRegistered) }];
    await set(BIZ, list, store);
  }
  BUSINESSES = list.map(withDefaults); // older records gain the document details
  return BUSINESSES;
}
export const getBusinesses = () => BUSINESSES;
/** The business a receipt belongs to; receipts from before businesses existed belong to the first one. */
export const businessOf = (r) => (BUSINESSES.some((b) => b.id === r.businessId) ? r.businessId : BUSINESSES[0]?.id || '');
/** The business being worked in (remembered), else the first. */
export function currentBusiness() {
  return BUSINESSES.find((b) => b.id === readSettings().businessId) || BUSINESSES[0] || null;
}
export const selectBusiness = (id) => setSettings({ businessId: id });

const cleanName = (n) => String(n ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
const cleanColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : BUSINESS_COLORS[0]);

const DETAIL_TEXT = ['address', 'phone', 'email', 'vatNumber', 'companyNumber', 'bank', 'terms', 'quotePrefix', 'invoicePrefix'];
const DETAIL_NUM = { nextQuote: [1, 999999], nextInvoice: [1, 999999], payDays: [0, 365], validDays: [0, 365] };
/** Copy the document details from a patch, cleaned. */
function applyDetails(b, patch) {
  for (const k of DETAIL_TEXT) if (patch[k] != null) b[k] = String(patch[k]).slice(0, k === 'bank' || k === 'terms' || k === 'address' ? 600 : 60).replace(/\r/g, '');
  for (const [k, [lo, hi]] of Object.entries(DETAIL_NUM)) if (patch[k] != null && patch[k] !== '') { const n = Math.round(Number(patch[k])); if (Number.isFinite(n)) b[k] = Math.max(lo, Math.min(hi, n)); }
}

export async function addBusiness({ name, color, vatRegistered = false, ...details }) {
  const n = cleanName(name);
  if (!n) throw new Error('Type the business name first');
  if (BUSINESSES.some((b) => b.name.toLowerCase() === n.toLowerCase())) throw new Error(`You already have “${n}”`);
  const b = withDefaults({ id: uid(), name: n, color: cleanColor(color || BUSINESS_COLORS[BUSINESSES.length % BUSINESS_COLORS.length]), vatRegistered: Boolean(vatRegistered) });
  applyDetails(b, details);
  BUSINESSES = [...BUSINESSES, b];
  await set(BIZ, BUSINESSES, store);
  return b;
}
export async function updateBusiness(id, patch) {
  const b = BUSINESSES.find((x) => x.id === id);
  if (!b) return null;
  if (patch.name != null) {
    const n = cleanName(patch.name);
    if (!n) throw new Error('A business needs a name');
    if (BUSINESSES.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error(`You already have “${n}”`);
    b.name = n;
  }
  if (patch.color != null) b.color = cleanColor(patch.color);
  if (patch.vatRegistered != null) b.vatRegistered = Boolean(patch.vatRegistered);
  applyDetails(b, patch);
  await set(BIZ, BUSINESSES, store);
  return b;
}

// ---------- quote and invoice numbers (per business) ----------
const pad4 = (n) => String(n).padStart(4, '0');
export const documentNumber = (b, kind) => (kind === 'invoice' ? `${b.invoicePrefix}${pad4(b.nextInvoice)}` : `${b.quotePrefix}${pad4(b.nextQuote)}`);
/** Take the business's next number for a quote or invoice (and move its counter on). */
export async function takeNumber(businessId, kind) {
  const b = BUSINESSES.find((x) => x.id === businessId) || BUSINESSES[0];
  if (!b) return '';
  const n = documentNumber(b, kind);
  if (kind === 'invoice') b.nextInvoice += 1; else b.nextQuote += 1;
  await set(BIZ, BUSINESSES, store);
  return n;
}
/** Give a number back when it is the last one issued (so changing a document's company leaves no gap). */
export async function releaseNumber(businessId, kind, number) {
  const b = BUSINESSES.find((x) => x.id === businessId);
  if (!b) return;
  const prefix = kind === 'invoice' ? b.invoicePrefix : b.quotePrefix;
  const next = kind === 'invoice' ? b.nextInvoice : b.nextQuote;
  if (number === `${prefix}${pad4(next - 1)}` && next > 1) {
    if (kind === 'invoice') b.nextInvoice -= 1; else b.nextQuote -= 1;
    await set(BIZ, BUSINESSES, store);
  }
}
/** Remove a business. Its receipts are moved to moveTo, or deleted (with their pictures) when moveTo is empty. The last one cannot be removed. */
export async function removeBusiness(id, moveTo = '') {
  if (BUSINESSES.length <= 1) throw new Error('You need at least one business');
  const mine = (await listReceipts()).filter((r) => businessOf(r) === id);
  for (const r of mine) {
    if (moveTo) { r.businessId = moveTo; await saveReceipt(r); } else await deleteReceipt(r);
  }
  const rules = await getRules();
  for (const k of Object.keys(rules)) if (k.startsWith(`${id}|`)) delete rules[k];
  await set(RULES, rules, store);
  BUSINESSES = BUSINESSES.filter((b) => b.id !== id);
  await set(BIZ, BUSINESSES, store);
  if (readSettings().businessId === id) setSettings({ businessId: null });
}

// ---------- receipts ----------
export function newReceipt(over = {}) {
  const t = nowISO();
  const biz = over.businessId ? BUSINESSES.find((b) => b.id === over.businessId) : currentBusiness();
  return { id: uid(), kind: 'expense', date: '', supplier: '', total: null, vat: null, vatOn: Boolean(biz?.vatRegistered), category: '', notes: '', photoId: '', source: 'manual', businessId: biz?.id || '', propertyId: '', created: t, updated: t, ...over };
}

export async function listReceipts() {
  const all = await values(store);
  return all.filter((r) => r && r.id && !String(r.id).startsWith('__'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
}
export const getReceipt = (id) => get(id, store);
export async function saveReceipt(r) {
  r.updated = nowISO();
  await set(r.id, r, store);
  return r;
}
export async function deleteReceipt(r) {
  if (r.photoId) await deletePhotos([r.photoId]);
  await del(r.id, store);
}

/** Store a receipt picture (kept at a size that is still readable) and return its photo id. */
export async function storeReceiptImage(blob) {
  const full = await resizeImage(blob, 2200, 0.82);
  const thumb = await makeThumb(full.blob);
  const rec = { id: uid(), jobId: 'receipts', blob: full.blob, thumb, w: full.w, h: full.h, created: nowISO() };
  await putPhoto(rec);
  return rec.id;
}

// ---------- your own categories ----------
/** Load the categories you have added into the shared list (call when the screen opens). */
export async function loadCustomCategories() {
  const list = (await get(CATS, store)) || [];
  setCustomCategories(list);
  return list;
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'category';
/** Add a category with your own name. Returns it (the existing one if the name is already there); throws if the name is empty. */
export async function addCustomCategory(label) {
  const name = String(label ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) throw new Error('Type a name for the category first');
  const same = allCategories().find((c) => c.label.toLowerCase() === name.toLowerCase() || c.short.toLowerCase() === name.toLowerCase());
  if (same) return same;
  const list = (await get(CATS, store)) || [];
  let key = `custom-${slug(name)}`;
  for (let i = 2; list.some((c) => c.key === key); i++) key = `custom-${slug(name)}-${i}`;
  list.push({ key, label: name });
  await set(CATS, list, store);
  setCustomCategories(list);
  return { key, label: name, short: name, custom: true };
}
/** Remove one of your own categories: its receipts go back to "Not sorted yet" and its supplier rules are dropped. */
export async function removeCustomCategory(key) {
  const list = ((await get(CATS, store)) || []).filter((c) => c.key !== key);
  await set(CATS, list, store);
  setCustomCategories(list);
  for (const r of await listReceipts()) if (r.category === key) { r.category = ''; await saveReceipt(r); }
  const rules = await getRules();
  let changed = false;
  for (const [k, v] of Object.entries(rules)) if (v.category === key) { delete rules[k]; changed = true; }
  if (changed) await writeRules(rules);
}

// ---------- supplier rules ----------
/** "Screwfix Ltd." and "SCREWFIX" are the same supplier. */
export const supplierKey = (name) => String(name || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|uk)\b/g, '').replace(/[^a-z0-9]+/g, '');

/**
 * Supplier rules are kept per business (the same shop can be filed differently for a different company). Stored as
 * 'businessId|supplier' -> { category, name }; rules from before businesses existed belong to the first business.
 */
export async function getRules(businessId) {
  const raw = (await get(RULES, store)) || {};
  const first = BUSINESSES[0]?.id || '';
  const all = {};
  for (const [k, v] of Object.entries(raw)) all[k.includes('|') ? k : `${first}|${k}`] = v;
  if (!businessId) return all;
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith(`${businessId}|`)) out[k] = v;
  return out;
}
const writeRules = (all) => set(RULES, all, store);
/** Remember that this supplier goes under this category for this business (an empty category forgets it). */
export async function ruleFor(supplier, category, businessId = currentBusiness()?.id || '') {
  const key = supplierKey(supplier);
  if (!key) return;
  const all = await getRules();
  const k = `${businessId}|${key}`;
  if (category) all[k] = { category, name: supplier };
  else delete all[k];
  await writeRules(all);
}
export async function forgetRule(fullKey) {
  const all = await getRules();
  delete all[fullKey];
  await writeRules(all);
}
export async function categoryForSupplier(supplier, businessId = currentBusiness()?.id || '') {
  const all = await getRules(businessId);
  return all[`${businessId}|${supplierKey(supplier)}`]?.category || '';
}
/** Supplier names already used by a business, for suggestions and for spotting them in scanned text. */
export async function knownSuppliers(businessId = currentBusiness()?.id || '') {
  const names = new Map();
  for (const r of await listReceipts()) if (businessOf(r) === businessId && r.supplier?.trim()) names.set(supplierKey(r.supplier), r.supplier.trim());
  for (const v of Object.values(await getRules(businessId))) if (v.name) names.set(supplierKey(v.name), v.name);
  return [...names.values()];
}

// ---------- income (paid invoices) ----------
// A paid invoice is kept in the accountancy data as a record of kind 'income' with the id 'inv-<invoice job id>'. It follows the invoice:
// marking the invoice paid creates it, changing it updates it, and un-marking (or deleting the invoice) removes it.
const incomeId = (jobId) => `inv-${jobId}`;
export async function syncIncome(job, totals) {
  const doc = job.doc;
  const id = incomeId(job.id);
  if (!doc || doc.kind !== 'invoice' || doc.status !== 'paid' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.paidDate || '')) {
    await del(id, store);
    return null;
  }
  const rec = (await get(id, store)) || newReceipt({ id, kind: 'income', source: 'invoice' });
  Object.assign(rec, {
    id, kind: 'income', source: 'invoice', date: doc.paidDate, supplier: doc.customer || 'Customer', total: totals.total / 100, vat: totals.vat ? totals.vat / 100 : null,
    vatOn: totals.vat > 0, category: '', notes: `Invoice ${doc.number}`, businessId: doc.businessId, invoiceId: job.id, propertyId: job.propertyId || '', photoId: '',
  });
  await saveReceipt(rec);
  return rec;
}
export const removeIncomeFor = (jobId) => del(incomeId(jobId), store);
/** Drop income records whose invoice no longer exists or is no longer paid (call when the accountancy screen opens). */
export async function pruneIncome(getJobById) {
  for (const r of await listReceipts()) {
    if (r.kind !== 'income' || !r.invoiceId) continue;
    const job = await getJobById(r.invoiceId);
    if (!job?.doc || job.doc.status !== 'paid') await del(r.id, store);
  }
}

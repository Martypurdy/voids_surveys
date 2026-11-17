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
// A business (company or project): { id, name, color (hex), vatRegistered }. There is always at least one.
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
export const BUSINESS_COLORS = ['#1f5f8b', '#2e7d32', '#c2410c', '#7b1fa2', '#b3261e', '#00838f', '#a86b00', '#455a64', '#ad1457', '#5d4037'];
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

/** Load the businesses (making a first one, with the VAT setting you had before, if there are none). */
export async function loadBusinesses() {
  let list = (await get(BIZ, store)) || [];
  if (!list.length) {
    list = [{ id: uid(), name: 'My business', color: BUSINESS_COLORS[0], vatRegistered: Boolean(readSettings().vatRegistered) }];
    await set(BIZ, list, store);
  }
  BUSINESSES = list;
  return list;
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

export async function addBusiness({ name, color, vatRegistered = false }) {
  const n = cleanName(name);
  if (!n) throw new Error('Type the business name first');
  if (BUSINESSES.some((b) => b.name.toLowerCase() === n.toLowerCase())) throw new Error(`You already have “${n}”`);
  const b = { id: uid(), name: n, color: cleanColor(color || BUSINESS_COLORS[BUSINESSES.length % BUSINESS_COLORS.length]), vatRegistered: Boolean(vatRegistered) };
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
  await set(BIZ, BUSINESSES, store);
  return b;
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

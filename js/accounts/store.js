// Accountancy storage, on this device only. Receipts live in their own IndexedDB store; their pictures go in the usual
// photo store (with jobId 'receipts'). Supplier rules (a supplier you have filed under a category is filed there again
// automatically) live in the same store under a reserved key.
//
// A receipt: { id, kind: 'expense' | 'income', date: 'yyyy-mm-dd', supplier, total (what was paid, number), vat (number),
//   vatOn (does this receipt have VAT on it), category (an HMRC heading key, '' = not sorted yet), notes, photoId,
//   source: 'scan' | 'manual', propertyId, created, updated }.
// "income" is for invoices (Phase 7) so they can slot in without changing the data.
import { createStore, get, set, del, values } from '../../vendor/idb-keyval.js';
import { putPhoto, deletePhotos } from '../db.js';
import { resizeImage, makeThumb } from '../photos.js';
import { uid, nowISO } from '../model.js';
import { allCategories, setCustomCategories } from './hmrc.js';

const store = createStore('voids-receipts', 'receipts');
const RULES = '__rules';
const CATS = '__categories';
const SETTINGS = 'voids.accounts';

// ---------- settings (small, kept in localStorage) ----------
const readSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS) || '{}'); } catch { return {}; } };
export const getSettings = () => ({ vatRegistered: false, year: null, ...readSettings() });
export function setSettings(patch) {
  try { localStorage.setItem(SETTINGS, JSON.stringify({ ...readSettings(), ...patch })); } catch { /* storage blocked */ }
}

// ---------- receipts ----------
export function newReceipt(over = {}) {
  const t = nowISO();
  return { id: uid(), kind: 'expense', date: '', supplier: '', total: null, vat: null, vatOn: getSettings().vatRegistered, category: '', notes: '', photoId: '', source: 'manual', propertyId: '', created: t, updated: t, ...over };
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
  if (changed) await set(RULES, rules, store);
}

// ---------- supplier rules ----------
/** "Screwfix Ltd." and "SCREWFIX" are the same supplier. */
export const supplierKey = (name) => String(name || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|uk)\b/g, '').replace(/[^a-z0-9]+/g, '');

export async function getRules() {
  return (await get(RULES, store)) || {};
}
/** Remember that this supplier goes under this category (an empty category forgets it). */
export async function ruleFor(supplier, category) {
  const key = supplierKey(supplier);
  if (!key) return;
  const rules = await getRules();
  if (category) rules[key] = { category, name: supplier };
  else delete rules[key];
  await set(RULES, rules, store);
}
export async function forgetRule(key) {
  const rules = await getRules();
  delete rules[key];
  await set(RULES, rules, store);
}
export async function categoryForSupplier(supplier) {
  const rules = await getRules();
  return rules[supplierKey(supplier)]?.category || '';
}
/** Supplier names already used, for suggestions and for spotting them in scanned text. */
export async function knownSuppliers() {
  const names = new Map();
  for (const r of await listReceipts()) if (r.supplier?.trim()) names.set(supplierKey(r.supplier), r.supplier.trim());
  for (const v of Object.values(await getRules())) if (v.name) names.set(supplierKey(v.name), v.name);
  return [...names.values()];
}

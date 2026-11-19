// IndexedDB storage (via idb-keyval). Stores:
//   jobs       – entries (inspections, plans, costings…): job objects, photos referenced by id only
//   photos     – { id, jobId, blob, thumb, w, h, created }
//   properties – one per address: { id, address, ref, entries: [summary…], search… } – the front screen reads only these
//   premigration – a copy of the job records as they were before they were filed into properties (safety net)
import { createStore, get, set, del, values, keys, getMany, setMany, delMany } from '../vendor/idb-keyval.js';
import { allPhotoIds, nowISO, upgradeJob } from './model.js';
import { deleteFilesFor, moveFilesTo } from './files.js';
import { entrySummary, indexProperty, refreshActivity, newProperty, propKey, sameAddress } from './properties.js';

const jobStore = createStore('voids-jobs', 'jobs');
const photoStore = createStore('voids-photos', 'photos');
const propertyStore = createStore('voids-properties', 'properties');
const legacyStore = createStore('voids-premigration', 'jobs');

// ---------- Jobs (entries) ----------

export async function listJobs() {
  const jobs = await values(jobStore);
  jobs.forEach(upgradeJob);
  return jobs.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}

export async function getJob(id) {
  const job = await get(id, jobStore);
  if (!job) return job;
  upgradeJob(job);
  // The property owns the address: an entry always shows the property's current one.
  if (job.propertyId) {
    const p = await get(job.propertyId, propertyStore);
    if (p) job.address = { ...job.address, ...structuredClone(p.address) };
  }
  return job;
}

export async function saveJob(job, { touch = true } = {}) {
  if (touch) job.updated = nowISO();
  await set(job.id, job, jobStore);
  await syncProperty(job);
}

/** Keep the property's summary of this entry (and its address, if the entry's Address tab changed it) current. */
async function syncProperty(job) {
  if (!job.propertyId) return;
  const p = await get(job.propertyId, propertyStore);
  if (!p) return;
  const summary = entrySummary(job);
  const i = p.entries.findIndex((e) => e.id === job.id);
  if (i >= 0) p.entries[i] = summary; else p.entries.push(summary);
  if (!sameAddress(p.address, job.address)) p.address = structuredClone(job.address);
  refreshActivity(p);
  p.last = p.entries.reduce((m, e) => ((e.updated || '') > m ? e.updated : m), p.created || '');
  await savePropertyRaw(p);
}

export async function deleteJob(id) {
  const job = await get(id, jobStore);
  if (job) await delMany(allPhotoIds(job), photoStore);
  await del(id, jobStore);
  if (job?.propertyId) {
    const p = await get(job.propertyId, propertyStore);
    if (p) {
      p.entries = p.entries.filter((e) => e.id !== id);
      refreshActivity(p);
      await savePropertyRaw(p);
    }
  }
}

// ---------- Properties ----------

const savePropertyRaw = (p) => set(p.id, indexProperty(p), propertyStore);
export const saveProperty = (p) => savePropertyRaw(p);
export const listProperties = () => values(propertyStore);
export const getProperty = (id) => get(id, propertyStore);

/** The property with this address (same postcode and first line), if there is one. */
export async function findProperty(address) {
  const key = propKey(address);
  if (!key) return null;
  return (await listProperties()).find((p) => propKey(p.address) === key) || null;
}

export async function findOrCreateProperty(address) {
  const found = await findProperty(address);
  if (found) return found;
  const p = newProperty(address);
  await savePropertyRaw(p);
  return p;
}

/** Delete a property and every entry (and photo) in it. */
export async function deleteProperty(id) {
  const p = await get(id, propertyStore);
  if (p) for (const e of p.entries) await deleteJob(e.id);
  await deleteFilesFor(id);
  await del(id, propertyStore);
}

/** File an entry under another property (it takes that property's address). */
export async function moveEntry(job, toId) {
  const to = await get(toId, propertyStore);
  if (!to) throw new Error('That property is not on this device');
  if (job.propertyId && job.propertyId !== toId) {
    const from = await get(job.propertyId, propertyStore);
    if (from) {
      from.entries = from.entries.filter((e) => e.id !== job.id);
      refreshActivity(from);
      await savePropertyRaw(from);
    }
  }
  job.propertyId = toId;
  job.address = structuredClone(to.address);
  await saveJob(job, { touch: false });
}

/** Move every entry of one property into another, then remove the empty property. */
export async function mergeProperties(fromId, toId) {
  const from = await get(fromId, propertyStore);
  if (!from || fromId === toId) return;
  for (const e of [...from.entries]) {
    const job = await getJob(e.id);
    if (job) await moveEntry(job, toId);
  }
  await moveFilesTo(fromId, toId);
  await del(fromId, propertyStore);
}

/**
 * Two properties with the same postcode and first address line are the same place (for example a quick job
 * that was given an address later): move the later one's entries into the earlier one. Returns how many merged.
 */
export async function consolidateProperties() {
  const props = (await listProperties()).sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  const seen = new Map();
  let merged = 0;
  for (const p of props) {
    const key = propKey(p.address);
    if (!key) continue;
    const keep = seen.get(key);
    if (!keep) { seen.set(key, p); continue; }
    await mergeProperties(p.id, keep.id);
    merged++;
  }
  return merged;
}

/**
 * File entries that aren't in a property yet (existing jobs from before properties, imports, anything
 * left over). Entries with the same postcode and first address line share a property; anything without
 * both stays on its own so nothing is merged wrongly. Safe to run on every start: it only reads job ids,
 * and only loads the ones that are not filed. Nothing in a job changes except its propertyId.
 */
export async function adoptOrphans() {
  const ids = await keys(jobStore);
  const props = await listProperties();
  const filed = new Set(props.flatMap((p) => p.entries.map((e) => e.id)));
  const orphanIds = ids.filter((id) => !filed.has(id));
  if (!orphanIds.length) return 0;
  const jobs = (await getMany(orphanIds, jobStore)).filter(Boolean);
  jobs.forEach(upgradeJob);
  if (!props.length) await setMany(jobs.map((j) => [j.id, j]), legacyStore); // first run: keep the original records

  const byId = new Map(props.map((p) => [p.id, p]));
  const byKey = new Map();
  for (const p of props) { const k = propKey(p.address); if (k && !byKey.has(k)) byKey.set(k, p); }
  const touched = new Set();
  const place = (job, p) => {
    job.propertyId = p.id;
    const i = p.entries.findIndex((e) => e.id === job.id);
    const summary = entrySummary(job);
    if (i >= 0) p.entries[i] = summary; else p.entries.push(summary);
    touched.add(p);
  };
  for (const job of jobs.sort((x, y) => (x.created || '').localeCompare(y.created || ''))) {
    let p = job.propertyId && byId.get(job.propertyId); // already pointing at a property: just repair its summary
    if (!p) {
      const key = propKey(job.address);
      p = key && byKey.get(key);
      if (!p) {
        p = newProperty(job.address);
        p.created = job.created || p.created;
        byId.set(p.id, p);
        if (key) byKey.set(key, p);
      } else if ((job.address.text || '').length > (p.address.text || '').length) {
        p.address = structuredClone(job.address); // keep the most complete address
      }
    }
    place(job, p);
  }
  for (const job of jobs) await set(job.id, job, jobStore); // raw write: timestamps stay as they were
  for (const p of touched) {
    p.created = p.entries.reduce((m, e) => (!m || (e.created || m) < m ? e.created || m : m), '') || p.created;
    refreshActivity(p);
    p.last = p.entries.reduce((m, e) => ((e.updated || '') > m ? e.updated : m), p.created || '');
    await savePropertyRaw(p);
  }
  return jobs.length;
}

// ---------- Debounced autosave ----------

let pending = null;
let timer = 0;

/** Save soon (coalesces rapid edits such as typing). */
export function scheduleSave(job, delay = 400) {
  pending = job;
  clearTimeout(timer);
  timer = setTimeout(flushSave, delay);
}

/** Write any pending save now. Safe to call repeatedly. */
export async function flushSave() {
  clearTimeout(timer);
  const job = pending;
  pending = null;
  if (job) await saveJob(job);
}

// ---------- Photos ----------

export const putPhoto = (rec) => set(rec.id, rec, photoStore);
export const getPhoto = (id) => get(id, photoStore);
export const getPhotos = (ids) => getMany(ids, photoStore);
export const putPhotos = (recs) => setMany(recs.map((r) => [r.id, r]), photoStore);
export const deletePhotos = (ids) => delMany(ids, photoStore);

// ---------- Persistence ----------

/** Ask the browser not to evict our data. Returns true if persisted. */
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo() {
  try {
    const [persisted, est] = await Promise.all([
      navigator.storage?.persisted?.() ?? false,
      navigator.storage?.estimate?.() ?? null,
    ]);
    return { persisted, usage: est?.usage ?? null };
  } catch {
    return { persisted: false, usage: null };
  }
}

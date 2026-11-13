// IndexedDB storage (via idb-keyval). Two stores:
//   jobs   – job objects (photos referenced by id only)
//   photos – { id, jobId, blob, thumb, w, h, created }
import { createStore, get, set, del, values, getMany, setMany, delMany } from '../vendor/idb-keyval.js';
import { allPhotoIds, nowISO } from './model.js';

const jobStore = createStore('voids-jobs', 'jobs');
const photoStore = createStore('voids-photos', 'photos');

// ---------- Jobs ----------

export async function listJobs() {
  const jobs = await values(jobStore);
  return jobs.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}

export const getJob = (id) => get(id, jobStore);

export async function saveJob(job) {
  job.updated = nowISO();
  await set(job.id, job, jobStore);
}

export async function deleteJob(id) {
  const job = await getJob(id);
  if (job) await delMany(allPhotoIds(job), photoStore);
  await del(id, jobStore);
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

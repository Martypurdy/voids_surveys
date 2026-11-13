// .json job file: full backup / transfer, photos embedded as base64.
import { getJob, saveJob, deleteJob, putPhotos } from '../db.js';
import { SCHEMA, allPhotoIds, remapPhotoIds, uid, nowISO, slug, jobTitle, todayLocal, newKeySafe, upgradeJob } from '../model.js';
import { loadPhotos, makeThumb } from '../photos.js';
import { choose, toast, busy } from '../ui.js';

const APP = 'voids_surveys';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function jsonFilename(job) {
  return `void-survey-${slug(jobTitle(job))}-${todayLocal()}.json`;
}

/** Build the backup file. The key safe code is blanked unless includeCode. */
export async function buildJobFile(job, { includeCode = false } = {}) {
  const copy = structuredClone(job);
  if (!includeCode) copy.keySafe.code = '';
  const photos = [];
  for (const rec of await loadPhotos(allPhotoIds(job))) {
    photos.push({ id: rec.id, type: rec.blob.type || 'image/jpeg', w: rec.w, h: rec.h, created: rec.created, data: await blobToBase64(rec.blob) });
  }
  const payload = { app: APP, schema: SCHEMA, exported: nowISO(), codeIncluded: includeCode, job: copy, photos };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

/** Record a successful backup (drives the "not backed up since" warning). */
export async function markExported(job) {
  job.lastExported = nowISO();
  await saveJob(job);
}

function validate(data) {
  if (!data || data.app !== APP || !data.job || !Array.isArray(data.photos)) {
    throw new Error('Not a void survey job file');
  }
  if (data.schema > SCHEMA) throw new Error('This file was made by a newer version of the app');
  const j = data.job;
  for (const k of ['rooms', 'externals', 'keys', 'meters']) if (!Array.isArray(j[k])) j[k] = [];
  j.keySafe = { ...newKeySafe(), ...(j.keySafe || {}) };
  j.address ||= {};
  upgradeJob(j);
  for (const list of [...j.rooms, ...j.externals, ...j.keys, ...j.meters]) {
    if (!Array.isArray(list.photos)) list.photos = [];
  }
  return data;
}

/**
 * Import a job file chosen by the user. If the job already exists on this
 * device, asks whether to replace it or keep both. Returns the job or null.
 */
export async function importJobFile(file) {
  let data;
  try {
    data = validate(JSON.parse(await file.text()));
  } catch (e) {
    toast(e instanceof SyntaxError ? 'That file isn’t valid JSON' : e.message);
    return null;
  }
  const job = data.job;

  const existing = await getJob(job.id);
  if (existing) {
    const choice = await choose({
      title: 'Job already on this device',
      message: `“${jobTitle(existing)}” already exists here. Replace it with the imported copy, or keep both?`,
      buttons: [
        { label: 'Keep both (import as copy)', value: 'copy', class: 'btn-primary' },
        { label: 'Replace existing', value: 'replace', class: 'btn-danger' },
        { label: 'Cancel', value: null },
      ],
    });
    if (!choice) return null;
    if (choice === 'replace') {
      // Don't wipe a code we already have just because the file omitted it.
      if (!data.codeIncluded && existing.keySafe?.code) job.keySafe.code = existing.keySafe.code;
      await deleteJob(existing.id);
    } else {
      job.id = uid();
      const map = new Map(data.photos.map((p) => [p.id, uid()]));
      data.photos.forEach((p) => { p.id = map.get(p.id); });
      remapPhotoIds(job, map);
    }
  }

  const progress = busy('Importing…');
  try {
    const recs = [];
    for (let i = 0; i < data.photos.length; i++) {
      progress.update(`Importing photo ${i + 1} of ${data.photos.length}…`);
      const p = data.photos[i];
      const blob = base64ToBlob(p.data, p.type || 'image/jpeg');
      recs.push({ id: p.id, jobId: job.id, blob, thumb: await makeThumb(blob), w: p.w, h: p.h, created: p.created || nowISO() });
    }
    // Drop references to photos that weren't in the file.
    const have = new Set(recs.map((r) => r.id));
    for (const list of [...job.rooms, ...job.externals, ...job.keys, ...job.meters, job.keySafe].map((x) => x.photos)) {
      for (let i = list.length - 1; i >= 0; i--) if (!have.has(list[i])) list.splice(i, 1);
    }
    await putPhotos(recs);
    // The file itself is a backup as of its export date.
    job.lastExported = data.exported || null;
    await saveJob(job);
    toast(`Imported “${jobTitle(job)}”${data.codeIncluded ? '' : ' (key safe code not included)'}`);
    return job;
  } catch (e) {
    console.error(e);
    toast(`Import failed: ${e.message}`);
    return null;
  } finally {
    progress.close();
  }
}

// Packs: one entry (or a whole property's history) as a zip. Each entry is a folder holding the entry
// data (entry.json – the same shape as a backup, with the photos as separate image files), its photos
// and the PDF report. A pack can be imported again.
import { zipFiles, readZip } from './zip.js';
import { getJob } from '../db.js';
import { loadPhotos } from '../photos.js';
import { allPhotoIds, SCHEMA, nowISO, todayLocal } from '../model.js';
import { fileBase, addressTitle, natureOf } from '../properties.js';

const APP = 'voids_surveys';
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
const dec = new TextDecoder();

const README = `PropertyPad file
================
Each folder is one entry (an inspection, plan, costing…): the entry itself (entry.json),
its photos (photos/) and the PDF report. To put it back into PropertyPad, use the Import
button on the front screen and choose this .zip file.
`;

async function entryFiles(job, folder, { includeCode = false, reports = true, onProgress = () => {} } = {}) {
  const copy = structuredClone(job);
  if (!includeCode && copy.keySafe) copy.keySafe.code = '';
  const files = [];
  const photos = [];
  (await loadPhotos(allPhotoIds(job))).forEach((rec, i) => {
    const ext = (rec.blob.type || '').includes('png') ? 'png' : 'jpg';
    const file = `photos/${String(i + 1).padStart(3, '0')}-${rec.id.slice(0, 8)}.${ext}`;
    photos.push({ id: rec.id, file, type: rec.blob.type || 'image/jpeg', w: rec.w, h: rec.h, created: rec.created });
    files.push({ name: `${folder}/${file}`, data: rec.blob });
  });
  files.push({ name: `${folder}/entry.json`, data: JSON.stringify({ app: APP, schema: SCHEMA, kind: 'entry-pack', exported: nowISO(), codeIncluded: includeCode, job: copy, photos }, null, 1) });
  if (!reports) return files; // a bulk backup: the entry and its photos are enough to restore it
  try {
    onProgress('Building the report…');
    const { buildPdf } = await import('./pdf.js');
    files.push({ name: `${folder}/${safe(fileBase(job))}.pdf`, data: await buildPdf(job, { includeCode }) });
  } catch (e) {
    console.warn('The report could not be added to the pack', e);
  }
  try {
    const { exportDocument, bestEditable } = await import('./engine.js'); // Excel for costings and plans, Word for inspections
    onProgress('Adding the editable copy…');
    const r = await exportDocument(job, bestEditable(job), { includeCode, onProgress });
    files.push({ name: `${folder}/${safe(r.filename)}`, data: r.blob });
  } catch (e) {
    console.warn('The editable copy could not be added to the pack', e);
  }
  return files;
}

/** One entry: { blob, filename }. */
export async function buildEntryPack(job, opts = {}) {
  const folder = safe(fileBase(job));
  const files = await entryFiles(job, folder, opts);
  files.push({ name: `${folder}/README.txt`, data: README });
  return { blob: await zipFiles(files), filename: `${folder} - pack - ${todayLocal()}.zip` };
}

/** A whole property: a folder per entry, oldest first (so they sort in date order). */
export async function buildPropertyPack(p, { includeCode = false, onProgress = () => {} } = {}) {
  const top = `${safe(addressTitle(p.address))} - property file`;
  const files = [{ name: `${top}/README.txt`, data: README }];
  const used = new Set();
  const entries = [...p.entries].sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  for (let i = 0; i < entries.length; i++) {
    onProgress(`Entry ${i + 1} of ${entries.length}…`);
    const job = await getJob(entries[i].id);
    if (!job) continue;
    let folder = `${top}/${(job.created || '').slice(0, 10)} - ${safe(natureOf(job))}`;
    if (used.has(folder)) folder += ` (${job.id.slice(0, 4)})`;
    used.add(folder);
    files.push(...await entryFiles(job, folder, { includeCode, onProgress }));
  }
  return { blob: await zipFiles(files), filename: `${top} - ${todayLocal()}.zip` };
}

/**
 * Many entries as one or more zips (a backup you can import again). A new zip is started when the photos so far pass
 * maxBytes, so a big clear-out does not need all the device's memory at once. jobs: full job objects.
 * Returns [{ blob, filename }].
 */
export async function buildBatchPacks(jobs, { includeCode = false, reports = false, maxBytes = 120e6, onProgress = () => {} } = {}) {
  const top = `PropertyPad backup ${todayLocal()}`;
  const parts = [];
  let files = [];
  let bytes = 0;
  const used = new Set();
  const flush = () => { if (files.length) { parts.push(files); files = []; bytes = 0; } };
  for (let i = 0; i < jobs.length; i++) {
    onProgress(`Packing ${i + 1} of ${jobs.length}…`);
    const job = jobs[i];
    let folder = `${safe(addressTitle(job.address))} - ${(job.created || '').slice(0, 10)} - ${safe(natureOf(job))}`.slice(0, 150);
    if (used.has(folder)) folder += ` (${job.id.slice(0, 4)})`;
    used.add(folder);
    const f = await entryFiles(job, folder, { includeCode, reports });
    const size = f.reduce((n, x) => n + (x.data?.size ?? x.data?.length ?? 0), 0);
    if (files.length && bytes + size > maxBytes) flush();
    files.push(...f);
    bytes += size;
  }
  flush();
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    onProgress(parts.length > 1 ? `Zipping part ${i + 1} of ${parts.length}…` : 'Zipping…');
    const n = parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : '';
    out.push({ blob: await zipFiles([...parts[i], { name: 'README.txt', data: README }]), filename: `${top}${n}.zip` });
  }
  return out;
}

/** Read a pack: every entry in it as backup-shaped data, photos attached as blobs. */
export async function readPack(file) {
  const entries = await readZip(file);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const out = [];
  for (const e of entries) {
    if (!/(^|\/)entry\.json$/.test(e.name)) continue;
    const dir = e.name.slice(0, e.name.length - 'entry.json'.length);
    const data = JSON.parse(dec.decode(await e.bytes()));
    if (!Array.isArray(data.photos)) data.photos = [];
    for (const ph of data.photos) {
      const f = byName.get(dir + ph.file);
      if (f) ph.blob = new Blob([await f.bytes()], { type: ph.type || 'image/jpeg' });
    }
    data.photos = data.photos.filter((ph) => ph.blob);
    out.push(data);
  }
  if (!out.length) throw new Error('There is no survey in that zip file');
  return out;
}

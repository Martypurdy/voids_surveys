// Inspection -> Ready to let. Copies what does not change between visits (where things are) from an Empty home
// inspection into a Ready to let form at the same property: address, key safe location and photos (never the code),
// the property type, bedrooms, storeys and photos, the services' locations (fuse board and mains stop tap come across in full; gas, electric and water meters only
// their location, because their readings are photographed each visit) and the room and outside area list.
// Nothing is overwritten: a field that already has something in it is left alone.
import { saveJob, getJob, getPhotos, putPhotos } from './db.js';
import { newJob, newRoom, newMeter, todayLocal, uid, nowISO } from './model.js';
import { getLastSurveyor } from './surveyors.js';

/** Services that stay the same from visit to visit: everything is copied. The meters only get their location. */
const FIXED_SERVICES = new Set(['Fuse board', 'Mains stop tap']);

const blank = (s) => !String(s ?? '').trim();
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** Copy photo records so each entry owns its pictures (deleting one entry deletes only its own photos). Returns the new ids. */
async function clonePhotos(ids, jobId) {
  const recs = (await getPhotos(ids || [])).filter(Boolean);
  const copies = recs.map((r) => ({ ...r, id: uid(), jobId, created: nowISO() }));
  if (copies.length) await putPhotos(copies);
  return copies.map((r) => r.id);
}

const meterIsBlank = (m) => blank(m.location) && blank(m.serial) && blank(m.notes) && !m.photos.length;

/**
 * Fill a Ready to let job (live object) from an inspection. Returns a short summary of what was copied.
 * The caller saves the job.
 */
export async function fillFromInspection(job, src) {
  const done = { property: false, gifted: false, keySafe: false, services: 0, rooms: 0 };

  // Key safe: location, pin and photos, never the code (it is changed when the property is closed down).
  const ks = job.keySafe;
  if (blank(ks.location) && !ks.photos.length && (!blank(src.keySafe.location) || src.keySafe.photos.length || src.keySafe.lat != null)) {
    ks.location = src.keySafe.location || '';
    ks.lat = src.keySafe.lat ?? null;
    ks.lng = src.keySafe.lng ?? null;
    ks.accuracy = src.keySafe.accuracy ?? null;
    ks.photos = await clonePhotos(src.keySafe.photos, job.id);
    ks.code = '';
    done.keySafe = true;
  }

  // Property: type, style, bedrooms, storeys, floor and the property photos (blanks only).
  const sp = src.property || {};
  const tp = job.property;
  let copiedProperty = false;
  for (const k of ['type', 'style', 'bedrooms', 'storeys', 'floor']) {
    if (blank(tp[k]) && !blank(sp[k])) { tp[k] = sp[k]; copiedProperty = true; }
  }
  if (!tp.photos.length && sp.photos?.length) { tp.photos = await clonePhotos(sp.photos, job.id); copiedProperty = true; }
  done.property = copiedProperty;

  // Gifted items: the list and where each is (the surveyor deletes any that have gone at sign off).
  let copiedGifted = false;
  for (const [item, places] of Object.entries(src.gifted?.selected || {})) {
    if (!job.gifted.selected[item] && places.length) { job.gifted.selected[item] = [...places]; copiedGifted = true; }
  }
  for (const item of src.gifted?.extra || []) {
    if (!job.gifted.extra.includes(item)) { job.gifted.extra.push(item); copiedGifted = true; }
  }
  done.gifted = copiedGifted;

  // Services, matched by name in order (a second gas meter matches the second one on this form).
  const used = new Set();
  for (const s of src.meters) {
    const fixed = FIXED_SERVICES.has(s.utility);
    if (!fixed && blank(s.location)) continue; // nothing worth copying
    let t = job.meters.find((m) => m.utility === s.utility && !used.has(m.id));
    if (!t) { t = newMeter(s.utility); job.meters.push(t); }
    used.add(t.id);
    if (!meterIsBlank(t)) continue;
    if (fixed) {
      Object.assign(t, structuredClone({ ...s, id: t.id, date: todayLocal(), photos: [] }));
      t.photos = await clonePhotos(s.photos, job.id);
    } else {
      t.location = s.location;
    }
    done.services++;
  }

  // Rooms and outside areas: names and sizes only (not defects, features ticked or photos).
  for (const kind of ['rooms', 'externals']) {
    for (const r of src[kind]) {
      if (job[kind].some((x) => sameName(x.name, r.name))) continue;
      const room = newRoom(r.name, kind);
      room.size = { ...room.size, ...(r.size || {}) };
      job[kind].push(room);
      done.rooms++;
    }
  }

  job.fromId = src.id;
  return done;
}

export const summaryText = (d) => [
  d.property ? 'property details and photos' : '',
  d.gifted ? 'gifted items' : '',
  d.keySafe ? 'key safe location' : '',
  d.services ? `${d.services} service${d.services === 1 ? '' : 's'}` : '',
  d.rooms ? `${d.rooms} room${d.rooms === 1 ? '' : 's'} and areas` : '',
].filter(Boolean).join(', ') || 'nothing new (it was all filled in already)';

/** A new Ready to let at the inspection's property, filled from it and linked both ways. Returns the saved job. */
export async function rtlFromInspection(src) {
  const job = newJob({ surveyor: src.surveyor || getLastSurveyor(), form: 'rtl' });
  job.propertyId = src.propertyId;
  job.address = structuredClone(src.address);
  await fillFromInspection(job, src);
  src.nextId = job.id;
  await saveJob(job);
  await saveJob(src, { touch: false });
  return job;
}

/** The Ready to let already started from this inspection, if it still exists. */
export async function existingRtl(src) {
  return src.nextId ? (await getJob(src.nextId)) || null : null;
}

/** Link the other way: record on the inspection that this form was started from it. */
export async function linkBack(rtl, src) {
  if (src.nextId === rtl.id) return;
  src.nextId = rtl.id;
  await saveJob(src, { touch: false });
}

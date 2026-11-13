// Job data model, presets and helpers. Pure functions – no DOM, no storage.

export const SCHEMA = 1;

export const CONDITIONS = ['Good', 'Fair', 'Poor', 'N/A'];

export const ROOM_PRESETS = ['Hall, stairs, landing & loft', 'Living room', 'Kitchen', 'Bathroom', 'WC', 'Bedroom', 'Porch'];
export const EXTERNAL_PRESETS = ['Front garden', 'Rear garden', 'Boundaries', 'Garage', 'Shed'];

// Services tab, in display order. The first of each is always present.
export const UTILITIES = ['Fuse board', 'Mains stop tap', 'Gas', 'Electric', 'Water'];
const METER_TYPES_SET = new Set(['Gas', 'Electric', 'Water']);
/** 'Gas' -> 'Gas meter'; 'Fuse board' stays as is. */
export const serviceTitle = (u) => (METER_TYPES_SET.has(u) ? `${u} meter` : u);
export const METER_TYPES = ['Credit', 'Prepayment', 'Smart'];
export const SUPPLY_STATUSES = ['On', 'Off', 'Capped', 'Not found'];
export const HEATING_TYPES = ['Gas boiler', 'Electric heaters', 'Heat pump'];

export const BACKUP_WARN_DAYS = 7;

/** Survey sections in tab order: [key, label, route path under #/job/:id]. */
export const SECTIONS = [
  ['address', 'Address', ''],
  ['property', 'Property', 'property'],
  ['meters', 'Services', 'meters'],
  ['rooms', 'Rooms', 'rooms'],
  ['externals', 'Externals', 'externals'],
];

export const PROPERTY_TYPES = ['House', 'Flat', 'Bungalow', 'Maisonette', 'Bedsit', 'Other'];
export const PROPERTY_STYLES = ['Detached', 'Semi-detached', 'Mid-terrace', 'End-terrace'];

export function newProperty() {
  // notes is no longer shown (replaced by the property photo) but kept for older jobs.
  return { type: '', style: '', bedrooms: '', storeys: '', floor: '', notes: '', photos: [] };
}

// ----- Works required (Property type screen) -----
export const CYLINDER_OPTIONS = ['Front door', 'Back door', 'Patio door', 'Shed', 'Gate', 'Garage', 'Windows', 'Post box', 'Communal key / fob'];
export const CYLINDER_DEFAULT = ['Front door'];
export const CLEARANCE_OPTIONS = ['Full clearance', 'Partial clearance', 'Needle sweep', 'Environmental', 'Pest control'];
export const CLEARANCE_BY = ['Operatives', 'Contractor'];

export function newWorks() {
  return {
    keySafe: true, // "Fit key safe" is selected by default
    gainEntry: false,
    cylinders: null, // null = never chosen (pop-up pre-ticks Front door); [] = none
    clearance: [],
    clearanceBy: [],
  };
}

/** Selected works as [label, detail] pairs, for summaries and the PDF. */
export function worksSummary(w) {
  const out = [];
  if (w.keySafe) out.push(['Fit key safe', '']);
  if (w.gainEntry) out.push(['Gain entry', '']);
  if (w.cylinders?.length) out.push(['Renew locks', w.cylinders.join(', ')]);
  if (w.clearance.length || w.clearanceBy.length) {
    out.push(['Property clearance', [w.clearance.join(', '), w.clearanceBy.length ? `by ${w.clearanceBy.join(' / ')}` : '']
      .filter(Boolean).join(' – ')]);
  }
  return out;
}

/** Section progress: undefined (not started) | 'started' | 'complete'. */
export const sectionState = (job, key) => job.progress?.[key];
export const completedCount = (job) => SECTIONS.filter(([k]) => job.progress?.[k] === 'complete').length;

/** Bring a job saved by an older version up to the current shape (in place). */
export function upgradeJob(job) {
  normalizeAddress(job.address);
  job.progress ??= {};
  job.property = { ...newProperty(), ...(job.property || {}) };
  if (!Array.isArray(job.property.photos)) job.property.photos = [];
  job.works = { ...newWorks(), ...(job.works || {}) };
  if (!Array.isArray(job.heating)) job.heating = [];
  // Older surveys: add Fuse board and Mains stop tap at the top of Services.
  for (const u of ['Mains stop tap', 'Fuse board']) {
    if (!job.meters.some((m) => m.utility === u)) job.meters.unshift(newMeter(u));
  }
  for (const r of job.rooms) {
    r.parts ??= {};
    r.size ??= { length: '', width: '', height: '' };
  }
  return job;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const nowISO = () => new Date().toISOString();

/** Local date as yyyy-mm-dd (for <input type="date">). */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newJob({ surveyor = '' } = {}) {
  const t = nowISO();
  return {
    schema: SCHEMA,
    id: uid(),
    created: t,
    updated: t,
    lastExported: null,
    address: { postcode: '', text: '', lat: null, lng: null },
    voidRef: '', // no longer shown in the app; kept so older files still import
    surveyor,
    property: newProperty(),
    works: newWorks(),
    heating: [],
    progress: {},
    rooms: [],
    externals: [],
    keys: [],
    keySafe: newKeySafe(),
    meters: UTILITIES.map((u) => newMeter(u)),
  };
}

export function newItem(name) {
  return { id: uid(), name, condition: '', notes: '', photos: [] };
}

// ----- Rooms: parts, defects, size -----

/** A new room: parts start unchecked (amber). */
export function newRoom(name) {
  return { ...newItem(name), parts: {}, size: { length: '', width: '', height: '' } };
}

/** part = { state: '' | 'ok' | 'works', defects: [{ id, qty }], notes, photos } */
export function roomPart(room, key) {
  room.parts[key] ??= { state: '', defects: [], notes: '', photos: [] };
  return room.parts[key];
}

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r1 = (n) => Math.round(n * 10) / 10;

/** Areas from length × width × height (metres). Missing figures give 0. */
export function roomAreas(size = {}) {
  const l = num(size.length);
  const w = num(size.width);
  const ht = num(size.height);
  return {
    ceiling: r1(l * w),
    floor: r1(l * w),
    walls: r1(2 * (l + w) * ht),
    perimeter: r1(2 * (l + w)),
  };
}

/** Room progress: { checked, total, defects, state: 'todo' | 'started' | 'attention' | 'ok' } */
export function roomStatus(room, parts) {
  const total = parts.length;
  let checked = 0;
  let defects = 0;
  let works = 0;
  for (const p of parts) {
    const s = room.parts?.[p.key];
    if (s?.state === 'ok') checked++;
    if (s?.state === 'works') { checked++; works++; defects += s.defects.length; }
  }
  const state = checked === 0 ? 'todo' : checked < total ? 'started' : works ? 'attention' : 'ok';
  return { checked, total, defects, works, state };
}

export function newKey() {
  return { id: uid(), keySet: '', quantity: 1, receivedFrom: '', issuedTo: '', date: todayLocal(), photos: [] };
}

export function newKeySafe() {
  return { location: '', code: '', lat: null, lng: null, accuracy: null, photos: [] };
}

export function newMeter(utility = 'Electric') {
  return {
    id: uid(),
    utility,
    type: '',
    supply: '',
    serial: '',
    reading: '',
    date: todayLocal(),
    location: '',
    balanceType: 'Credit', // Credit | Debt – only used for prepayment meters
    balance: '',
    photos: [],
  };
}

/** Next name for a numbered preset, e.g. "Bedroom 3". */
export function nextNumberedName(items, base) {
  const re = new RegExp(`^${base}\\s+(\\d+)$`, 'i');
  const max = items.reduce((m, it) => {
    const hit = re.exec(it.name.trim());
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `${base} ${max + 1}`;
}

/** Every photos[] array in a job (live references). */
export function photoLists(job) {
  return [
    job.property?.photos || [],
    ...job.rooms.map((x) => x.photos),
    ...job.rooms.flatMap((x) => Object.values(x.parts || {}).map((p) => p.photos || [])),
    ...job.externals.map((x) => x.photos),
    ...job.keys.map((x) => x.photos),
    job.keySafe.photos,
    ...job.meters.map((x) => x.photos),
  ];
}

export const allPhotoIds = (job) => photoLists(job).flat();

/** Replace photo ids in place using a Map(oldId -> newId). */
export function remapPhotoIds(job, map) {
  for (const list of photoLists(job)) {
    for (let i = 0; i < list.length; i++) list[i] = map.get(list[i]) ?? list[i];
  }
}

/**
 * Address = { postcode, text, lat, lng }, where text is the full address as one
 * free-text box (one line per row). Older jobs stored line1/line2/town – merge them.
 */
export function normalizeAddress(a = {}) {
  if (typeof a.text !== 'string') {
    a.text = [a.line1, a.line2, a.town, a.postcode].map((s) => (s || '').trim()).filter(Boolean).join('\n');
  }
  delete a.line1;
  delete a.line2;
  delete a.town;
  a.postcode ??= '';
  a.lat ??= null;
  a.lng ??= null;
  return a;
}

const squash = (s) => (s || '').replace(/\s+/g, '').toUpperCase();
const textLines = (a) => (a.text || '').split('\n').map((s) => s.trim()).filter(Boolean);

/** Address as lines, with the postcode appended if the box doesn't already contain it. */
export function addressLines(a) {
  const lines = textLines(a);
  const pc = (a.postcode || '').trim();
  if (pc && !lines.some((l) => squash(l).includes(squash(pc)))) lines.push(pc);
  return lines;
}

/** Title: first line of the address (house number + street) and postcode. */
export function jobTitle(job) {
  const a = job.address;
  const first = textLines(a)[0] || '';
  const pc = (a.postcode || '').trim();
  const title = [first, pc && !squash(first).includes(squash(pc)) ? pc : ''].filter(Boolean).join(', ');
  return title || 'New survey';
}

/**
 * Backup status. Only the .json backup counts – a PDF can't be re-imported.
 * Returns { stale, text } where stale = no backup within BACKUP_WARN_DAYS.
 */
export function backupStatus(job, now = Date.now()) {
  const since = job.lastExported || job.created;
  const ageDays = (now - new Date(since).getTime()) / 86400000;
  if (ageDays < BACKUP_WARN_DAYS) return { stale: false, text: '' };
  const d = fmtDate(since);
  return {
    stale: true,
    text: job.lastExported ? `Not backed up since ${d}` : `Never backed up (created ${d})`,
  };
}

export function fmtDate(iso) {
  if (!iso) return '';
  // yyyy-mm-dd strings are local dates; parse without UTC shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Safe filename fragment. */
export function slug(s) {
  return String(s || '').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, ' ').slice(0, 60) || 'job';
}

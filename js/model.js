// Job data model, presets and helpers. Pure functions – no DOM, no storage.

export const SCHEMA = 1;

export const CONDITIONS = ['Good', 'Fair', 'Poor', 'N/A'];

export const ROOM_PRESETS = ['Hall', 'Landing', 'Living room', 'Kitchen', 'Bathroom', 'WC', 'Bedroom', 'Porch'];
export const EXTERNAL_PRESETS = ['Front garden', 'Rear garden', 'Boundaries', 'Garage', 'Shed'];

export const UTILITIES = ['Gas', 'Electric', 'Water'];
export const METER_TYPES = ['Credit', 'Prepayment', 'Smart'];
export const SUPPLY_STATUSES = ['On', 'Off', 'Capped', 'Not found'];

export const BACKUP_WARN_DAYS = 7;

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
    address: { line1: '', line2: '', town: '', postcode: '', lat: null, lng: null },
    voidRef: '',
    surveyor,
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
    ...job.rooms.map((x) => x.photos),
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

export function addressLines(a) {
  return [a.line1, a.line2, a.town, a.postcode].map((s) => (s || '').trim()).filter(Boolean);
}

export function jobTitle(job) {
  return job.address.line1.trim() || job.voidRef.trim() || job.address.postcode.trim() || 'New survey';
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

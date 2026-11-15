// Job data model, presets and helpers. Pure functions – no DOM, no storage.

export const SCHEMA = 1;

export const CONDITIONS = ['Good', 'Fair', 'Poor', 'N/A'];

import { AREA_PRESETS, defaultFeatures } from './data/features.js';
import { newPlan, PLAN_KINDS, upgradePlanItem, refreshDepths, DEFAULT_SETTINGS } from './plan.js';

export const ROOM_PRESETS = AREA_PRESETS.rooms;
export const EXTERNAL_PRESETS = AREA_PRESETS.externals;

// Services tab, in display order. The first of each is always present.
export const UTILITIES = ['Fuse board', 'Mains stop tap', 'Gas', 'Electric', 'Water'];
const METER_TYPES_SET = new Set(['Gas', 'Electric', 'Water']);
/** 'Gas' -> 'Gas meter'; 'Fuse board' stays as is. */
export const serviceTitle = (u) => (METER_TYPES_SET.has(u) ? `${u} meter` : u);
export const METER_TYPES = ['Credit', 'Prepayment', 'Smart'];
export const SUPPLY_STATUSES = ['On', 'Off', 'Capped', 'Not found'];
export const HEATING_TYPES = ['Gas boiler', 'Electric heaters', 'Heat pump'];

export const BACKUP_WARN_DAYS = 7;

/** Items commonly left for (gifted to) the incoming tenant. */
export const GIFT_ITEMS = ['Carpets', 'Laminate flooring', 'Sheet vinyl', 'Wallpaper', 'Curtains', 'Curtain poles', 'Blinds', 'Lampshades', 'Cabinets', 'Sheds'];

/** gifted = { selected: { [item]: [room / area names] }, extra: [your own item names] } */
export const newGifted = () => ({ selected: {}, extra: [] });

/** Survey sections in tab order: [key, label, route path under #/job/:id]. */
export const SECTIONS = [
  ['address', 'Address', ''],
  ['property', 'Property', 'property'],
  ['security', 'Security', 'security'],
  ['meters', 'Services', 'meters'],
  ['rooms', 'Rooms', 'rooms'],
  ['externals', 'Externals', 'externals'],
  ['gifted', 'Gifted items', 'gifted'],
  ['materials', 'Materials', 'materials'],
  ['signoff', 'Sign off', 'signoff'],
];

// ----- Forms -----
// 'void' = Empty home inspection (the original survey); 'rtl' = Ready to let.
// Ready to let shares the Address, Property, Security, Services, Rooms, Externals and
// Gifted items tabs (each showing its own, simpler content) and ends with Sign off.
export const FORMS = {
  void: { title: 'Empty home inspection', pdfTitle: 'Empty Home Inspection', file: 'Empty home inspection' },
  rtl: { title: 'Ready to let', pdfTitle: 'Ready to Let Inspection', file: 'Ready to let' },
  price: { title: 'Materials & labour', pdfTitle: 'Materials & Labour Costing', file: 'Materials and labour' },
  plan: { title: 'Floor plan', pdfTitle: 'Floor Plan', file: 'Floor plan' },
};
// 'plan' = Designer floor plan (kitchen, bathroom or whole property – job.plan.kind).
const PLAN_SECTIONS = [
  ['address', 'Address', ''],
  ['dimensions', 'Room dimensions', 'dimensions'], // rooms, doors, windows, services: fixed once you move on
  ['plan', 'Floor plan', 'plan'], // units and fittings, laid out inside those rooms
];
export const isPlan = (job) => job.form === 'plan';
/** The two inspection forms (Empty home inspection, Ready to let). */
export const isInspection = (job) => !job.form || job.form === 'void' || job.form === 'rtl';
// 'price' = Materials & labour costing sheet (Pricing on the home screen).
const PRICE_SECTIONS = [
  ['address', 'Address', ''],
  ['costs', 'Materials', 'costs'],
  ['labour', 'Labour', 'labour'],
  ['totals', 'Totals', 'totals'],
];
export const isPrice = (job) => job.form === 'price';
/**
 * Costing sheet. vat: how prices are typed in – 'plus' (+ VAT), 'inc' (including VAT)
 * or 'none' (no VAT). Lines: see newMaterialLine / newLabourLine.
 */
export const newPricing = () => ({ customer: '', customerAddress: { postcode: '', text: '' }, ref: '', vat: 'plus', vatRate: 20, materials: [], labour: [], deliveries: [], notes: '' });
/** Delivery charge and lead time for a supplier's order (cost typed like the sheet's other prices). */
export const newDelivery = () => ({ id: uid(), supplier: '', cost: '', leadTime: '', notes: '' });
/** markupType: '%' of the line, or '£' added to the whole line. */
export const newMaterialLine = () => ({ id: uid(), item: '', supplier: '', code: '', qty: '', unit: '', price: '', markup: '', markupType: '%', url: '' });
/** basis: 'item' | 'hour' | 'day'. */
export const newLabourLine = () => ({ id: uid(), item: '', basis: 'hour', qty: '', rate: '', markup: '', markupType: '%' });
const RTL_SECTIONS = SECTIONS.filter(([k]) => k !== 'materials');
/** Sign off signature (both forms). image: PNG data URL; date: ISO time signed. */
export const newSignature = () => ({ name: '', image: '', date: '' });
export const isRtl = (job) => job.form === 'rtl';
/** The tabs for this job's form. */
export const sectionsOf = (job) => (isRtl(job) ? RTL_SECTIONS : isPrice(job) ? PRICE_SECTIONS : isPlan(job) ? PLAN_SECTIONS : SECTIONS);
export const formOf = (job) => (isPlan(job) ? { ...FORMS.plan, ...PLAN_KINDS[job.plan?.kind || 'property'] } : FORMS[job.form] || FORMS.void);

/** Ready to let: key types to record (fobs count as communal key / fob). */
export const RTL_KEY_TYPES = ['Front door', 'Back door', 'Patio door', 'French doors', 'Window keys', 'Shed', 'Gate', 'Garage', 'Post box', 'Meter box', 'Communal key / fob'];
/** Ready to let: appliances that may need maintaining. */
export const APPLIANCES = ['Cooker', 'Oven', 'Hob', 'Cooker hood / extractor', 'Fridge', 'Freezer', 'Fridge freezer', 'Washing machine', 'Tumble dryer', 'Dishwasher', 'Microwave', 'Gas fire', 'Electric fire', 'Electric shower', 'Stairlift', 'Through-floor lift', 'Hoist', 'Specialist bath'];

/** Ready to let extras. Rooms / outside areas use room.done (works complete). */
export function newRtl() {
  return {
    clearance: { done: false, notes: '' },
    cleaning: { done: false, notes: '' },
    voucher: { required: '', value: '', photos: [] }, // required: '' | 'yes' | 'no'
    appliances: { any: '', list: [], notes: '', photos: [] }, // any: '' | 'yes' | 'no'
  };
}

export const PROPERTY_TYPES = ['House', 'Flat', 'Bungalow', 'Maisonette', 'Bedsit', 'Other'];
export const PROPERTY_STYLES = ['Detached', 'Semi-detached', 'Mid-terrace', 'End-terrace'];

export function newProperty() {
  // notes is no longer shown (replaced by the property photo) but kept for older jobs.
  return { type: '', style: '', bedrooms: '', storeys: '', floor: '', notes: '', photos: [] };
}

// ----- Works required (Property type screen) -----
export const CYLINDER_OPTIONS = ['Front door', 'Back door', 'Patio door', 'French doors', 'Shed', 'Gate', 'Garage', 'Windows', 'Post box', 'Communal key', 'Communal fob'];
export const CYLINDER_DEFAULT = ['Front door'];
export const CLEARANCE_OPTIONS = ['Full clearance', 'Partial clearance', 'Needle sweep', 'Pre-clean', 'Pest control'];
/** Small text shown under an option. */
export const CLEARANCE_HINTS = { 'Pre-clean': 'Environmental clean' };
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
/** which: 'security' (key safe, gain entry, locks) | 'property' (clearance) | 'all'. */
export function worksSummary(w, which = 'all') {
  const out = [];
  const sec = which !== 'property';
  const prop = which !== 'security';
  if (sec && w.keySafe) out.push(['Fit key safe', '']);
  if (sec && w.gainEntry) out.push(['Gain entry', '']);
  if (sec && w.cylinders?.length) out.push(['Renew locks', w.cylinders.join(', ')]);
  if (prop && (w.clearance.length || w.clearanceBy.length)) {
    out.push(['Clearance / clean', [w.clearance.map((c) => (c === 'Pre-clean' ? 'Pre-clean (environmental clean)' : c)).join(', '), w.clearanceBy.length ? `by ${w.clearanceBy.join(' / ')}` : '']
      .filter(Boolean).join(' – ')]);
  }
  return out;
}

/** Section progress: undefined (not started) | 'started' | 'complete'. */
export const sectionState = (job, key) => job.progress?.[key];
export const completedCount = (job) => sectionsOf(job).filter(([k]) => job.progress?.[k] === 'complete').length;

/** Bring a job saved by an older version up to the current shape (in place). */
export function upgradeJob(job) {
  job.form ??= 'void';
  if (isRtl(job)) {
    const d = newRtl();
    job.rtl = { ...d, ...(job.rtl || {}) };
    for (const k of Object.keys(d)) job.rtl[k] = { ...d[k], ...(job.rtl[k] || {}) };
  }
  // The signature used to live under job.rtl (Ready to let only); now both forms have one.
  if (!job.signature && job.rtl?.signature) job.signature = job.rtl.signature;
  if (job.rtl) delete job.rtl.signature;
  job.signature = { ...newSignature(), ...(job.signature || {}) };
  // Empty home inspections finished before Sign off was added stay complete.
  if (job.form === 'void' && !job.progress?.signoff && job.progress?.materials === 'complete'
    && SECTIONS.every(([k]) => k === 'signoff' || job.progress[k] === 'complete')) {
    job.progress.signoff = 'complete';
  }
  normalizeAddress(job.address);
  job.progress ??= {};
  job.property = { ...newProperty(), ...(job.property || {}) };
  if (!Array.isArray(job.property.photos)) job.property.photos = [];
  job.works = { ...newWorks(), ...(job.works || {}) };
  // 'Communal key / fob' was split into two options – keep both selected.
  const cyl = job.works.cylinders;
  if (Array.isArray(cyl) && cyl.includes('Communal key / fob')) {
    job.works.cylinders = [...new Set(cyl.flatMap((c) => (c === 'Communal key / fob' ? ['Communal key', 'Communal fob'] : [c])))];
  }
  // 'Environmental' was renamed 'Pre-clean'.
  job.works.clearance = (job.works.clearance || []).map((c) => (c === 'Environmental' ? 'Pre-clean' : c));
  if (!Array.isArray(job.heating)) job.heating = [];
  // Older surveys: add Fuse board and Mains stop tap at the top of Services.
  for (const u of ['Mains stop tap', 'Fuse board']) {
    if (!job.meters.some((m) => m.utility === u)) job.meters.unshift(newMeter(u));
  }
  // Rooms and outside areas share one shape (older outside items only had a condition).
  for (const r of [...job.rooms, ...job.externals]) {
    r.parts ??= {};
    r.size ??= { length: '', width: '', height: '' };
    if (!Array.isArray(r.photos)) r.photos = [];
  }
  job.security ??= newRoom('Security', 'security');
  job.gifted = { ...newGifted(), ...(job.gifted || {}) };
  // 'Lamp shades' is now spelt 'Lampshades'.
  if (job.gifted.selected['Lamp shades']) {
    job.gifted.selected.Lampshades = job.gifted.selected['Lamp shades'];
    delete job.gifted.selected['Lamp shades'];
  }
  job.security.parts ??= {};
  if (isPlan(job)) {
    job.plan = { ...newPlan(job.plan?.kind), ...(job.plan || {}) };
    for (const f of job.plan.floors) { f.rooms ??= []; f.items ??= []; f.items.forEach(upgradePlanItem); }
    job.plan.settings = { ...DEFAULT_SETTINGS, ...(job.plan.settings || {}) };
    refreshDepths(job.plan); // units follow the door / board thickness settings
    // Plans finished before the Room dimensions tab existed stay complete.
    if (job.progress?.plan === 'complete' && !job.progress.dimensions) job.progress.dimensions = 'complete';
  }
  if (isPrice(job)) {
    job.pricing = { ...newPricing(), ...(job.pricing || {}) };
    for (const k of ['materials', 'labour', 'deliveries']) if (!Array.isArray(job.pricing[k])) job.pricing[k] = [];
    job.pricing.customerAddress = { postcode: '', text: '', ...(job.pricing.customerAddress || {}) };
  }
  job.legionella = { ...newLegionella(), ...(job.legionella || {}) };
  if (!Array.isArray(job.legionella.photos)) job.legionella.photos = [];
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

export function newJob({ surveyor = '', form = 'void', planKind = 'property' } = {}) {
  const t = nowISO();
  return {
    schema: SCHEMA,
    form,
    ...(form === 'rtl' ? { rtl: newRtl() } : {}),
    ...(form === 'price' ? { pricing: newPricing() } : {}),
    ...(form === 'plan' ? { plan: newPlan(planKind) } : {}),
    signature: newSignature(),
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
    security: newRoom('Security', 'security'),
    gifted: newGifted(),
    meters: UTILITIES.map((u) => newMeter(u)),
    legionella: newLegionella(),
  };
}

export function newItem(name) {
  return { id: uid(), name, condition: '', notes: '', photos: [] };
}

// ----- Rooms: parts, defects, size -----

/**
 * A new room or outside area (kind 'rooms' | 'externals' | 'security'): starts with its
 * type's features, all unchecked (amber).
 */
export function newRoom(name, kind = 'rooms') {
  return { ...newItem(name), parts: {}, size: { length: '', width: '', height: '' }, features: defaultFeatures(name, kind), featureLabels: {} };
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

/** Legionella flush: the paper form is left on site – tick it's done, photo the form, add notes. */
export function newLegionella() {
  return { done: false, notes: '', photos: [] };
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
    doorDamaged: '', // gas / electric meter box door: '' | 'yes' | 'no'
    notes: '',
    photos: [],
  };
}

/** Gas and electric meters ask whether the meter box door is damaged. */
export const hasMeterDoor = (utility) => utility === 'Gas' || utility === 'Electric';

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
    // Rooms, outside areas and Security: the area's own photos plus each feature's.
    ...[...job.rooms, ...job.externals, ...(job.security ? [job.security] : [])]
      .flatMap((x) => [x.photos || [], ...Object.values(x.parts || {}).map((p) => p.photos || [])]),
    ...job.keys.map((x) => x.photos),
    job.keySafe.photos,
    ...job.meters.map((x) => x.photos),
    job.legionella?.photos || [],
    job.rtl?.voucher?.photos || [],
    job.rtl?.appliances?.photos || [],
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
  if (title) return title;
  if (isPrice(job)) return [job.pricing?.ref, job.pricing?.customer].filter((s) => s?.trim()).join(' – ') || 'New costing';
  if (isPlan(job)) return `New ${(PLAN_KINDS[job.plan?.kind] || PLAN_KINDS.property).title.toLowerCase()}`;
  return 'New survey';
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

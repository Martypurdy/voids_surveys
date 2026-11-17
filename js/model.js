// Job data model, presets and helpers. Pure functions – no DOM, no storage.

export const SCHEMA = 2; // 2: jobs belong to a property (propertyId) and may carry a 'nature' label

export const CONDITIONS = ['Good', 'Fair', 'Poor', 'N/A'];

import { AREA_PRESETS, defaultFeatures } from './data/features.js';
import { HAZARDS, CORE_HAZARD_KEYS } from './data/hazards.js';
import { calcByKey, defaultsFor } from './calc/calculators.js';
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
  quote: { title: 'Quote', pdfTitle: 'Quote', file: 'Quote', emoji: '📝' },
  invoice: { title: 'Invoice', pdfTitle: 'Invoice', file: 'Invoice', emoji: '🧾' },
  calc: { title: 'Calculation', pdfTitle: 'Calculation', file: 'Calculation' },
  rams: { title: 'RAMS pack', pdfTitle: 'RAMS & CDM Pack', file: 'RAMS pack', emoji: '🦺' },
  repair: { title: 'Property repair survey', pdfTitle: 'Property Repair Survey', file: 'Repair survey', emoji: '🛠️' },
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
// 'repair' = Property repair survey (Property inspection on the home screen): project details, the reason for the
// visit, a schedule of repairs (location, condition, causation, rectification, photos) and a materials list.
const REPAIR_SECTIONS = [
  ['address', 'Address', ''],
  ['visit', 'Visit', 'visit'],
  ['repairs', 'Repairs', 'repairs'],
  ['repmat', 'Materials', 'repair-materials'],
  ['signoff', 'Sign off', 'signoff'],
];
export const isRepair = (job) => job.form === 'repair';
export const REPAIR_REASONS = [['defect', 'Defect'], ['upgrade', 'Upgrade']];
export const OCCUPANCY = [['void', 'Void'], ['occupied', 'Occupied']];
/** A line of the schedule of repairs. photos: photo ids. */
export const newRepairRow = () => ({ id: uid(), location: '', condition: '', causation: '', fix: '', photos: [] });
/** A material needed for the repairs; rowId is the schedule row it came from ('' = added by hand). */
export const newRepairMaterial = (rowId = '') => ({ id: uid(), rowId, item: '', qty: '', unit: '' });
/** Repair survey. customer: the tenant / contact, with their own address (they may not live at the property). */
export const newRepair = () => ({
  ref: '', customer: '', customerAddress: { postcode: '', text: '' },
  date: todayLocal(), propertyType: '', occupancy: '', weather: '', access: '',
  reason: '', brief: '', rows: [newRepairRow()], materials: [], notes: '',
});
// 'rams' = RAMS pack (Health and safety on the home screen): a small-job construction phase plan, risk assessments
// (HSE layout), method statements and a briefing record, all for one job.
const RAMS_SECTIONS = [
  ['address', 'Address', ''],
  ['cpp', 'Plan', 'cpp'],
  ['risks', 'Risks', 'risks'],
  ['methods', 'Methods', 'methods'],
  ['briefing', 'Briefing', 'briefing'],
  ['signoff', 'Sign off', 'signoff'],
];
export const isRams = (job) => job.form === 'rams';
export const newRiskRow = () => ({ id: uid(), hazard: '', who: '', controls: '', action: '', owner: '', when: '', done: false });
export const newRisk = (title = '') => ({ id: uid(), title, ref: '', date: todayLocal(), reviewDate: '', rows: [newRiskRow()] });
/** On-the-day check: checks maps a question key to 'yes' | 'no' | 'na'; found = hazards spotted (rows like a risk assessment's). */
export const newDynamic = () => ({ id: uid(), task: '', location: '', date: todayLocal(), checks: {}, found: [newRiskRow()], outcome: '', notes: '' });
export const newPerson = () => ({ id: uid(), name: '', role: '', competence: '' });
export const newStep = () => ({ id: uid(), text: '', photos: [] });
export const newTool = () => ({ id: uid(), type: '', details: '' });
export const newMethod = (title = '', description = '') => ({
  id: uid(), title, ref: '', description, raIds: [], start: '', duration: '', workers: '', areas: '',
  personnel: [newPerson()], emergency: { fire: '', firstAid: '', spill: '', other: '' },
  ppe: [], ppeOther: '', dust: '', dustControls: '', hazmat: '', coshh: '', hazControls: '',
  permits: [], permitOther: '', permitBy: '', steps: [newStep()], tools: [newTool()],
});
export const newAttendee = () => ({ id: uid(), name: '', trade: '', company: '', signature: '' });
export const newBriefing = () => ({ id: uid(), kinds: [], subject: '', date: todayLocal(), location: '', attendees: [newAttendee()], feedback: '', by: '' });
/** A danger line in the construction phase plan. */
export const newDanger = (hazard = '', controls = '') => ({ id: uid(), hazard, controls, present: false });
/** RAMS pack. customer / customerAddress / ref are the tenant or client and the job number (same boxes as the repair survey). */
export const newRams = () => ({
  ref: '', customer: '', customerAddress: { postcode: '', text: '' }, company: '', description: '', sourceId: '', tasks: [],
  cpp: {
    principal: '', designer: '', startDate: '', endDate: '', welfare: '', others: '', updates: '', rules: '', supervision: '', responsible: '',
    asbestos: '', services: '', emergency: '', days: '', workers: '', personDays: '',
    dangers: HAZARDS.filter((h) => CORE_HAZARD_KEYS.includes(h.key)).map((h) => newDanger(h.hazard, h.controls)),
  },
  risks: [], dynamics: [], methods: [], briefings: [], notes: '',
});
// 'calc' = a calculation from the Calculators button (concrete, bricks, tiles…): optional client and location,
// the calculator itself, and a materials list. job.calc.kind says which calculator.
const CALC_SECTIONS = [
  ['address', 'Address', ''],
  ['calculate', 'Calculate', 'calculate'],
  ['calcmat', 'Materials', 'calc-materials'],
];
export const isCalc = (job) => job.form === 'calc';
export const newCalcLine = () => ({ id: uid(), item: '', qty: '', unit: '' });
/** A calculation: the inputs, assumptions and wastage (remembered from last time), the materials list and client details. */
export const newCalc = (kind = 'concrete') => ({
  kind: calcByKey(kind).key, ...defaultsFor(kind), materials: [],
  ref: '', customer: '', customerAddress: { postcode: '', text: '' }, notes: '',
});
// 'quote' and 'invoice' = documents for a customer (Pricing on the home screen): the client, the items and the terms. job.doc holds it.
// They carry the company they are from (businessId) and a number from that company's sequence.
const DOC_SECTIONS = [
  ['address', 'Address', ''],
  ['items', 'Items', 'items'],
  ['terms', 'Terms', 'terms'],
];
export const isDoc = (job) => job.form === 'quote' || job.form === 'invoice';
export const isQuote = (job) => job.form === 'quote';
export const isInvoice = (job) => job.form === 'invoice';
export const QUOTE_STATUSES = [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined']];
export const INVOICE_STATUSES = [['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid']];
export const newDocLine = () => ({ id: uid(), item: '', qty: '', unit: '', price: '' });
/**
 * A quote or invoice. vat: 'plus' (VAT added to the prices) or 'none'. discount is a £ amount or a % (discountType). deposit: what has
 * already been paid (invoices). due: when an invoice is due, or how long a quote is valid until. quoteId / invoiceId / sourceId link
 * an invoice to the quote it came from, a quote to its invoice, and either to the costing it was made from.
 */
export const newDoc = (kind = 'quote') => ({
  kind: kind === 'invoice' ? 'invoice' : 'quote', businessId: '', number: '', numberAuto: false, issued: todayLocal(), due: '', status: 'draft', paidDate: '',
  customer: '', customerAddress: { postcode: '', text: '' }, ref: '',
  lines: [newDocLine()], vat: 'none', vatRate: '20', discount: '', discountType: '£', deposit: '',
  notes: '', terms: '', payment: '', quoteId: '', invoiceId: '', sourceId: '',
});
const RTL_SECTIONS = SECTIONS.filter(([k]) => k !== 'materials');
/** Sign off signature (both forms). image: PNG data URL; date: ISO time signed. */
export const newSignature = () => ({ name: '', image: '', date: '' });
export const isRtl = (job) => job.form === 'rtl';
/** The tabs for this job's form. */
export const sectionsOf = (job) => (isRtl(job) ? RTL_SECTIONS : isPrice(job) ? PRICE_SECTIONS : isPlan(job) ? PLAN_SECTIONS : isRepair(job) ? REPAIR_SECTIONS : isRams(job) ? RAMS_SECTIONS : isCalc(job) ? CALC_SECTIONS : isDoc(job) ? DOC_SECTIONS : SECTIONS);
export const formOf = (job) => (isPlan(job) ? { ...FORMS.plan, ...PLAN_KINDS[job.plan?.kind || 'property'] }
  : isDoc(job) ? { ...FORMS[job.form], title: `${FORMS[job.form].title}${job.doc?.number ? ` ${job.doc.number}` : ''}` }
  : isCalc(job) ? { ...FORMS.calc, title: `${calcByKey(job.calc?.kind).title} calculation`, pdfTitle: `${calcByKey(job.calc?.kind).title} Calculation`, emoji: calcByKey(job.calc?.kind).emoji }
  : FORMS[job.form] || FORMS.void);

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
  job.propertyId ??= null; // the property this entry belongs to (set when it is filed)
  job.nature ??= ''; // what the file is about, e.g. "Empty home works" (blank = the form's name)
  job.nextId ??= ''; // Empty home inspection: the Ready to let started from it
  job.fromId ??= ''; // Ready to let: the Empty home inspection it was started from
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
  if (isDoc(job)) {
    const d = newDoc(job.form);
    job.doc = { ...d, ...(job.doc || {}), kind: d.kind };
    job.doc.customerAddress = { postcode: '', text: '', ...(job.doc.customerAddress || {}) };
    if (!Array.isArray(job.doc.lines) || !job.doc.lines.length) job.doc.lines = [newDocLine()];
  }
  if (isCalc(job)) {
    const d = newCalc(job.calc?.kind);
    const defaults = defaultsFor(d.kind, { useMemory: false });
    job.calc = { ...d, ...(job.calc || {}), kind: d.kind };
    job.calc.inputs = { ...defaults.inputs, ...(job.calc.inputs || {}) };
    job.calc.assumptions = { ...defaults.assumptions, ...(job.calc.assumptions || {}) };
    job.calc.wastage = { ...defaults.wastage, ...(job.calc.wastage || {}) };
    job.calc.customerAddress = { postcode: '', text: '', ...(job.calc.customerAddress || {}) };
    if (!Array.isArray(job.calc.materials)) job.calc.materials = [];
  }
  if (isRams(job)) {
    const d = newRams();
    job.rams = { ...d, ...(job.rams || {}) };
    job.rams.customerAddress = { postcode: '', text: '', ...(job.rams.customerAddress || {}) };
    job.rams.cpp = { ...d.cpp, ...(job.rams.cpp || {}) };
    for (const k of ['risks', 'dynamics', 'methods', 'briefings', 'tasks']) if (!Array.isArray(job.rams[k])) job.rams[k] = [];
    if (!Array.isArray(job.rams.cpp.dangers)) job.rams.cpp.dangers = d.cpp.dangers;
    for (const r of job.rams.risks) { r.rows ??= []; if (!r.rows.length) r.rows.push(newRiskRow()); }
    for (const x of job.rams.dynamics) { x.checks ??= {}; x.found ??= []; }
    for (const m of job.rams.methods) {
      const dm = newMethod();
      for (const k of Object.keys(dm)) m[k] ??= dm[k];
      m.emergency = { ...dm.emergency, ...(m.emergency || {}) };
      for (const k of ['raIds', 'personnel', 'ppe', 'permits', 'steps', 'tools']) if (!Array.isArray(m[k])) m[k] = [];
      m.steps.forEach((s) => { if (!Array.isArray(s.photos)) s.photos = []; });
    }
    for (const b of job.rams.briefings) { b.kinds ??= []; b.attendees ??= []; }
  }
  if (isRepair(job)) {
    const d = newRepair();
    job.repair = { ...d, ...(job.repair || {}) };
    job.repair.customerAddress = { postcode: '', text: '', ...(job.repair.customerAddress || {}) };
    for (const k of ['rows', 'materials']) if (!Array.isArray(job.repair[k])) job.repair[k] = [];
    job.repair.rows.forEach((r) => { if (!Array.isArray(r.photos)) r.photos = []; });
    if (!job.repair.rows.length) job.repair.rows.push(newRepairRow());
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
    ...(form === 'repair' ? { repair: newRepair() } : {}),
    ...(form === 'rams' ? { rams: newRams() } : {}),
    ...(form === 'calc' ? { calc: newCalc(planKind) } : {}),
    ...(form === 'quote' || form === 'invoice' ? { doc: newDoc(form) } : {}),
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
    ...(job.repair?.rows || []).map((r) => r.photos),
    ...(job.rams?.methods || []).flatMap((m) => m.steps.map((s) => s.photos)),
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

export const squash = (s) => (s || '').replace(/\s+/g, '').toUpperCase();
export const textLines = (a) => (a.text || '').split('\n').map((s) => s.trim()).filter(Boolean);

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
  if (isRepair(job)) return 'New repair survey';
  if (isRams(job)) return 'New RAMS pack';
  if (isCalc(job)) return `New ${calcByKey(job.calc?.kind).title.toLowerCase()} calculation`;
  if (isDoc(job)) return job.doc?.number ? `${FORMS[job.form].title} ${job.doc.number}` : `New ${job.form}`;
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

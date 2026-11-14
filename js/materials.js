// Materials list: a rough list of what to take / order, grouped by room.
//  - standard items changed in every void (toilet seats, shower heads, plugs…),
//    ticked automatically by room type
//  - lock cylinders etc. from Security › Renew locks
//  - items worked out from the defects recorded (prep → filler, mould → mould wash…)
// The surveyor can untick any item, change its quantity or add their own.
// Saved per room as room.materials = { set: { [name]: { on, q } }, own: [{ n, q }] }.
// Matching is on wording only – no SOR codes or rates here (this file is public).
import { CYLINDER_DEFAULT } from './model.js';
import { UNITS, defectInfo } from './data/parts.js';
import { FEATURES, featuresOf } from './data/features.js';
import { roomType } from './templates.js';

const BATH = /bath|en-?\s?suite|shower/;
const HAS_BATH = /bath|en-?\s?suite/; // shower rooms have no bath
const TOILET = /wc|toilet|cloak/;

/** Standard items for a room type: [name, qty]. */
export function standardItems(roomName) {
  const t = roomType(roomName);
  const out = [];
  if (BATH.test(t) || TOILET.test(t)) out.push(['Toilet seat', 1]);
  if (BATH.test(t)) out.push(['Shower head & hose', 1], ['Shower curtain', 1],
    HAS_BATH.test(t) ? ['Plugs (sink & bath)', 2] : ['Sink plug', 1]);
  if (/kitchen/.test(t)) out.push(['Sink plug', 1]);
  return out;
}

/** Locks chosen in Security › Renew locks -> [name, qty, which lock]. */
const LOCK_MATERIALS = {
  'Front door': ['Euro cylinder', 1],
  'Back door': ['Euro cylinder', 1],
  'Patio door': ['Euro cylinder', 1],
  'French doors': ['Euro cylinder', 2],
  Garage: ['Garage door lock', 1],
  Shed: ['Padlock', 1],
  Gate: ['Padlock', 1],
  Windows: ['Window lock keys', 1],
  'Post box': ['Post box lock', 1],
};

// Defect wording -> materials. how: 'qty' (count), 'size' (m² / m from the defect), 'none'.
const R = (re, name, how = 'qty', parts = null) => ({ re, name, how, parts });
const DECOR = ['ceiling', 'walls'];
const RULES = [
  R(/prep|make good|holes?\b|crack|fill/, 'Filler', 'none', ['ceiling', 'walls', 'woodwork', 'door']),
  R(/mould|mildew|condensation/, 'Mould wash', 'none'),
  R(/stain|damp|nicotine|smoke damage|water mark/, 'Stain block', 'none', DECOR),
  R(/redecorat|decorat|emulsion|paint/, 'Emulsion', 'size', DECOR),
  R(/redecorat|decorat|paint|gloss|satin/, 'Gloss / satinwood', 'size', ['woodwork', 'door']),
  R(/skim|blown|hollow|sagging|re-?plaster/, 'Multi-finish plaster', 'size', DECOR),
  R(/handle|furniture/, 'Door handles (pair)', 'qty', ['door']),
  R(/handle/, 'Window handle', 'qty', ['window', 'winsec']),
  R(/restrictor/, 'Window restrictor'),
  R(/trickle vent/, 'Trickle vent'),
  R(/glass|glazing|glazed/, 'Glass / glazed unit'),
  R(/hinge/, 'Hinges'),
  R(/closer/, 'Door closer'),
  R(/door missing|holed|renew door|replace door|new door/, 'Internal door', 'qty', ['door']),
  R(/letter ?box/, 'Letterbox'),
  R(/viewer|chain/, 'Door viewer / chain'),
  R(/draught/, 'Draught strip', 'size'),
  R(/skirting/, 'Skirting board', 'size'),
  R(/architrave/, 'Architrave', 'size'),
  R(/bath panel/, 'Bath panel'),
  R(/seat/, 'Toilet seat', 'qty', ['sanitary']),
  R(/curtain rail|shower screen/, 'Shower curtain rail'),
  R(/cistern/, 'Cistern fittings'),
  R(/\btaps?\b/, 'Tap washers / cartridges'),
  R(/trap|waste/, 'Waste trap', 'qty', ['sanitary', 'kitchen']),
  R(/seal|mastic|silicone/, 'Silicone sealant', 'none', ['sanitary', 'kitchen', 'window']),
  R(/tiles?\b|tiling/, 'Tiles, adhesive & grout', 'size', ['walls', 'sanitary', 'kitchen']),
  R(/unit door|drawer front/, 'Kitchen unit door / drawer front'),
  R(/worktop(?!.*seal)/, 'Worktop', 'size'),
  R(/vinyl/, 'Vinyl flooring', 'size'),
  R(/smoke alarm/, 'Smoke alarm'),
  R(/heat alarm/, 'Heat alarm'),
  R(/carbon monoxide|co alarm/, 'CO alarm'),
  R(/socket/, 'Socket'),
  R(/switch/, 'Light switch'),
  R(/light fitting|pendant|lamp ?holder/, 'Light fitting'),
  R(/extractor/, 'Extractor fan'),
  R(/\btrv\b|radiator valve/, 'TRV'),
  R(/spindle/, 'Spindles'),
  R(/handrail/, 'Handrail', 'size'),
  R(/hatch/, 'Loft hatch'),
  R(/insulation/, 'Loft insulation', 'size'),
  R(/fence panel|panels damaged/, 'Fence panels', 'qty', ['fence']),
  R(/posts? broken/, 'Fence posts', 'qty', ['fence']),
];

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r1 = (n) => Math.round(n * 10) / 10;

/** "×2", "24 m²", "" */
export function matQty(q, unit) {
  if (q === '' || q == null) return '';
  return unit === 'm2' ? `${q} m²` : unit === 'm' ? `${q} m` : `×${q}`;
}

/** Auto items for one room / area / Security, before the surveyor's changes. */
function autoItems(room, kind, job) {
  const items = new Map(); // name -> { name, n, unit, std, from: Set }
  const add = (name, n, unit, from, { std = false, max = false } = {}) => {
    const it = items.get(name) || { name, n: 0, unit, std: false, from: new Set() };
    if (std) it.std = true;
    if (n && (it.unit === unit || !it.n)) {
      it.unit = unit;
      it.n = max ? Math.max(it.n, n) : r1(it.n + n);
    }
    if (from) it.from.add(from);
    items.set(name, it);
  };
  if (kind === 'rooms') for (const [name, n] of standardItems(room.name)) add(name, n, 'nr', 'standard', { std: true });
  if (kind === 'security') {
    for (const lock of job.works.cylinders ?? CYLINDER_DEFAULT) {
      const m = LOCK_MATERIALS[lock];
      if (m) add(m[0], m[1], 'nr', lock, { std: true });
    }
  }
  for (const part of featuresOf(room, kind)) {
    const p = room.parts?.[part.key];
    if (p?.state !== 'works') continue;
    for (const d of p.defects) {
      const { label, unit } = defectInfo(FEATURES[part.key] ? part : null, d);
      const text = label.toLowerCase();
      for (const rule of RULES) {
        if (rule.parts && !rule.parts.includes(part.key)) continue;
        if (!rule.re.test(text)) continue;
        const counted = UNITS[unit]?.count !== false;
        const q = num(d.qty);
        if (rule.how === 'qty') add(rule.name, counted ? q || 1 : 1, 'nr', part.label, { max: items.get(rule.name)?.std });
        else if (rule.how === 'size') add(rule.name, counted ? 0 : q, counted ? '' : unit, part.label);
        else add(rule.name, 0, '', part.label);
      }
    }
  }
  return [...items.values()];
}

/**
 * Every group with its items:
 * [{ room, kind, name, items: [{ name, q, unit, on, std, own, from }] }]
 * q is the quantity to show (surveyor's own figure if changed).
 */
export function materialGroups(job) {
  const groups = [];
  const build = (room, kind, name) => {
    const m = room.materials || {};
    const set = m.set || {};
    const items = autoItems(room, kind, job).map((it) => {
      const o = set[it.name] || {};
      return {
        name: it.name,
        unit: it.unit,
        q: o.q ?? (it.n ? String(it.n) : ''),
        on: o.on ?? true,
        std: it.std,
        own: false,
        from: [...it.from].filter((f) => f !== 'standard'),
      };
    });
    for (const own of m.own || []) items.push({ name: own.n, unit: 'nr', q: own.q ?? '', on: true, std: false, own: true, from: [] });
    groups.push({ room, kind, name, items });
  };
  if (job.security) build(job.security, 'security', 'Doors & locks');
  for (const r of job.rooms) build(r, 'rooms', r.name || 'Room');
  for (const r of job.externals) build(r, 'externals', r.name || 'Area');
  return groups;
}

/** Ticked items only, totalled by name across the property: [{ name, q, unit }]. */
export function materialTotals(groups) {
  const t = new Map();
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.on) continue;
      const key = `${it.name.toLowerCase()}|${it.unit}`;
      const row = t.get(key) || { name: it.name, unit: it.unit, n: 0, any: false };
      const n = num(it.q);
      if (n) { row.n = r1(row.n + n); row.any = true; }
      t.set(key, row);
    }
  }
  return [...t.values()].map((r) => ({ name: r.name, unit: r.unit, q: r.any ? String(r.n) : '' }));
}

/** Change an item's tick or quantity for this room. */
export function setMaterial(room, name, patch) {
  room.materials ??= { set: {}, own: [] };
  room.materials.set ??= {};
  room.materials.set[name] = { ...(room.materials.set[name] || {}), ...patch };
}

export function addOwnMaterial(room, n, q = '') {
  room.materials ??= { set: {}, own: [] };
  room.materials.own ??= [];
  room.materials.own.push({ n, q });
}

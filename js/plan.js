// Designer floor plans: the symbol / fixture catalogue and plan geometry. Pure – no DOM.
// Units: centimetres. Rooms are rectangles (x, y = top-left corner). Every item belongs to
// a room and is stored relative to it, so moving a room moves its doors, windows and fittings.

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

export const PLAN_KINDS = {
  property: { title: 'Whole property plan', pdfTitle: 'Floor Plan', file: 'Floor plan', emoji: '🏠' },
  kitchen: { title: 'Kitchen plan', pdfTitle: 'Kitchen Plan', file: 'Kitchen plan', emoji: '🍳' },
  bathroom: { title: 'Bathroom plan', pdfTitle: 'Bathroom Plan', file: 'Bathroom plan', emoji: '🛁' },
};

// Standard unit widths (cm) offered in the size drop-down.
const BASE_SIZES = [30, 40, 45, 50, 60, 80, 90, 100, 120];
const WALL_SIZES = [30, 40, 50, 60, 80, 90, 100];

/**
 * run: fixtures in the same run (base-level or wall-level) snap flush against each other.
 * corner: an L-shaped unit in a square of side w; this is the depth of its two arms.
 * kind: 'wall' (an opening in a wall: size = width), 'point' (a symbol with a short code),
 * 'fixture' (a box: w × h in cm; Rotate swaps them).
 */
export const ITEMS = {
  door: { kind: 'wall', label: 'Door', emoji: '🚪', size: 76 },
  window: { kind: 'wall', label: 'Window', emoji: '🪟', size: 120 },
  fuse: { kind: 'point', label: 'Fuse board', emoji: '⚡', code: 'FB' },
  water: { kind: 'point', label: 'Water main / stop tap', emoji: '🚰', code: 'WM' },
  gas: { kind: 'point', label: 'Gas meter', emoji: '🔥', code: 'GM' },
  elec: { kind: 'point', label: 'Electric meter', emoji: '🔌', code: 'EM' },
  boiler: { kind: 'point', label: 'Boiler', emoji: '♨️', code: 'BL' },
  smoke: { kind: 'point', label: 'Smoke alarm', emoji: '🔔', code: 'SA' },
  co: { kind: 'point', label: 'CO alarm', emoji: '⚠️', code: 'CO' },
  radiator: { kind: 'fixture', label: 'Radiator', emoji: '▬', w: 100, h: 12 },
  base: { kind: 'fixture', cab: true, styles: true, label: 'Base unit', emoji: '▢', w: 60, h: 60, run: 'base', sizes: BASE_SIZES },
  wallunit: { kind: 'fixture', cab: true, label: 'Wall unit', emoji: '▭', w: 60, h: 33, dashed: true, run: 'wall', sizes: WALL_SIZES },
  cornerbase: { kind: 'fixture', cab: true, label: 'Corner base unit', emoji: '◣', w: 90, h: 90, corner: 60, run: 'base', sizes: [90, 100] },
  cornerwall: { kind: 'fixture', cab: true, label: 'Corner wall unit', emoji: '◤', w: 60, h: 60, corner: 33, dashed: true, run: 'wall', sizes: [60, 65] },
  blindcorner: { kind: 'fixture', cab: true, blind: true, label: 'Blind corner base unit', emoji: '◧', w: 100, h: 57, run: 'base', sizes: [80, 100] },
  appspace: { kind: 'fixture', cab: true, space: true, dashed: true, label: 'Appliance space', emoji: '⬚', w: 60, h: 60, run: 'base', sizes: [45, 50, 55, 60, 70, 90, 100] },
  fillerbase: { kind: 'fixture', filler: true, label: 'Filler panel (base)', emoji: '▮', w: 5, h: 60, run: 'base', sizes: [3, 5, 7.5, 10, 15, 20, 30] },
  fillerwall: { kind: 'fixture', filler: true, dashed: true, label: 'Filler panel (wall)', emoji: '▯', w: 5, h: 33, run: 'wall', sizes: [3, 5, 7.5, 10, 15, 20, 30] },
  larder: { kind: 'fixture', cab: true, patterns: true, label: 'Larder unit', emoji: '🗄️', w: 60, h: 60, run: 'base', sizes: [30, 40, 45, 50, 60, 80, 100] },
  ovenhousing: { kind: 'fixture', cab: true, patterns: true, label: 'Oven housing', emoji: '♨️', w: 60, h: 60, run: 'base', sizes: [60] },
  fridgefreezer: { kind: 'fixture', cab: true, patterns: true, label: 'Fridge / freezer housing', emoji: '🧊', w: 60, h: 60, run: 'base', sizes: [55, 60, 70] },
  sink: { kind: 'fixture', label: 'Sink', emoji: '🚰', w: 100, h: 55, run: 'base' },
  hob: { kind: 'fixture', label: 'Hob', emoji: '🍳', w: 60, h: 55, run: 'base' },
  oven: { kind: 'fixture', label: 'Oven', emoji: '♨️', w: 60, h: 60, run: 'base' },
  fridge: { kind: 'fixture', label: 'Fridge', emoji: '🧊', w: 60, h: 65, run: 'base' },
  washer: { kind: 'fixture', label: 'Washing machine', emoji: '🫧', w: 60, h: 60, run: 'base' },
  dishwasher: { kind: 'fixture', label: 'Dishwasher', emoji: '🍽️', w: 60, h: 60, run: 'base' },
  bath: { kind: 'fixture', label: 'Bath', emoji: '🛁', w: 170, h: 70 },
  shower: { kind: 'fixture', label: 'Shower', emoji: '🚿', w: 90, h: 90 },
  wc: { kind: 'fixture', label: 'WC', emoji: '🚽', w: 40, h: 65 },
  basin: { kind: 'fixture', label: 'Basin', emoji: '🪥', w: 55, h: 45 },
};

// Everything laid out on the Floor plan tab can be turned to face a wall (radiators are fixed structure).
for (const [k, d] of Object.entries(ITEMS)) if (d.kind === 'fixture' && k !== 'radiator') d.facing = true;

/** Blind corner units: the door widths that go with each unit width (cm). */
export const DOOR_OPTIONS = { 100: [50, 60], 80: [30, 35, 40] };
export const APPLIANCES = ['Oven / cooker', 'Dishwasher', 'Washing machine', 'Fridge / freezer', 'Other'];
export const END_PANEL = 1.8; // cm thick

/** Buttons offered for each kind of plan, in order. */
export const PALETTE = {
  property: ['door', 'window', 'fuse', 'water', 'gas', 'elec', 'boiler', 'smoke', 'co', 'radiator', 'base', 'cornerbase', 'blindcorner', 'larder', 'ovenhousing', 'fridgefreezer', 'appspace', 'fillerbase', 'wallunit', 'cornerwall', 'fillerwall', 'sink', 'hob', 'oven', 'fridge', 'washer', 'dishwasher', 'bath', 'shower', 'wc', 'basin'],
  kitchen: ['door', 'window', 'base', 'cornerbase', 'blindcorner', 'larder', 'ovenhousing', 'fridgefreezer', 'appspace', 'fillerbase', 'wallunit', 'cornerwall', 'fillerwall', 'sink', 'hob', 'oven', 'fridge', 'washer', 'dishwasher', 'boiler', 'radiator', 'fuse', 'water', 'gas', 'elec'],
  bathroom: ['door', 'window', 'bath', 'shower', 'wc', 'basin', 'radiator', 'water'],
};

/**
 * The structure of a room (walls, doors, windows, services, radiators) is set on the Room dimensions
 * tab; the units and bathroom fittings are laid out on the Floor plan tab.
 */
export const isStructure = (type) => ITEMS[type].kind !== 'fixture' || type === 'radiator';

/** What a base unit can be, and the door splits for tall units (upper / lower door). */
export const STYLES = { door: 'Full height door', drawerline: 'Drawer-line unit', drawers: 'Full drawer cabinet' };
export const PATTERNS = ['50/50', '60/40', '70/30'];

export const ROOM_NAMES = ['Living room', 'Kitchen', 'Kitchen / diner', 'Dining room', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Box room', 'Bathroom', 'Shower room', 'En-suite', 'WC', 'Hallway', 'Landing', 'Stairs', 'Utility', 'Conservatory', 'Store', 'Garage'];
export const FLOOR_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Loft', 'Basement'];

export const newPlanRoom = ({ name = 'Room', w = 300, h = 300, x = 0, y = 0 } = {}) => ({ id: newId(), name, x, y, w, h, height: '' });
export const newFloor = (name) => ({ id: newId(), name, rooms: [], items: [] });

export function newPlan(kind = 'property') {
  const k = PLAN_KINDS[kind] ? kind : 'property';
  const floor = newFloor(k === 'property' ? 'Ground floor' : PLAN_KINDS[k].title);
  if (k === 'kitchen') floor.rooms.push(newPlanRoom({ name: 'Kitchen', w: 300, h: 350 }));
  if (k === 'bathroom') floor.rooms.push(newPlanRoom({ name: 'Bathroom', w: 200, h: 250 }));
  return { kind: k, floors: [floor], notes: '' };
}

/** A new item of this type in a room. */
export function newPlanItem(type, props = {}) {
  const d = ITEMS[type];
  const base = d.kind === 'wall' ? { size: d.size, flip: false, wall: 'n', at: 0 }
    : d.facing ? {
      w: d.w, h: d.h, uw: d.w, ud: d.h, rot: 0, manual: false, dx: 0, dy: 0,
      ...(d.cab && !d.corner && !d.space ? { endL: false, endR: false } : {}),
      ...(d.styles ? { style: 'door' } : {}),
      ...(d.patterns ? { pattern: '50/50' } : {}),
      ...(d.blind ? { door: 60, hand: 'right', post: 7 } : {}),
      ...(d.space ? { appliance: APPLIANCES[0] } : {}),
    }
      : d.kind === 'fixture' ? { w: d.w, h: d.h, dx: 0, dy: 0 } : { dx: 0, dy: 0 };
  return { id: newId(), type, ...base, ...props };
}

// ---------- measurements ----------

const parseNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const metres = (cm) => `${(cm / 100).toFixed(2)} m`;
export const sqm = (n) => `${n.toFixed(1)} m²`;

/** Floor area, perimeter (m) and – with a ceiling height – wall area. */
export function roomFigures(room) {
  const floor = (room.w * room.h) / 10000;
  const perimeter = (2 * (room.w + room.h)) / 100;
  const height = parseNum(room.height);
  return { floor, perimeter, height: height > 0 ? height : null, walls: height > 0 ? perimeter * height : null };
}
export const floorArea = (floor) => floor.rooms.reduce((a, r) => a + roomFigures(r).floor, 0);
export const planArea = (plan) => plan.floors.reduce((a, f) => a + floorArea(f), 0);

// ---------- geometry ----------

/** A room's wall: ends, length and the direction pointing into the room. */
export function wallLine(room, wall) {
  switch (wall) {
    case 'n': return { x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y, nx: 0, ny: 1, len: room.w };
    case 's': return { x1: room.x, y1: room.y + room.h, x2: room.x + room.w, y2: room.y + room.h, nx: 0, ny: -1, len: room.w };
    case 'w': return { x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.h, nx: 1, ny: 0, len: room.h };
    default: return { x1: room.x + room.w, y1: room.y, x2: room.x + room.w, y2: room.y + room.h, nx: -1, ny: 0, len: room.h };
  }
}

/** Door / window on its wall: ends a–b; doors also hinge, open leaf end and swing arc. */
export function openingGeometry(room, item) {
  const L = wallLine(room, item.wall);
  const size = Math.min(item.size, L.len);
  const ux = (L.x2 - L.x1) / L.len, uy = (L.y2 - L.y1) / L.len;
  const at = Math.max(0, Math.min(item.at, L.len - size));
  const a = { x: L.x1 + ux * at, y: L.y1 + uy * at };
  const b = { x: a.x + ux * size, y: a.y + uy * size };
  const hinge = item.flip ? b : a;
  const other = item.flip ? a : b;
  const leaf = { x: hinge.x + L.nx * size, y: hinge.y + L.ny * size };
  const t0 = Math.atan2(leaf.y - hinge.y, leaf.x - hinge.x);
  let d = Math.atan2(other.y - hinge.y, other.x - hinge.x) - t0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const arc = [];
  for (let i = 0; i <= 12; i++) {
    const t = t0 + (d * i) / 12;
    arc.push({ x: hinge.x + Math.cos(t) * size, y: hinge.y + Math.sin(t) * size });
  }
  return { a, b, hinge, leaf, arc, L, size };
}

/** Nearest room wall to a point (within maxDist cm): { room, wall, at, dist }. */
export function nearestWall(rooms, x, y, maxDist) {
  let best = null;
  for (const room of rooms) {
    for (const wall of ['n', 'e', 's', 'w']) {
      const L = wallLine(room, wall);
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
      const t = Math.max(0, Math.min(1, ((x - L.x1) * dx + (y - L.y1) * dy) / (L.len * L.len)));
      const dist = Math.hypot(x - (L.x1 + dx * t), y - (L.y1 + dy * t));
      if (dist <= maxDist && (!best || dist < best.dist)) best = { room, wall, at: t * L.len, dist };
    }
  }
  return best;
}

/** The (top-most) room containing a point. */
export const roomAt = (rooms, x, y) => [...rooms].reverse().find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

/** Extent of a floor's rooms, or null when empty. */
export function bounds(floor) {
  if (!floor.rooms.length) return null;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const r of floor.rooms) {
    b.minX = Math.min(b.minX, r.x);
    b.minY = Math.min(b.minY, r.y);
    b.maxX = Math.max(b.maxX, r.x + r.w);
    b.maxY = Math.max(b.maxY, r.y + r.h);
  }
  return b;
}

/** Keep a fixture / symbol inside its room; fixtures within 20 cm of a wall go flush to it. */
export function settleItem(room, item) {
  const w = item.w || 0, h = item.h || 0;
  item.dx = Math.max(0, Math.min(item.dx, room.w - w));
  item.dy = Math.max(0, Math.min(item.dy, room.h - h));
  if (ITEMS[item.type].kind === 'fixture') {
    if (item.dx <= 20) item.dx = 0;
    if (item.dy <= 20) item.dy = 0;
    if (room.w - (item.dx + w) <= 20) item.dx = Math.max(0, room.w - w);
    if (room.h - (item.dy + h) <= 20) item.dy = Math.max(0, room.h - h);
  }
}

/** Symbols used on a floor, for the key: [[code, label]]. */
export function legend(floors) {
  const used = new Set(floors.flatMap((f) => f.items.map((i) => i.type)));
  return Object.entries(ITEMS).filter(([k, d]) => d.kind === 'point' && used.has(k)).map(([, d]) => [d.code, d.label]);
}

/** Corner units are L-shaped: the outline (cm, relative to the unit's box) turned by item.rot (0/90/180/270). */
export function cornerPoints(item) {
  const S = item.w, a = Math.min(ITEMS[item.type].corner, S);
  let pts = [[0, 0], [S, 0], [S, a], [a, a], [a, S], [0, S]];
  for (let i = 0; i < ((item.rot || 0) / 90) % 4; i++) pts = pts.map(([x, y]) => [S - y, x]);
  return pts;
}

/** Keep a fixture inside its room (no wall-flush snapping). */
export function clampItem(room, item) {
  item.dx = Math.max(0, Math.min(item.dx, room.w - (item.w || 0)));
  item.dy = Math.max(0, Math.min(item.dy, room.h - (item.h || 0)));
}

/**
 * Units in the same run (base or wall level) snap flush against each other: the edge you bring
 * near another unit (within tol cm) closes up, and the fronts / backs line up too.
 */
export function snapToUnits(room, items, item, tol = 15) {
  const run = ITEMS[item.type].run;
  if (!run) return;
  const others = items.filter((o) => o !== item && o.roomId === item.roomId && ITEMS[o.type].run === run && ITEMS[o.type].kind === 'fixture');
  const best = (cands) => cands.filter((c) => Math.abs(c.d) <= tol).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
  const overlaps = (a0, a1, b0, b1) => a0 < b1 + tol && a1 > b0 - tol;
  const align = (lo, len, olo, olen) => (Math.abs(lo - olo) <= tol ? olo : Math.abs(lo + len - (olo + olen)) <= tol ? olo + olen - len : lo);
  // side by side (moves dx, then lines up dy)
  let hs = [];
  for (const o of others) {
    if (!overlaps(item.dy, item.dy + item.h, o.dy, o.dy + o.h)) continue;
    hs.push({ o, d: o.dx + o.w - item.dx }, { o, d: o.dx - item.w - item.dx });
  }
  const h = best(hs);
  if (h) { item.dx += h.d; item.dy = align(item.dy, item.h, h.o.dy, h.o.h); }
  // front to back (moves dy, then lines up dx)
  const vs = [];
  for (const o of others) {
    if (!overlaps(item.dx, item.dx + item.w, o.dx, o.dx + o.w)) continue;
    vs.push({ o, d: o.dy + o.h - item.dy }, { o, d: o.dy - item.h - item.dy });
  }
  const v = best(vs);
  if (v) { item.dy += v.d; item.dx = align(item.dx, item.w, v.o.dx, v.o.w); }
  clampItem(room, item);
}

// ---------- cabinets ----------
// A cabinet keeps its true size (uw wide along its front, ud deep) and which way it faces (rot):
// 0 = back to the north wall, 90 = back to the east wall, 180 = south, 270 = west. For corner units
// rot 0/90/180/270 = the corner at the NW / NE / SE / SW corner. w / h are the box on the plan.
// manual: the user turned it by hand, so it stops turning itself to face the wall.

/** Set the plan box (w × h) from the unit's size and facing. */
export function applyRot(it) {
  if (ITEMS[it.type].corner) { it.w = it.uw; it.h = it.uw; return; }
  const sideways = (it.rot || 0) % 180 !== 0;
  it.w = sideways ? it.ud : it.uw;
  it.h = sideways ? it.uw : it.ud;
}

/** Turn a cabinet to face a new way, keeping its centre where it is. */
export function rotateAbout(it, rot) {
  const cx = it.dx + it.w / 2, cy = it.dy + it.h / 2;
  it.rot = rot;
  applyRot(it);
  it.dx = cx - it.w / 2;
  it.dy = cy - it.h / 2;
}

/** Older base / wall units had only w, h and a "turned" flag: give them a size and a facing. */
export function upgradePlanItem(it) {
  const d = ITEMS[it.type];
  if (!d?.facing || it.uw != null) return;
  if (d.corner) { it.uw = it.ud = it.w; it.rot ??= 0; } else {
    const turned = Boolean(it.turn);
    it.uw = turned ? it.h : it.w;
    it.ud = turned ? it.w : it.h;
    it.rot = turned ? 90 : 0;
  }
  it.manual = Boolean(it.turn);
  if (d.styles) it.style ??= 'door';
  if (d.patterns) it.pattern ??= '50/50';
}

/** Cabinet numbers for the key, in the order they were added: Map(id → 1, 2, 3 …). */
export function cabinetNumbers(floor) {
  const m = new Map();
  for (const it of floor.items) if (ITEMS[it.type]?.cab) m.set(it.id, m.size + 1);
  return m;
}

/** One line for the key: "Base unit, 600 mm wide - Full height door". */
export function cabinetText(it) {
  const d = ITEMS[it.type];
  const parts = [`${d.label}, ${Math.round((it.uw ?? it.w) * 10)} mm wide`];
  if (d.styles) parts.push(STYLES[it.style] || STYLES.door);
  if (d.patterns) parts.push(`doors ${it.pattern || PATTERNS[0]}`);
  if (d.blind) parts.push(`${Math.round(it.door * 10)} mm door, corner post ${Math.round((it.post ?? 7) * 10)} mm, blind end ${it.hand || 'right'}`);
  if (d.space) parts.push(`for ${(it.appliance || APPLIANCES[0]).toLowerCase()}, end panels both sides`);
  else if (it.endL && it.endR) parts.push('end panels both sides');
  else if (it.endL || it.endR) parts.push(`end panel ${it.endL ? 'left' : 'right'}`);
  return parts.join(' - ');
}

// Cabinet-local axes: u runs along the front from the viewer's left to right, v from the back (0) to the front (ud).
/** A cabinet-local point (u, v) → position inside the unit's box on the plan (cm). */
export function boxPoint(it, u, v) {
  switch ((it.rot || 0) % 360) {
    case 90: return [it.w - v, u];
    case 180: return [it.w - u, it.h - v];
    case 270: return [v, it.h - u];
    default: return [u, v];
  }
}
/** A point in room coordinates → the cabinet's local (u, v). */
export function localPoint(it, x, y) {
  const bx = x - it.dx, by = y - it.dy;
  switch ((it.rot || 0) % 360) {
    case 90: return [by, it.w - bx];
    case 180: return [it.w - bx, it.h - by];
    case 270: return [it.h - by, bx];
    default: return [bx, by];
  }
}
const seg = (it, u1, v1, u2, v2) => [...boxPoint(it, u1, v1), ...boxPoint(it, u2, v2)];

/** The front edge of a straight cabinet, as [x1, y1, x2, y2] in cm inside its box. */
export function frontEdge(it) {
  return seg(it, 0, it.ud, it.uw, it.ud);
}

/**
 * A blind corner unit: a door, a corner post beside it, then the open blind end that runs back
 * into the corner. Returns { door, open } front segments and the post as 4 points, all inside the box.
 */
export function blindGeometry(it) {
  const uw = it.uw, ud = it.ud, door = Math.min(it.door, uw - 10), post = Math.min(it.post ?? 7, uw - door - 3);
  const right = (it.hand || 'right') === 'right'; // the blind end is on the viewer's right
  const d0 = right ? 0 : uw - door, d1 = right ? door : uw;
  const p0 = right ? door : uw - door - post, p1 = p0 + post;
  const o0 = right ? p1 : 0, o1 = right ? uw : p0;
  return {
    door: seg(it, d0, ud, d1, ud),
    open: seg(it, o0, ud, o1, ud),
    post: [[p0, ud - 3], [p1, ud - 3], [p1, ud], [p0, ud]].map(([u, v]) => boxPoint(it, u, v)),
  };
}

/** The corner post takes up the gap between the door and the cabinet that adjoins the blind end. */
export function blindPost(it, items) {
  const uw = it.uw, blind = uw - Math.min(it.door, uw - 10);
  const right = (it.hand || 'right') === 'right';
  let reach = 0; // how far the adjoining cabinet comes in along the blind end
  for (const o of items) {
    if (o === it || o.roomId !== it.roomId || ITEMS[o.type].kind !== 'fixture' || ITEMS[o.type].run !== 'base') continue;
    const [ua, va] = localPoint(it, o.dx, o.dy), [ub, vb] = localPoint(it, o.dx + o.w, o.dy + o.h);
    const u0 = Math.min(ua, ub), u1 = Math.max(ua, ub), v0 = Math.min(va, vb);
    if (v0 < it.ud - 5 || v0 > it.ud + 25) continue; // not standing against the front
    const d = right ? (u1 >= uw - 5 && u0 < uw - 1 ? uw - u0 : 0) : (u0 <= 5 && u1 > 1 ? u1 : 0);
    reach = Math.max(reach, d);
  }
  const post = reach ? reach - blind : 7;
  return Math.round(Math.max(5, Math.min(post, blind - 5)) * 2) / 2;
}
/** Re-fit every blind corner's post to the cabinets beside it. */
export function refreshPosts(floor) {
  for (const it of floor.items) if (ITEMS[it.type]?.blind) it.post = blindPost(it, floor.items);
}

/**
 * End panels (thin panels closing the end of a run): any unit with endL / endR set, and both
 * sides of every appliance space. Returns rectangles in room coordinates.
 */
export function endPanels(floor) {
  const out = [];
  for (const it of floor.items) {
    const d = ITEMS[it.type];
    if (!d?.cab || d.corner) continue;
    const left = d.space || it.endL, right = d.space || it.endR;
    for (const [on, u0, u1, side] of [[left, -END_PANEL, 0, 'left'], [right, it.uw, it.uw + END_PANEL, 'right']]) {
      if (!on) continue;
      const [x1, y1] = boxPoint(it, u0, 0), [x2, y2] = boxPoint(it, u1, it.ud);
      out.push({ ownerId: it.id, roomId: it.roomId, side, level: d.run === 'wall' ? 'wall' : 'base', depth: it.ud, x: it.dx + Math.min(x1, x2), y: it.dy + Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
    }
  }
  return out;
}

/** Key lines for the things that are not numbered units: end panels and fillers. */
export function panelLines(floor) {
  const lines = [];
  const groups = new Map();
  for (const p of endPanels(floor)) {
    const k = `${p.level}|${p.depth}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  for (const [k, n] of groups) {
    const [level, depth] = k.split('|');
    lines.push(`${n} x end panel, ${level} level, ${Math.round(depth * 10)} mm deep`);
  }
  const fillers = new Map();
  for (const it of floor.items) {
    if (!ITEMS[it.type]?.filler) continue;
    const k = `${ITEMS[it.type].run === 'wall' ? 'wall' : 'base'}|${it.uw}`;
    fillers.set(k, (fillers.get(k) || 0) + 1);
  }
  for (const [k, n] of fillers) {
    const [level, w] = k.split('|');
    lines.push(`${n} x filler panel, ${Math.round(w * 10)} mm wide, ${level} level`);
  }
  return lines;
}

/** Where to put the number on a corner unit (inside one of its arms). */
export function cornerLabelPoint(it) {
  const a = Math.min(ITEMS[it.type].corner, it.w);
  let p = [a / 2, a / 2];
  for (let i = 0; i < ((it.rot || 0) / 90) % 4; i++) p = [it.w - p[1], p[0]];
  return p;
}

const NEAR_WALL = 25; // cm: a unit this close to a wall turns its back to it

/** The facing a cabinet should take for where it sits, or null when it is out in the room. */
export function autoFacing(room, it) {
  const d = ITEMS[it.type];
  const cx = it.dx + it.w / 2, cy = it.dy + it.h / 2;
  if (d.corner) {
    const corners = [[0, 0, 0], [room.w, 0, 90], [room.w, room.h, 180], [0, room.h, 270]];
    const best = corners.map(([x, y, rot]) => ({ rot, dist: Math.hypot(cx - x, cy - y) })).sort((a, b) => a.dist - b.dist)[0];
    return best.dist <= (it.w / 2) * 1.42 + NEAR_WALL ? best.rot : null;
  }
  const ud = it.ud;
  const gaps = [
    { rot: 0, gap: cy - ud / 2 },
    { rot: 90, gap: room.w - cx - ud / 2 },
    { rot: 180, gap: room.h - cy - ud / 2 },
    { rot: 270, gap: cx - ud / 2 },
  ];
  const min = Math.min(...gaps.map((g) => g.gap));
  if (min > NEAR_WALL) return null;
  const ties = gaps.filter((g) => g.gap <= min + 5);
  return (ties.find((g) => g.rot === it.rot) || ties[0]).rot;
}

/** Gaps (cm) between each end of a cabinet and the wall beyond it, seen from the front. */
function endGaps(room, it) {
  const east = room.w - (it.dx + it.w), south = room.h - (it.dy + it.h);
  switch ((it.rot || 0) % 360) {
    case 90: return { left: it.dy, right: south };
    case 180: return { left: east, right: it.dx };
    case 270: return { left: south, right: it.dy };
    default: return { left: it.dx, right: east };
  }
}

/** Turn a unit to face its wall (unless the user turned it by hand); a blind corner points its blind end into the nearest corner. */
export function autoRotate(room, it) {
  const d = ITEMS[it.type];
  if (!d?.facing || it.manual) return;
  const rot = autoFacing(room, it);
  if (rot != null && rot !== it.rot) rotateAbout(it, rot);
  if (d.blind && !it.handLock) {
    const g = endGaps(room, it);
    if (g.right < g.left && g.right <= 60) it.hand = 'right';
    else if (g.left < g.right && g.left <= 60) it.hand = 'left';
  }
}

/** Put a new cabinet in the middle of the room, or the nearest clear spot when something stands there. */
export function clearSpot(room, items, it) {
  const level = (t) => (ITEMS[t].run === 'wall' ? 'wall' : 'base');
  const others = items.filter((o) => o !== it && o.roomId === room.id && ITEMS[o.type].kind === 'fixture' && o.type !== 'radiator' && level(o.type) === level(it.type));
  const free = (x, y) => others.every((o) => x >= o.dx + o.w || x + it.w <= o.dx || y >= o.dy + o.h || y + it.h <= o.dy);
  const cx = Math.max(0, (room.w - it.w) / 2), cy = Math.max(0, (room.h - it.h) / 2);
  const spots = [{ x: cx, y: cy, d: 0 }];
  for (let x = 0; x <= room.w - it.w; x += 10) for (let y = 0; y <= room.h - it.h; y += 10) spots.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  const pick = spots.sort((a, b) => a.d - b.d).find((s) => free(s.x, s.y)) || spots[0];
  it.dx = Math.round(pick.x);
  it.dy = Math.round(pick.y);
}

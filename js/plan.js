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
  base: { kind: 'fixture', label: 'Base unit', emoji: '▢', w: 60, h: 60, run: 'base', sizes: BASE_SIZES },
  wallunit: { kind: 'fixture', label: 'Wall unit', emoji: '▭', w: 60, h: 33, dashed: true, run: 'wall', sizes: WALL_SIZES },
  cornerbase: { kind: 'fixture', label: 'Corner base unit', emoji: '◣', w: 90, h: 90, corner: 60, run: 'base', sizes: [90, 100] },
  cornerwall: { kind: 'fixture', label: 'Corner wall unit', emoji: '◤', w: 60, h: 60, corner: 33, dashed: true, run: 'wall', sizes: [60, 65] },
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

/** Buttons offered for each kind of plan, in order. */
export const PALETTE = {
  property: ['door', 'window', 'fuse', 'water', 'gas', 'elec', 'boiler', 'smoke', 'co', 'radiator'],
  kitchen: ['door', 'window', 'base', 'cornerbase', 'wallunit', 'cornerwall', 'sink', 'hob', 'oven', 'fridge', 'washer', 'dishwasher', 'boiler', 'radiator', 'fuse', 'water', 'gas', 'elec'],
  bathroom: ['door', 'window', 'bath', 'shower', 'wc', 'basin', 'radiator', 'water'],
};

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
    : d.kind === 'fixture' ? { w: d.w, h: d.h, dx: 0, dy: 0, ...(d.corner ? { rot: 0 } : {}) } : { dx: 0, dy: 0 };
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

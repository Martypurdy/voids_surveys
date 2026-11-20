// Designer › tape measure. Pure geometry – no DOM. Units: centimetres, plan (world) coordinates.
// A measure is { id, a: {x, y}, b: {x, y} }: two free points kept on the floor (floor.measures). Its length is
// always worked out from the two points, so moving an end re-measures it.
import { ITEMS, openingGeometry, cornerPoints, roomAt, nearestRoom, autoRotate, clampItem } from './plan.js';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

export const ANGLE_STEP = 22.5; // degrees: lines click onto 0, 22.5, 45 … when close
export const ANGLE_TOL = 3; // degrees either side of a step that still snaps

// ra / rb (optional): what each end is attached to (see featurePoints); an attached end follows it when it moves.
export const newMeasure = (a, b, ra = null, rb = null) => ({ id: newId(), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, ...(ra ? { ra } : {}), ...(rb ? { rb } : {}) });
export const measureLength = (m) => Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
/** Direction a → b in degrees, 0 = east, 90 = south (screen style), folded to 0–180 for display. */
export const measureAngle = (m) => {
  let d = (Math.atan2(m.b.y - m.a.y, m.b.x - m.a.x) * 180) / Math.PI;
  if (d < 0) d += 180;
  if (d >= 180) d -= 180;
  return Math.round(d * 10) / 10;
};
export const mmText = (cm) => `${Math.round(cm * 10).toLocaleString('en-GB')} mm`;

/**
 * Points worth snapping to: room corners, unit corners, door / window ends, service symbols. Each carries a ref
 * (what it is on the plan) so a tape end that lands on it can stay attached and follow it when it moves:
 *   { room, c: 'nw' | 'ne' | 'sw' | 'se' }   a room corner (follows moving and resizing)
 *   { item, fx, fy }                          a spot on a unit / symbol: fx, fy are fractions (0–1) of its box
 *   { item, end: 'a' | 'b' }                  an end of a door or window
 */
export function featurePoints(floor) {
  const pts = [];
  for (const r of floor.rooms) {
    pts.push({ x: r.x, y: r.y, ref: { room: r.id, c: 'nw' } }, { x: r.x + r.w, y: r.y, ref: { room: r.id, c: 'ne' } },
      { x: r.x, y: r.y + r.h, ref: { room: r.id, c: 'sw' } }, { x: r.x + r.w, y: r.y + r.h, ref: { room: r.id, c: 'se' } });
  }
  for (const it of floor.items) {
    const r = floor.rooms.find((q) => q.id === it.roomId);
    const d = ITEMS[it.type];
    if (!r || !d) continue;
    if (d.kind === 'wall') {
      const g = openingGeometry(r, it);
      pts.push({ x: g.a.x, y: g.a.y, ref: { item: it.id, end: 'a' } }, { x: g.b.x, y: g.b.y, ref: { item: it.id, end: 'b' } });
    } else if (d.kind === 'point') {
      pts.push({ x: r.x + it.dx, y: r.y + it.dy, ref: { item: it.id, fx: 0, fy: 0 } });
    } else if (d.corner) {
      for (const [px, py] of cornerPoints(it)) pts.push({ x: r.x + it.dx + px, y: r.y + it.dy + py, ref: { item: it.id, fx: px / it.w, fy: py / it.h } });
    } else {
      const x = r.x + it.dx, y = r.y + it.dy;
      pts.push({ x, y, ref: { item: it.id, fx: 0, fy: 0 } }, { x: x + it.w, y, ref: { item: it.id, fx: 1, fy: 0 } },
        { x, y: y + it.h, ref: { item: it.id, fx: 0, fy: 1 } }, { x: x + it.w, y: y + it.h, ref: { item: it.id, fx: 1, fy: 1 } });
    }
  }
  return pts;
}

/** What a point sits exactly on (within tol cm), as a ref a tape end can attach to, or null. */
export function refAt(floor, p, tol = 0.3) {
  let best = null;
  for (const q of featurePoints(floor)) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= tol && (!best || d < best.d)) best = { d, ref: q.ref };
  }
  return best ? { ...best.ref } : null;
}

/** Where a ref is now, or null when what it pointed at has gone. */
export function resolveRef(floor, ref) {
  if (!ref) return null;
  if (ref.room) {
    const r = floor.rooms.find((q) => q.id === ref.room);
    if (!r) return null;
    return { x: r.x + (ref.c.includes('e') ? r.w : 0), y: r.y + (ref.c.includes('s') ? r.h : 0) };
  }
  const it = floor.items.find((q) => q.id === ref.item);
  const r = it && floor.rooms.find((q) => q.id === it.roomId);
  if (!r) return null;
  if (ref.end) {
    const g = openingGeometry(r, it);
    return { ...g[ref.end] };
  }
  return { x: r.x + it.dx + (ref.fx || 0) * (it.w || 0), y: r.y + it.dy + (ref.fy || 0) * (it.h || 0) };
}

/** Pull every attached tape end to where its corner now is; an end whose corner has gone is let go where it was. */
export function syncMeasures(floor) {
  for (const m of floor.measures || []) {
    for (const end of ['a', 'b']) {
      const key = end === 'a' ? 'ra' : 'rb';
      if (!m[key]) continue;
      const pt = resolveRef(floor, m[key]);
      if (pt) m[end] = pt; else delete m[key];
    }
  }
}

/** Every wall of every room as a segment [x1, y1, x2, y2]. */
const wallSegments = (floor) => floor.rooms.flatMap((r) => [
  [r.x, r.y, r.x + r.w, r.y], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h], [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
]);

/** Where the ray from p along (ux, uy) crosses a segment, or null. */
function rayHit(p, ux, uy, [x1, y1, x2, y2]) {
  const sx = x2 - x1, sy = y2 - y1;
  const den = ux * sy - uy * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - p.x) * sy - (y1 - p.y) * sx) / den; // along the ray
  const s = ((x1 - p.x) * uy - (y1 - p.y) * ux) / den; // along the segment
  if (t < 0 || s < -1e-9 || s > 1 + 1e-9) return null;
  return { x: p.x + ux * t, y: p.y + uy * t };
}

/**
 * Snap a pointer position for the tape.
 *  from: the other end (null for a first point). tol: how close (cm) a corner / wall has to be to catch.
 *  free: true switches every snap off (Alt held).
 * Lines click onto 22.5° steps when within ANGLE_TOL of one, and then keep that angle even when they catch a
 * corner or wall (the end slides to where the straight line meets it). Away from a step they float freely.
 * Returns { x, y, snap: 'point' | 'wall' | 'angle' | 'angle+point' | null, angle }.
 */
export function snapTape(floor, w, from, tol, free = false) {
  const out = { x: w.x, y: w.y, snap: null, angle: null };
  if (free) return out;
  const pts = featurePoints(floor);
  const nearest = (src) => {
    let best = null;
    for (const q of pts) {
      const d = Math.hypot(q.x - src.x, q.y - src.y);
      if (d <= tol && (!best || d < best.d)) best = { q, d };
    }
    return best?.q || null;
  };
  const len = from ? Math.hypot(w.x - from.x, w.y - from.y) : 0;
  if (from && len > 0.5) {
    const ang = (Math.atan2(w.y - from.y, w.x - from.x) * 180) / Math.PI;
    const step = Math.round(ang / ANGLE_STEP) * ANGLE_STEP;
    if (Math.abs(ang - step) <= ANGLE_TOL) {
      const rad = (step * Math.PI) / 180, ux = Math.cos(rad), uy = Math.sin(rad);
      out.angle = ((step % 180) + 180) % 180;
      out.snap = 'angle';
      out.x = from.x + ux * len;
      out.y = from.y + uy * len;
      const q = nearest(w);
      if (q) { // a corner near the pointer: slide along the straight line to it
        const t = (q.x - from.x) * ux + (q.y - from.y) * uy;
        if (t > 0) { out.x = from.x + ux * t; out.y = from.y + uy * t; out.snap = 'angle+point'; return out; }
      }
      let best = null;
      for (const seg of wallSegments(floor)) { // or where the straight line meets a wall
        const hit = rayHit(from, ux, uy, seg);
        if (!hit) continue;
        const d = Math.hypot(hit.x - w.x, hit.y - w.y);
        if (d <= tol && (!best || d < best.d)) best = { hit, d };
      }
      if (best) { out.x = best.hit.x; out.y = best.hit.y; out.snap = 'angle+point'; }
      return out;
    }
  }
  const q = nearest(w);
  if (q) return { x: q.x, y: q.y, snap: 'point', angle: null };
  let best = null; // otherwise the nearest spot on a wall
  for (const [x1, y1, x2, y2] of wallSegments(floor)) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((w.x - x1) * dx + (w.y - y1) * dy) / l2));
    const px = x1 + dx * t, py = y1 + dy * t, d = Math.hypot(w.x - px, w.y - py);
    if (d <= tol * 0.7 && (!best || d < best.d)) best = { x: px, y: py, d };
  }
  return best ? { x: best.x, y: best.y, snap: 'wall', angle: null } : out;
}

/** The end of a line that starts at `a`, runs towards `toward` and is exactly `cm` long. */
export function endAtLength(a, toward, cm) {
  let dx = toward.x - a.x, dy = toward.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
  return { x: a.x + dx * cm, y: a.y + dy * cm };
}

/** Set a measure's length by moving its end b along the same direction. */
export function setLength(m, cm) {
  m.b = endAtLength(m.a, m.b, cm);
  delete m.rb; // the end has moved off whatever it was attached to
}

/** Nearest part of a measure to a point: 'a' or 'b' (an end), 'line' (the body), or null. */
export function measureHit(m, w, tolEnd, tolLine, withLine) {
  if (Math.hypot(w.x - m.a.x, w.y - m.a.y) <= tolEnd) return 'a';
  if (Math.hypot(w.x - m.b.x, w.y - m.b.y) <= tolEnd) return 'b';
  if (!withLine) return null;
  const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return null;
  const t = Math.max(0, Math.min(1, ((w.x - m.a.x) * dx + (w.y - m.a.y) * dy) / l2));
  return Math.hypot(w.x - (m.a.x + dx * t), w.y - (m.a.y + dy * t)) <= tolLine ? 'line' : null;
}

/**
 * Put a unit against the end of a measure (b). side 'inside': the unit lies back along the measure, its edge on
 * the end point. 'outside': it lies beyond the end point, its edge on it. Units only sit square on the plan, so the
 * line's main direction (across or down) decides which edge meets the end; the unit goes on the side of the line
 * facing into the room, and turns its back to the nearest wall. Returns the room it went into.
 */
export function placeAtEnd(floor, m, it, side) {
  const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const sgn = Math.sign(horiz ? dx : dy) || 1;
  const probe = { x: m.b.x + (horiz ? sgn * 5 : 0) * (side === 'inside' ? -1 : 1), y: m.b.y + (horiz ? 0 : sgn * 5) * (side === 'inside' ? -1 : 1) };
  const room = roomAt(floor.rooms, probe.x, probe.y) || roomAt(floor.rooms, m.b.x, m.b.y) || nearestRoom(floor.rooms, m.b.x, m.b.y)?.room || floor.rooms[0];
  if (!room) return null;
  it.roomId = room.id;
  const put = () => {
    const along = horiz ? it.w : it.h;
    const lo = (side === 'inside') === (sgn > 0) ? (horiz ? m.b.x : m.b.y) - along : (horiz ? m.b.x : m.b.y);
    const lineAt = horiz ? m.b.y : m.b.x;
    const centre = horiz ? room.y + room.h / 2 : room.x + room.w / 2;
    const across = horiz ? it.h : it.w;
    const cross = centre >= lineAt ? lineAt : lineAt - across; // on the room's side of the line
    it.dx = (horiz ? lo : cross) - room.x;
    it.dy = (horiz ? cross : lo) - room.y;
  };
  put();
  autoRotate(room, it); // turns its back to the wall, which can swap its width and depth
  put();
  clampItem(room, it);
  return room;
}

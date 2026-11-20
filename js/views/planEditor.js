// Designer › floor plan editor. Rooms are boxes: drag to move (they snap together),
// drag a corner to resize, or type exact sizes. Tap a wall to add a door or window; tap
// inside a room to add the fuse board, water main, meters, units, sink, bath and so on.
// Measurements and areas show automatically. One finger drags, two fingers zoom.
import { scheduleSave } from '../db.js';
import { h, toast, choose, confirmDialog, selectField } from '../ui.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';
import {
  ITEMS, PALETTE, ROOM_NAMES, FLOOR_NAMES, newPlanRoom, newFloor, newPlanItem, roomFigures, floorArea, planArea,
  metres, sqm, openingGeometry, nearestWall, wallSnap, wallLine, roomAt, bounds, settleItem, legend, cornerPoints, snapToUnits, isStructure,
  STYLES, PATTERNS, DOOR_OPTIONS, APPLIANCES, applyRot, rotateAbout, cabinetNumbers, cabinetText, frontEdge, cornerLabelPoint, autoRotate, clearSpot,
  blindGeometry, curvedOutline, refreshPosts, panelLines, KINDS, kindOf, sizesFor, optionDefaults, setDepth, refreshDepths, PANEL_THICKNESSES, PANEL_DEPTH,
  cabinetShapes, badgePoint, featureTags, placementDims, wallCorners, WALL_NAMES, DOOR_SIZES, WINDOW_SIZES, hingeSide, setHinge, radiatorWall, nearestRoom, clampItem, autoRadiator, snapToWallCentre, centreOpening,
} from '../plan.js';
import { iconSvg, hasIcon, captionFor, captionForKind, unitPicture } from '../catalogue.js';
import { shownLine, measureOffset, newMeasure, measureLength, measureAngle, mmText, snapTape, endAtLength, setLength, measureHit, placeAtEnd, refAt, syncMeasures, rootEnd } from '../measure.js';

const SNAP = 5; // cm
const MIN_ROOM = 50; // cm
const snap = (v) => Math.round(v / SNAP) * SNAP;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const SVG_NS = 'http://www.w3.org/2000/svg';

// mode 'dimensions': rooms, doors, windows and services. mode 'layout' (Floor plan tab): all of that
// is fixed; only the units and fittings can be placed and moved.
export default async function planEditor(root, { id, mode = 'layout' }) {
  const job = await loadJobOr404(id);
  const plan = job.plan;
  const kind = plan.kind;
  const dims = mode === 'dimensions';
  const section = dims ? 'dimensions' : 'plan';
  const editable = (type) => (dims ? isStructure(type) : !isStructure(type)); // else it is locked on this tab
  const save = () => { refreshDepths(plan); refreshPosts(floor()); scheduleSave(job); }; // units follow the thickness settings; posts fit their neighbours // corner posts always fit the cabinets beside them
  let fi = 0;
  const floor = () => plan.floors[fi];
  const roomById = (rid) => floor().rooms.find((r) => r.id === rid);
  let view = { s: 1, tx: 20, ty: 20 };
  let sel = null; // { type: 'room' | 'item', id }
  let placing = null; // item type waiting for a tap
  let fitted = false;
  // Tape measure: always on offer. mode 'drag' = click / drag from point to point; mode 'type' = click a start,
  // type the length, and that sets the end. pending = the line being made; hover = last pointer spot.
  let guide = null; // the dashed line shown while a unit is clicked onto the middle of its wall: { room, axis, at }
  const tape = { on: false, mode: 'drag', pending: null, typed: '', hover: null, snap: null, dir: null };
  const allMeasures = () => (floor().measures ||= []);
  const measures = () => allMeasures().filter((m) => (m.page || 'dimensions') === section); // each tab keeps its own tapes
  const rgroup = () => (sel?.type === 'room' ? sel.ids || [sel.id] : []); // the selected rooms (shift-click adds more)
  const igroup = () => (sel?.type === 'item' ? sel.ids || [sel.id] : []); // the selected units (shift-click adds more)
  const group = () => (sel?.type === 'measure' ? sel.ids || [sel.id] : []); // the selected tapes (shift-click adds more)
  const measureById = (mid) => measures().find((m) => m.id === mid);

  // ----- undo -----
  const history = [];
  const undoBtn = h('button', { type: 'button', class: 'btn-small', disabled: true, onclick: () => undo() }, '↶ Undo');
  const remember = (snapshot = JSON.stringify(plan.floors)) => {
    history.push(snapshot);
    if (history.length > 80) history.shift();
    undoBtn.disabled = false;
  };
  const undo = () => {
    const s = history.pop();
    undoBtn.disabled = !history.length;
    if (!s) return;
    plan.floors = JSON.parse(s);
    fi = Math.min(fi, plan.floors.length - 1);
    sel = null;
    save();
    renderAll();
  };

  // ----- canvas -----
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'plan-svg');
  const banner = h('div', { class: 'plan-banner', hidden: true });
  const canvas = h('div', { class: 'plan-canvas' }, svg, banner); // banner floats over the plan (no jump)
  const X = (x) => x * view.s + view.tx;
  const Y = (y) => y * view.s + view.ty;
  const toWorld = (p) => ({ x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s });

  const fit = () => {
    const W = canvas.clientWidth || 360, H = canvas.clientHeight || 400;
    const b = bounds(floor(), true, section);
    if (!b) {
      view = { s: W / 600, tx: W * 0.08, ty: H * 0.08 };
    } else {
      const pad = 34;
      const s = Math.max(0.05, Math.min(4, Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxY - b.minY))));
      view = { s, tx: (W - (b.maxX - b.minX) * s) / 2 - b.minX * s, ty: (H - (b.maxY - b.minY) * s) / 2 - b.minY * s };
    }
    renderCanvas();
  };

  const renderCanvas = () => {
    const W = canvas.clientWidth || 360, H = canvas.clientHeight || 400;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    const s = view.s;
    const out = [];
    // Grid: 50 cm squares (1 m lines darker); 1 m only when zoomed out.
    const step = s * 50 < 14 ? 100 : 50;
    const wx0 = Math.floor(-view.tx / s / step) * step, wx1 = (W - view.tx) / s;
    const wy0 = Math.floor(-view.ty / s / step) * step, wy1 = (H - view.ty) / s;
    for (let x = wx0; x <= wx1; x += step) out.push(`<line class="g${x % 100 === 0 ? ' gm' : ''}" x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}"/>`);
    for (let y = wy0; y <= wy1; y += step) out.push(`<line class="g${y % 100 === 0 ? ' gm' : ''}" x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}"/>`);

    const f = floor();
    syncMeasures(f); // attached tape ends follow their corners
    for (const r of f.rooms) {
      out.push(`<rect class="room${rgroup().includes(r.id) ? ' sel glow' : ''}" x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * s}" height="${r.h * s}"/>`);
    }
    const isSel = (it) => igroup().includes(it.id);
    refreshPosts(f);
    const nums = cabinetNumbers(f);
    const tags = featureTags(f);
    const badge = (cx, cy, n) => out.push(`<circle class="cab-dot" cx="${cx}" cy="${cy}" r="8"/><text class="cab-n" x="${cx}" y="${cy}">${n}</text>`);
    // fixtures, then openings, then symbols
    for (const it of f.items) {
      const r = roomById(it.roomId);
      const d = ITEMS[it.type];
      if (!r || d.kind !== 'fixture') continue;
      const x = X(r.x + it.dx), y = Y(r.y + it.dy), w = it.w * s, hh = it.h * s;
      const cls = `fx${d.dashed ? ' dashed' : ''}${d.panel ? ' panel' : ''}${isSel(it) ? ' sel glow' : ''}`; // selected units glow soft purple; end panels are solid boards
      const line = (c, a) => `<line class="${c}" x1="${x + a[0] * s}" y1="${y + a[1] * s}" x2="${x + a[2] * s}" y2="${y + a[3] * s}"/>`;
      if (it.variant === 'curved' && !d.corner) { // a curved end unit: the front corner on its handing side is rounded off
        const { poly, front, divider } = curvedOutline(it);
        const at = (pts) => pts.map(([px, py]) => `${x + px * s},${y + py * s}`).join(' ');
        out.push(`<polygon class="${cls}" points="${at(poly)}"/>`, `<polyline class="cdiv" fill="none" points="${at(divider)}"/>`, `<polyline class="front" fill="none" points="${at(front)}"/>`);
        if (d.cab) { const [bpx, bpy] = badgePoint(it); if (Math.min(w, hh) > 14) badge(x + bpx * s, y + bpy * s, nums.get(it.id)); }
        continue;
      }
      if (d.corner) {
        out.push(`<polygon class="${cls}" points="${cornerPoints(it).map(([px, py]) => `${x + px * s},${y + py * s}`).join(' ')}"/>`);
        const [lx, ly] = cornerLabelPoint(it);
        if (nums.has(it.id) && w > 30) badge(x + lx * s, y + ly * s, nums.get(it.id));
        continue;
      }
      out.push(`<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${hh}"/>`);
      const shapes = cabinetShapes(it, plan.settings);
      if (shapes.length) {
        // a bird's-eye view of the cabinet: carcass, open top with its rails, and the door in front
        for (const sh of shapes) out.push(`<rect class="cab-${sh.c}${d.dashed ? ' dashed' : ''}" x="${x + sh.x * s}" y="${y + sh.y * s}" width="${sh.w * s}" height="${sh.h * s}"/>`);
      } else if (d.facing && !d.space) {
        out.push(line('front', frontEdge(it)));
      }
      if (d.cab) {
        const [bpx, bpy] = badgePoint(it);
        if (Math.min(w, hh) > 14) badge(x + bpx * s, y + bpy * s - (d.space && hh > 40 ? 6 : 0), nums.get(it.id));
        if (d.space && w > 40 && hh > 40) out.push(`<text class="fx-t" x="${x + w / 2}" y="${y + hh / 2 + 12}" font-size="9">${esc(it.appliance || '')}</text>`);
      } else if (!d.filler && !d.panel && w > 34 && hh > 13) {
        out.push(`<text class="fx-t" x="${x + w / 2}" y="${y + hh / 2}" font-size="${Math.min(11, hh * 0.45, w / d.label.length * 1.9)}">${esc(d.label)}</text>`);
      }
    }
    if (guide && drag?.kind === 'item') { // the middle of the wall the unit has clicked onto
      const gr = guide.room;
      out.push(guide.axis === 'x'
        ? `<line class="centre-guide" x1="${X(gr.x + guide.at)}" y1="${Y(gr.y)}" x2="${X(gr.x + guide.at)}" y2="${Y(gr.y + gr.h)}"/>`
        : `<line class="centre-guide" x1="${X(gr.x)}" y1="${Y(gr.y + guide.at)}" x2="${X(gr.x + gr.w)}" y2="${Y(gr.y + guide.at)}"/>`);
    }
    for (const it of f.items) {
      const r = roomById(it.roomId);
      if (!r || ITEMS[it.type].kind !== 'wall') continue;
      const g = openingGeometry(r, it);
      const seg = `x1="${X(g.a.x)}" y1="${Y(g.a.y)}" x2="${X(g.b.x)}" y2="${Y(g.b.y)}"`;
      out.push(`<line class="gap" ${seg}/>`);
      if (it.type === 'door') {
        for (const lf of g.leaves) {
          out.push(`<line class="leaf${isSel(it) ? ' sel glow' : ''}" x1="${X(lf.hinge.x)}" y1="${Y(lf.hinge.y)}" x2="${X(lf.leaf.x)}" y2="${Y(lf.leaf.y)}"/>`);
          out.push(`<polyline class="swing${isSel(it) ? ' sel glow' : ''}" points="${lf.arc.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`);
        }
      } else {
        out.push(`<line class="win${isSel(it) ? ' sel glow' : ''}" ${seg}/>`, `<line class="win-in" ${seg}/>`);
      }
      if (dims && tags.has(it.id)) out.push(`<text class="tag" x="${X((g.a.x + g.b.x) / 2) + g.L.nx * 18}" y="${Y((g.a.y + g.b.y) / 2) + g.L.ny * 18}">${tags.get(it.id)}</text>`);
    }
    for (const it of f.items) {
      const r = roomById(it.roomId);
      const d = ITEMS[it.type];
      if (!r || d.kind !== 'point' || !dims) continue; // services only show on Room dimensions; they get in the way of the layout
      const cx = X(r.x + it.dx), cy = Y(r.y + it.dy);
      out.push(`<circle class="pt${isSel(it) ? ' sel glow' : ''}" cx="${cx}" cy="${cy}" r="13"/><text class="pt-t" x="${cx}" y="${cy}">${d.code}</text>`);
    }
    // Distances from the corners for the selected door / window / radiator.
    if (dims && sel?.type === 'item') {
      const it = f.items.find((i) => i.id === sel.id);
      const r = it && roomById(it.roomId);
      if (r && (ITEMS[it.type].kind === 'wall' || it.type === 'radiator')) {
        const off = 18;
        for (const m of placementDims(r, it)) {
          const ox = -m.nx * off, oy = -m.ny * off; // outside the wall
          const ax = X(m.x1), ay = Y(m.y1), bx = X(m.x2), by = Y(m.y2);
          out.push(`<line class="dimline" x1="${ax}" y1="${ay}" x2="${ax + ox}" y2="${ay + oy}"/><line class="dimline" x1="${bx}" y1="${by}" x2="${bx + ox}" y2="${by + oy}"/><line class="dimline" x1="${ax + ox}" y1="${ay + oy}" x2="${bx + ox}" y2="${by + oy}"/>`);
          const tx = (ax + bx) / 2 + ox * 1.55, ty = (ay + by) / 2 + oy * 1.55;
          const label = `${Math.round(m.cm * 10)} mm`;
          out.push(m.ny !== 0
            ? `<text class="dimtxt" x="${tx}" y="${ty}">${label}</text>`
            : `<text class="dimtxt" transform="translate(${tx} ${ty}) rotate(-90)">${label}</text>`);
        }
      }
    }
    // Room names, areas and measurements (on top).
    for (const r of f.rooms) {
      const x = X(r.x), y = Y(r.y), w = r.w * s, hh = r.h * s;
      if (w > 46 && hh > 34) {
        out.push(`<text class="rn" x="${x + w / 2}" y="${y + hh / 2 - 6}">${esc(r.name)}</text>`);
        out.push(`<text class="ra" x="${x + w / 2}" y="${y + hh / 2 + 9}">${sqm(roomFigures(r).floor)}</text>`);
      }
      if (w > 50) out.push(`<text class="dim" x="${x + w / 2}" y="${y + 13}">${metres(r.w)}</text>`);
      if (hh > 50) out.push(`<text class="dim" transform="translate(${x + 12} ${y + hh / 2}) rotate(-90)">${metres(r.h)}</text>`);
    }
    // Tape measures: yellow tape with the length in the middle; the selected one shows its end handles.
    const tapeLabel = (a, b, text, cls) => {
      const mx = X((a.x + b.x) / 2), my = Y((a.y + b.y) / 2);
      let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      const wd = text.length * 6.6 + 12;
      return `<g transform="translate(${mx} ${my}) rotate(${ang})"><rect class="tape-lbl ${cls}" x="${-wd / 2}" y="-9" width="${wd}" height="18" rx="9"/><text class="tape-t" x="0" y="0">${esc(text)}</text></g>`;
    };
    for (const m of measures()) {
      const on = group().includes(m.id);
      const ax = X(m.a.x), ay = Y(m.a.y), bx = X(m.b.x), by = Y(m.b.y);
      const sh = shownLine(m); // the dimension line as drawn, pulled off its reference points by m.off
      const sax = X(sh.a.x), say = Y(sh.a.y), sbx = X(sh.b.x), sby = Y(sh.b.y);
      if (Math.abs(sh.o) * s > 3) { // thin dotted extension lines from the references out to the dimension line
        const ex = sh.n.x * Math.sign(sh.o) * 5, ey = sh.n.y * Math.sign(sh.o) * 5; // run a little past it
        out.push(`<line class="tape-ext" x1="${ax}" y1="${ay}" x2="${sax + ex}" y2="${say + ey}"/><line class="tape-ext" x1="${bx}" y1="${by}" x2="${sbx + ex}" y2="${sby + ey}"/>`);
      }
      out.push(`<line class="tape-l${on ? ' sel glow' : ''}" x1="${sax}" y1="${say}" x2="${sbx}" y2="${sby}"/>`);
      if (Math.abs(sh.o) * s > 3) out.push(`<circle class="tape-tick" cx="${sax}" cy="${say}" r="2.5"/><circle class="tape-tick" cx="${sbx}" cy="${sby}" r="2.5"/>`);
      out.push(`<circle class="tape-e${on ? ' sel glow' : ''}${m.ra ? ' att' : ''}" cx="${ax}" cy="${ay}" r="${on ? 6 : 4}"/><circle class="tape-e${on ? ' sel glow' : ''}${m.rb ? ' att' : ''}" cx="${bx}" cy="${by}" r="${on ? 6 : 4}"/>`);
      out.push(tapeLabel(sh.a, sh.b, mmText(measureLength(m)), on ? 'sel glow' : ''));
    }
    if (tape.pending) {
      const { a, b } = tape.pending;
      const len = measureLength(tape.pending);
      if (tape.snap?.angle != null) { // faint guide along the straight line, so you can see it has clicked on
        const ux = (b.x - a.x) / (len || 1), uy = (b.y - a.y) / (len || 1), far = 4000 / view.s;
        out.push(`<line class="tape-guide" x1="${X(a.x - ux * far)}" y1="${Y(a.y - uy * far)}" x2="${X(a.x + ux * far)}" y2="${Y(a.y + uy * far)}"/>`);
      }
      out.push(`<line class="tape-l pend" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"/><circle class="tape-e" cx="${X(a.x)}" cy="${Y(a.y)}" r="5"/>`);
      if (tape.snap?.snap) out.push(`<circle class="tape-snap" cx="${X(b.x)}" cy="${Y(b.y)}" r="9"/>`);
      if (len > 0.5) out.push(tapeLabel(a, b, `${mmText(len)}${tape.snap?.angle != null ? ` · ${tape.snap.angle}°` : ''}`, 'pend'));
    } else if (tape.hover?.snap) {
      out.push(`<circle class="tape-snap" cx="${X(tape.hover.x)}" cy="${Y(tape.hover.y)}" r="9"/>`);
    }
    if (drag?.kind === 'marquee' && drag.moved) { // the selection box: solid when it will take only what is inside, dashed when it takes anything it touches
      const q = drag.p0, r2 = drag.p1;
      out.push(`<rect class="marq ${r2.y < q.y ? 'cross' : 'win'}" x="${Math.min(q.x, r2.x)}" y="${Math.min(q.y, r2.y)}" width="${Math.abs(r2.x - q.x)}" height="${Math.abs(r2.y - q.y)}"/>`);
    }
    // Corner handles (drag both ways) and edge-middle handles (one way only) on the selected room.
    if (sel?.type === 'room' && rgroup().length <= 1) {
      const r = roomById(sel.id);
      if (r) for (const [cx, cy, id] of handles(r)) out.push(id.length === 2 ? `<circle class="handle" cx="${X(cx)}" cy="${Y(cy)}" r="9"/>` : `<rect class="handle mid" x="${X(cx) - 6}" y="${Y(cy) - 6}" width="12" height="12" rx="3"/>`);
    }
    if (!f.rooms.length) out.push(`<text class="empty-t" x="${W / 2}" y="${H / 2}">${dims ? 'Tap “+ Room” to start' : 'Add the rooms in Room dimensions first'}</text>`);
    svg.innerHTML = out.join('');
  };
  const corners = (r) => [[r.x, r.y, 'nw'], [r.x + r.w, r.y, 'ne'], [r.x, r.y + r.h, 'sw'], [r.x + r.w, r.y + r.h, 'se']];
  // Corners, plus the middle of each edge (n, e, s, w) when the room is big enough on screen not to crowd them.
  const handles = (r) => [
    ...corners(r),
    ...(r.w * view.s > 70 ? [[r.x + r.w / 2, r.y, 'n'], [r.x + r.w / 2, r.y + r.h, 's']] : []),
    ...(r.h * view.s > 70 ? [[r.x, r.y + r.h / 2, 'w'], [r.x + r.w, r.y + r.h / 2, 'e']] : []),
  ];

  // ----- hit testing (screen point -> what's there) -----
  const hitTest = (p) => {
    const w = toWorld(p);
    const tol = 14 / view.s;
    const f = floor();
    if (sel?.type === 'room' && rgroup().length <= 1) {
      const r = roomById(sel.id);
      const c = r && handles(r).find(([cx, cy]) => Math.hypot(w.x - cx, w.y - cy) < 20 / view.s); // corners come first, so they win at a tie
      if (c) return { kind: 'handle', room: r, corner: c[2] };
    }
    for (const it of [...f.items].reverse()) {
      const r = roomById(it.roomId);
      if (!r || !editable(it.type)) continue;
      const d = ITEMS[it.type];
      if (d.kind === 'point' && Math.hypot(w.x - (r.x + it.dx), w.y - (r.y + it.dy)) < 17 / view.s) return { kind: 'item', item: it };
      if (d.kind === 'wall') {
        const g = openingGeometry(r, it);
        const mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2;
        if (Math.abs(w.x - mx) <= (g.L.nx ? tol : g.size / 2 + tol) && Math.abs(w.y - my) <= (g.L.ny ? tol : g.size / 2 + tol)) return { kind: 'item', item: it };
        if (it.type === 'door') { // anywhere on the door: its leaf and the whole swing
          const sx = g.L.nx * (it.out ? -1 : 1), sy = g.L.ny * (it.out ? -1 : 1);
          for (const lf of g.leaves) {
            const end = lf.arc[lf.arc.length - 1];
            const len = Math.hypot(lf.leaf.x - lf.hinge.x, lf.leaf.y - lf.hinge.y);
            const vx = w.x - lf.hinge.x, vy = w.y - lf.hinge.y;
            const cx = (end.x - lf.hinge.x) / len, cy = (end.y - lf.hinge.y) / len;
            if (Math.hypot(vx, vy) <= len + tol && vx * sx + vy * sy >= -tol && vx * cx + vy * cy >= -tol) return { kind: 'item', item: it };
          }
        }
      }
    }
    for (const it of [...f.items].reverse()) {
      const r = roomById(it.roomId);
      if (r && editable(it.type) && ITEMS[it.type].kind === 'fixture' && w.x >= r.x + it.dx && w.x <= r.x + it.dx + it.w && w.y >= r.y + it.dy && w.y <= r.y + it.dy + it.h) return { kind: 'item', item: it };
    }
    const r = dims && roomAt(f.rooms, w.x, w.y);
    return r ? { kind: 'room', room: r } : null;
  };

  // ----- edit a door, window or radiator: right-click, or hold for a second -----
  const editFeature = async (it) => {
    const d = ITEMS[it.type];
    const tag = featureTags(floor()).get(it.id) || '';
    let touched = false;
    const touch = () => { if (!touched) { touched = true; remember(); } };
    const mm = (cm) => String(Math.round(cm * 10));
    const body = h('div', { class: 'feature-form' });
    const inputs = []; // the two corner distances move together, so keep their boxes in step
    const live = () => {
      save();
      renderCanvas();
      for (const [input, get] of inputs) if (document.activeElement !== input) input.value = mm(get());
    };
    const mmField = (label, get, set, min = 0) => {
      const input = h('input', { type: 'text', inputmode: 'decimal', value: mm(get()), 'aria-label': label, oninput: (e) => {
        const n = num(e.target.value);
        if (!Number.isFinite(n) || n < min) return;
        touch();
        set(n / 10);
        live();
      } });
      inputs.push([input, get]);
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
    };
    const buildBody = () => {
      inputs.length = 0;
      const r = roomById(it.roomId);
      const parts = [];
      if (d.kind === 'wall') {
        const geo = () => openingGeometry(r, it);
        const clampAt = (v) => Math.max(0, Math.min(v, geo().L.len - geo().size));
        if (it.type === 'door') {
          parts.push(selectField('Door', String(it.leaves || 1), [['1', 'Single door'], ['2', 'Double doors']], (v) => {
            touch();
            it.leaves = Number(v);
            if (it.leaves === 2 && it.size < 100) it.size = 150;
            if (it.leaves === 1 && it.size > 110) it.size = 76;
            live();
            buildBody();
          }, { placeholder: null }));
        }
        const sizes = it.type === 'door' ? DOOR_SIZES[it.leaves || 1] : WINDOW_SIZES;
        parts.push(selectField('Standard widths', '', sizes.map((n) => [String(n), `${mm(n)} mm`]), (v) => {
          if (!v) return;
          touch();
          it.size = Number(v);
          live();
          buildBody();
        }, { placeholder: '– choose –' }));
        parts.push(mmField('Width (mm)', () => it.size, (v) => { it.size = v; }, 10));
        if (it.type === 'door' && (it.leaves || 1) === 1) {
          parts.push(selectField('Hinged on (seen from inside the room)', hingeSide(it), [['left', 'Left'], ['right', 'Right']], (v) => { touch(); setHinge(it, v); live(); }, { placeholder: null }));
        }
        if (it.type === 'door') {
          parts.push(selectField('Opens', it.out ? 'out' : 'in', [['in', 'Into the room'], ['out', 'Out of the room']], (v) => { touch(); it.out = v === 'out'; live(); }, { placeholder: null }));
        }
        if (it.type === 'window') {
          parts.push(
            mmField('Height from floor to sill (mm)', () => it.sill ?? 90, (v) => { it.sill = v; }),
            mmField('Window height (mm)', () => it.wh ?? 120, (v) => { it.wh = v; }, 10));
        }
        parts.push(selectField('Wall', it.wall, Object.entries(WALL_NAMES).map(([k, n]) => [k, `${n[0].toUpperCase()}${n.slice(1)} wall`]), (v) => { touch(); const hs = it.type === 'door' && (it.leaves || 1) === 1 ? hingeSide(it) : null; it.wall = v; if (hs) setHinge(it, hs); it.at = clampAt(it.at); live(); buildBody(); }, { placeholder: null }));
        const [ca, cb] = wallCorners[it.wall];
        parts.push(
          mmField(`Distance from ${ca} corner (mm)`, () => geo().at, (v) => { it.at = clampAt(v); }),
          mmField(`Distance from ${cb} corner (mm)`, () => geo().L.len - geo().at - geo().size, (v) => { it.at = clampAt(geo().L.len - geo().size - v); }));
      } else {
        // radiator
        const rw = () => radiatorWall(r, it);
        const horizontal = () => rw().wall === 'n' || rw().wall === 's';
        parts.push(
          mmField('Length (mm)', () => Math.max(it.w, it.h), (v) => { if (it.w >= it.h) it.w = v; else it.h = v; clampItem(r, it); }, 10),
          mmField('Depth (mm)', () => Math.min(it.w, it.h), (v) => { if (it.w >= it.h) it.h = v; else it.w = v; clampItem(r, it); }, 5));
        const [ca, cb] = wallCorners[rw().wall];
        parts.push(
          mmField(`Distance from ${ca} corner (mm)`, () => rw().a, (v) => { if (horizontal()) it.dx = v; else it.dy = v; clampItem(r, it); }),
          mmField(`Distance from ${cb} corner (mm)`, () => rw().b, (v) => { if (horizontal()) it.dx = r.w - it.w - v; else it.dy = r.h - it.h - v; clampItem(r, it); }));
        parts.push(h('button', { type: 'button', class: 'btn-small', onclick: () => { touch(); [it.w, it.h] = [it.h, it.w]; it.manual = true; clampItem(r, it); live(); buildBody(); } }, '⟳ Turn it round')); // turned by hand: it stops turning itself
      }
      body.replaceChildren(...parts);
    };
    buildBody();
    sel = { type: 'item', id: it.id };
    renderCanvas();
    const v = await choose({
      title: `${tag} ${d.label}`.trim(),
      content: body,
      buttons: [{ label: 'Done', value: 'done', class: 'btn-primary btn-big' }, { label: 'Delete', value: 'delete', class: 'btn-danger' }],
    });
    if (v === 'delete') {
      touch();
      floor().items.splice(floor().items.indexOf(it), 1);
      sel = null;
    }
    save();
    renderAll();
  };

  // ----- placing new items -----
  const place = (type, w) => {
    const d = ITEMS[type];
    const f = floor();
    if (d.kind === 'wall') {
      const hit = wallSnap(f.rooms, w.x, w.y, 45 / view.s);
      if (!hit) return toast(`Tap on a wall to place the ${d.label.toLowerCase()}`);
      remember();
      const at0 = Math.max(0, snap(hit.at - d.size / 2));
      const it = newPlanItem(type, { roomId: hit.room.id, wall: hit.wall, at: centreOpening(wallLine(hit.room, hit.wall).len, d.size, at0) ?? at0, ...(type === 'door' && hit.out ? { out: true } : {}) });
      f.items.push(it);
      sel = { type: 'item', id: it.id };
      save();
      renderAll();
      revealPanel(); // its dropdowns (single / double, size, hinge, opens) appear straight away
      return;
    } else {
      let r = roomAt(f.rooms, w.x, w.y);
      if (!r && d.outside) { // gas and electric meters are often on the outside of the house
        const n = nearestRoom(f.rooms, w.x, w.y);
        if (n && n.dist <= 400) r = n.room;
      }
      if (!r) return toast(`Tap inside a room to place the ${d.label.toLowerCase()}`);
      remember();
      const it = newPlanItem(type, { roomId: r.id });
      it.dx = snap(w.x - r.x - (it.w || 0) / 2);
      it.dy = snap(w.y - r.y - (it.h || 0) / 2);
      autoRotate(r, it);
      autoRadiator(r, it);
      settleItem(r, it);
      snapToUnits(r, f.items, it);
      f.items.push(it);
      sel = { type: 'item', id: it.id };
    }
    save();
    renderAll();
  };

  // ----- dragging, panning, pinch-zoom -----
  const pointers = new Map();
  let drag = null;
  let pressTimer = null;
  let revealPanel = () => {}; // shows the side panel (set up with the layout below)
  let lastTap = null; // the previous tap on a door / window / radiator, for double-click
  const pt = (e) => { const b = svg.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

  // ----- tape measure -----
  const typedCm = () => { const n = num(tape.typed); return n > 0 ? n / 10 : NaN; };
  /** Aim the line being made at the pointer (snapped); in "type" mode a typed length fixes how long it is. */
  const tapeAim = (p, e) => {
    const from = tape.pending.a;
    const s = snapTape(floor(), toWorld(p), from, 10 / view.s, e.altKey);
    tape.snap = s;
    tape.dir = { x: s.x, y: s.y };
    const len = typedCm();
    tape.pending.b = tape.mode === 'type' && len > 0 ? endAtLength(from, s, len) : { x: s.x, y: s.y };
  };
  /** Carry on from the end of a tape: a new one starts exactly there, joined to it (it follows that end if it moves). */
  const startChain = (m, end) => {
    const from = { x: m[end].x, y: m[end].y };
    tape.pending = { a: from, b: { ...from }, ra: { tape: m.id, end } };
    tape.snap = null;
    tape.typed = '';
    tape.hover = null;
    renderBanner();
    renderCanvas();
  };
  const cancelTape = () => { tape.pending = null; tape.typed = ''; tape.snap = null; tape.hover = null; renderBanner(); renderCanvas(); };
  const commitTape = () => {
    const m = tape.pending;
    tape.pending = null;
    tape.typed = '';
    tape.snap = null;
    if (m && measureLength(m) >= 1) {
      remember();
      const made = newMeasure(m.a, m.b, m.ra || refAt(floor(), m.a), refAt(floor(), m.b)); // an end that lands on a corner stays attached to it
      made.page = section;
      allMeasures().push(made);
      sel = { type: 'measure', id: made.id };
      save();
    }
    renderBanner();
    renderPanel();
    renderCanvas();
  };
  /** An item's outline on the plan (cm): units by their box, services by a small square, doors and windows by their opening. */
  const itemBox = (it, r) => {
    const d = ITEMS[it.type];
    if (d.kind === 'wall') {
      const g = openingGeometry(r, it);
      return { x0: Math.min(g.a.x, g.b.x) - 4, y0: Math.min(g.a.y, g.b.y) - 4, x1: Math.max(g.a.x, g.b.x) + 4, y1: Math.max(g.a.y, g.b.y) + 4 };
    }
    const x = r.x + it.dx, y = r.y + it.dy;
    return d.kind === 'point' ? { x0: x - 10, y0: y - 10, x1: x + 10, y1: y + 10 } : { x0: x, y0: y, x1: x + it.w, y1: y + it.h };
  };
  /** The tape end or body under the pointer (ends always; the body and the length label too). */
  const measureAt = (p, shift = false) => {
    const w = toWorld(p);
    for (const m of [...measures()].reverse()) {
      if (tape.on && !shift && !group().includes(m.id)) continue; // with the tape out, only the selected one can be picked up, so a new one can start on an old one's corner
      const part = measureHit(m, w, 14 / view.s, 8 / view.s, tape.on || shift);
      if (part === 'a' || part === 'b') { const r = rootEnd(floor(), m, part); return { m: r.m, part: r.end }; } // a joint belongs to the tape that owns it
      if (part) return { m, part };
      const sh = shownLine(m);
      const mid = { x: (sh.a.x + sh.b.x) / 2, y: (sh.a.y + sh.b.y) / 2 };
      if (Math.hypot(w.x - mid.x, w.y - mid.y) <= 16 / view.s) return { m, part: 'line' };
    }
    return null;
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 2 && e.shiftKey)) { // the mouse wheel held down, or Shift + the right button, moves the view
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, pt(e));
      if (pointers.size === 1) drag = { kind: 'pan', p0: pt(e), v0: { ...view }, button: e.button };
      return;
    }
    if (e.button === 2 && tape.on) { // right button puts the tape away (and drops a line half made)
      drag = null;
      setTape(false);
      return;
    }
    if (e.button === 2 && sel && !tape.on) { // right button lets go of whatever is selected (units, rooms, tapes); on the Room dimensions tab a door, window or radiator still opens for editing
      const hit0 = hitTest(pt(e));
      const edits = dims && hit0?.kind === 'item' && (ITEMS[hit0.item.type].kind === 'wall' || hit0.item.type === 'radiator');
      if (!edits) { sel = null; renderCanvas(); renderPanel(); return; }
    }
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pt(e));
    if (pointers.size === 2) {
      finishDrag();
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...view } };
      return;
    }
    if (pointers.size > 2) return;
    const p = pt(e);
    const w = toWorld(p);
    if (placing) {
      const type = placing;
      placing = null;
      renderToolbar();
      place(type, w);
      return;
    }
    const snapshot = JSON.stringify(plan.floors);
    if (tape.pending) { // the second click of a click-click measure
      tapeAim(p, e);
      commitTape();
      return;
    }
    const mh = measureAt(p, e.shiftKey);
    if (mh) {
      if (e.shiftKey) { // Shift-click adds a tape to the group, or takes it out
        const ids = new Set(group());
        if (ids.has(mh.m.id)) ids.delete(mh.m.id); else ids.add(mh.m.id);
        const list = [...ids];
        sel = list.length ? { type: 'measure', id: ids.has(mh.m.id) ? mh.m.id : list[list.length - 1], ids: list } : null;
        renderCanvas();
        renderPanel();
        return;
      }
      if (mh.part === 'line') { // pull the line sideways; if it is one of a group, the whole group is pulled
        if (!group().includes(mh.m.id)) sel = { type: 'measure', id: mh.m.id, ids: [mh.m.id] };
        const items = measures().filter((q) => group().includes(q.id)).map((q) => ({ m: q, off0: measureOffset(q), n: shownLine(q).n }));
        drag = { kind: 'moff', items, w0: w, p0: p, snapshot };
      } else { // an end re-measures that tape (with the tape out, a plain click on it carries on from it)
        sel = { type: 'measure', id: mh.m.id, ids: [mh.m.id] };
        drag = { kind: 'mend', m: mh.m, end: mh.part, p0: p, snapshot, chain: tape.on };
      }
      renderCanvas();
      renderPanel();
      return;
    }
    if (tape.on) {
      const s = snapTape(floor(), w, null, 10 / view.s, e.altKey);
      tape.pending = { a: { x: s.x, y: s.y }, b: { x: s.x, y: s.y } };
      tape.snap = null;
      tape.typed = '';
      sel = null;
      drag = { kind: 'tape', p0: p, moved: false };
      renderBanner();
      renderPanel();
      renderCanvas();
      return;
    }
    const hit = hitTest(p);
    if (hit?.kind === 'handle') {
      const start = floor().items.filter((it) => it.roomId === hit.room.id).map((it) => ({ it, dx: it.dx, dy: it.dy, at: it.at }));
      drag = { kind: 'resize', room: hit.room, corner: hit.corner, o: { ...hit.room }, start, w0: w, p0: p, snapshot };
    } else if (hit?.kind === 'item') {
      if (e.shiftKey) { // Shift-click adds an item (unit, door, window, service, radiator) to the selection, or takes it out
        const ids = new Set(igroup().filter((i) => floor().items.some((x) => x.id === i)));
        if (ids.has(hit.item.id)) ids.delete(hit.item.id); else ids.add(hit.item.id);
        const list = [...ids];
        sel = list.length ? { type: 'item', id: ids.has(hit.item.id) ? hit.item.id : list[list.length - 1], ids: list } : null;
        renderCanvas();
        renderPanel();
        return;
      }
      if (igroup().length > 1 && igroup().includes(hit.item.id)) { // pull the whole selection along together
        const items = floor().items.filter((q) => igroup().includes(q.id)).map((q) => ({ it: q, dx0: q.dx, dy0: q.dy, at0: q.at, room: roomById(q.roomId) })).filter((q) => q.room);
        drag = { kind: 'igroup', items, w0: w, p0: p, snapshot };
        drag.button = e.button;
        renderCanvas();
        return;
      }
      sel = { type: 'item', id: hit.item.id, ids: [hit.item.id] }; // a single click selects just this one
      if (ITEMS[hit.item.type].kind === 'wall') setTimeout(revealPanel, 0); // after the panel redraws
      const r = roomById(hit.item.roomId);
      drag = { kind: 'item', item: hit.item, o: { ...hit.item, ax: r.x + (hit.item.dx || 0), ay: r.y + (hit.item.dy || 0) }, w0: w, p0: p, snapshot };
    } else if (hit?.kind === 'room') {
      if (e.shiftKey) { // Shift-click adds a room to the selection, or takes it out
        const ids = new Set(rgroup().filter((i) => roomById(i)));
        if (ids.has(hit.room.id)) ids.delete(hit.room.id); else ids.add(hit.room.id);
        const list = [...ids];
        sel = list.length ? { type: 'room', id: ids.has(hit.room.id) ? hit.room.id : list[list.length - 1], ids: list } : null;
        renderCanvas();
        renderPanel();
        return;
      }
      if (rgroup().length > 1 && rgroup().includes(hit.room.id)) { // move all the selected rooms together
        drag = { kind: 'rgroup', room: hit.room, rooms: floor().rooms.filter((q) => rgroup().includes(q.id)).map((q) => ({ r: q, x0: q.x, y0: q.y })), w0: w, p0: p, snapshot };
      } else {
        sel = { type: 'room', id: hit.room.id, ids: [hit.room.id] };
        drag = { kind: 'room', room: hit.room, o: { x: hit.room.x, y: hit.room.y }, w0: w, p0: p, snapshot };
      }
    } else if (e.pointerType === 'touch') {
      sel = null;
      drag = { kind: 'pan', p0: p, v0: { ...view } }; // a finger still drags the view (there is no wheel button on a phone)
    } else { // mouse or pen: drag a box round the units to select
      if (!e.shiftKey) sel = null;
      drag = { kind: 'marquee', p0: p, p1: p, shift: e.shiftKey, w0: w };
    }
    drag.button = e.button; // 2 = right button
    clearTimeout(pressTimer);
    if (dims && drag.kind === 'item' && e.pointerType !== 'mouse') {
      // hold a finger on a door, window or radiator for a second to edit it
      pressTimer = setTimeout(() => {
        if (drag?.kind === 'item' && !drag.moved && pointers.size === 1) {
          const it = drag.item;
          drag = null;
          pointers.clear();
          editFeature(it);
        }
      }, 1000);
    }
    renderCanvas();
    renderPanel();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) { // a mouse moving over the plan with the tape out
      if (tape.on && e.pointerType === 'mouse') {
        const p = pt(e);
        if (tape.pending) tapeAim(p, e);
        else tape.hover = snapTape(floor(), toWorld(p), null, 10 / view.s, e.altKey);
        renderCanvas();
      }
      return;
    }
    pointers.set(e.pointerId, pt(e));
    if (!drag) return;
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const s = Math.max(0.05, Math.min(6, drag.v0.s * (Math.hypot(a.x - b.x, a.y - b.y) / (drag.d0 || 1))));
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const wm = { x: (drag.m0.x - drag.v0.tx) / drag.v0.s, y: (drag.m0.y - drag.v0.ty) / drag.v0.s };
      view = { s, tx: m.x - wm.x * s, ty: m.y - wm.y * s };
      return renderCanvas();
    }
    const p = pt(e);
    if (!drag.moved && Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) < 5) return;
    drag.moved = true;
    clearTimeout(pressTimer);
    if (drag.kind === 'pan') {
      view.tx = drag.v0.tx + (p.x - drag.p0.x);
      view.ty = drag.v0.ty + (p.y - drag.p0.y);
      return renderCanvas();
    }
    if (drag.kind === 'marquee') {
      drag.p1 = p;
      return renderCanvas();
    }
    if (drag.kind === 'tape') {
      tapeAim(p, e);
      return renderCanvas();
    }
    if (drag.kind === 'mend') {
      const other = drag.end === 'a' ? drag.m.b : drag.m.a;
      const sn = snapTape(floor(), toWorld(p), other, 10 / view.s, e.altKey);
      drag.m[drag.end] = { x: sn.x, y: sn.y };
      const ref = refAt(floor(), sn), key = drag.end === 'a' ? 'ra' : 'rb';
      if (ref) drag.m[key] = ref; else delete drag.m[key]; // dropped on a corner: attached; dropped in the open: free
      tape.hover = sn;
      renderPanel();
      return renderCanvas();
    }
    const w = toWorld(p);
    const dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
    if (drag.kind === 'igroup') { // everything selected moves by the same amount: units keep their arrangement inside their rooms, doors and windows slide along their own walls, services follow
      let ddx = snap(dx), ddy = snap(dy);
      const units = drag.items.filter((q) => ITEMS[q.it.type].kind === 'fixture');
      if (units.length) {
        const hiX = Math.min(...units.map((q) => q.room.w - q.it.w - q.dx0)), hiY = Math.min(...units.map((q) => q.room.h - q.it.h - q.dy0));
        const loX = Math.max(...units.map((q) => -q.dx0)), loY = Math.max(...units.map((q) => -q.dy0));
        ddx = Math.max(Math.min(ddx, hiX), Math.min(loX, hiX));
        ddy = Math.max(Math.min(ddy, hiY), Math.min(loY, hiY));
      }
      for (const q of drag.items) {
        const kind = ITEMS[q.it.type].kind;
        if (kind === 'wall') {
          const L = wallLine(q.room, q.it.wall);
          const along = (ddx * (L.x2 - L.x1) + ddy * (L.y2 - L.y1)) / L.len;
          q.it.at = Math.max(0, Math.min(L.len - q.it.size, q.at0 + along));
        } else {
          q.it.dx = q.dx0 + ddx;
          q.it.dy = q.dy0 + ddy;
          if (kind === 'point') settleItem(q.room, q.it);
        }
      }
      return renderCanvas();
    }
    if (drag.kind === 'rgroup') { // the selected rooms move together (and snap edge to edge with rooms that are not moving)
      const ddx = snap(dx), ddy = snap(dy), r0 = drag.rooms.find((q) => q.r === drag.room);
      for (const q of drag.rooms) { q.r.x = q.x0 + ddx; q.r.y = q.y0 + ddy; }
      if (r0) {
        const bx = r0.r.x, by = r0.r.y;
        snapToRooms(r0.r, drag.rooms.map((q) => q.r));
        const cx = r0.r.x - bx, cy = r0.r.y - by;
        for (const q of drag.rooms) if (q !== r0) { q.r.x += cx; q.r.y += cy; }
      }
      return renderCanvas();
    }
    if (drag.kind === 'moff') { // pull the dimension lines sideways only: each stays parallel to what it measures, so a pull across moves only the tapes that run the other way
      for (const it of drag.items) {
        let off = it.off0 + dx * it.n.x + dy * it.n.y;
        if (Math.abs(off) * view.s < 6) off = 0; // clicks back onto the line it measures
        if (off) it.m.off = Math.round(off * 10) / 10; else delete it.m.off;
      }
      renderPanel();
      return renderCanvas();
    }
    if (drag.kind === 'room') {
      const r = drag.room;
      r.x = snap(drag.o.x + dx);
      r.y = snap(drag.o.y + dy);
      snapToRooms(r);
    } else if (drag.kind === 'resize') {
      const r = drag.room, o = drag.o;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (drag.corner.includes('w')) x1 = Math.min(snap(o.x + dx), x2 - MIN_ROOM);
      if (drag.corner.includes('e')) x2 = Math.max(snap(o.x + o.w + dx), x1 + MIN_ROOM);
      if (drag.corner.includes('n')) y1 = Math.min(snap(o.y + dy), y2 - MIN_ROOM);
      if (drag.corner.includes('s')) y2 = Math.max(snap(o.y + o.h + dy), y1 + MIN_ROOM);
      // Keep fittings where they are on the plan while the room's corner moves. Always work
      // from where they were when the drag began, so dragging out and back puts them home.
      Object.assign(r, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      for (const s0 of drag.start) {
        const it = s0.it;
        if (ITEMS[it.type].kind === 'wall') {
          it.at = Math.max(0, s0.at + (it.wall === 'n' || it.wall === 's' ? o.x - x1 : o.y - y1));
          continue;
        }
        it.dx = s0.dx + (o.x - x1);
        it.dy = s0.dy + (o.y - y1);
        settleItem(r, it);
      }
    } else if (drag.kind === 'item') {
      drag.noCentre = e.altKey;
      moveItem(drag.item, drag.o, w, dx, dy);
    }
    renderCanvas();
  });

  /** Commit a drag in progress (undo step + save). */
  const finishDrag = () => {
    if (drag?.moved && drag.snapshot) {
      remember(drag.snapshot);
      save();
      renderPanel();
      renderSummary();
    }
    drag = null;
    guide = null;
    tape.hover = null;
    renderCanvas(); // clears the middle-of-wall guide
  };
  const endPointer = (e) => {
    clearTimeout(pressTimer);
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'marquee') { // a box drawn down: units wholly inside; drawn up: every unit it touches
      const d = drag;
      drag = null;
      if (d.moved && e.type === 'pointerup') {
        const a = toWorld(d.p0), b = toWorld(d.p1);
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        const touching = d.p1.y < d.p0.y;
        const hits = floor().items.filter((it) => {
          const r = roomById(it.roomId);
          if (!r || !editable(it.type)) return false;
          const bx = itemBox(it, r), bx0 = bx.x0, by0 = bx.y0, bx1 = bx.x1, by1 = bx.y1;
          return touching ? bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1 : bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1;
        }).map((it) => it.id);
        const ids = [...new Set([...(d.shift ? igroup() : []), ...hits])];
        sel = ids.length ? { type: 'item', id: ids[ids.length - 1], ids } : null;
      }
      renderCanvas();
      renderPanel();
      return;
    }
    if (drag.kind === 'mend' && drag.chain && !drag.moved && e.type === 'pointerup') { // clicked (not dragged) an end: carry on from it
      const d = drag;
      drag = null;
      startChain(d.m, d.end);
      return;
    }
    if (drag.kind === 'tape') { // dragged from point to point: done. Just clicked: the line follows the pointer to a second click.
      const dragged = drag.moved && tape.mode === 'drag' && e.type === 'pointerup';
      drag = null;
      if (dragged) commitTape();
      return;
    }
    if (e.type === 'pointerup' && drag.kind === 'item' && drag.button === 2 && !drag.moved && dims) {
      const it = drag.item; // a right-click on a door, window or radiator edits it
      drag = null;
      editFeature(it);
      return;
    }
    // Double-click (or double-tap) a door, window or radiator to edit or delete it. The plan is redrawn on every
    // press, so the browser never sends its own "dblclick": two quick taps in the same place are timed here.
    if (e.type === 'pointerup' && drag.kind === 'item' && drag.button === 0 && !drag.moved && dims
        && (ITEMS[drag.item.type].kind === 'wall' || drag.item.type === 'radiator')) {
      const now = Date.now();
      const again = lastTap && lastTap.id === drag.item.id && now - lastTap.t < 500 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 12;
      lastTap = again ? null : { id: drag.item.id, t: now, x: e.clientX, y: e.clientY };
      if (again) {
        const it = drag.item;
        drag = null;
        editFeature(it);
        return;
      }
    } else if (e.type === 'pointerup') lastTap = null;
    if (drag.kind === 'pinch') {
      if (pointers.size === 0) drag = null;
      else if (pointers.size === 1) drag = { kind: 'pan', p0: [...pointers.values()][0], v0: { ...view } }; // one finger left: keep panning
      return;
    }
    finishDrag();
  };
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // no autoscroll circle when panning with the wheel button
  svg.addEventListener('auxclick', (e) => e.preventDefault());
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pt(e);
    const w = toWorld(p);
    const s = Math.max(0.05, Math.min(6, view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view = { s, tx: p.x - w.x * s, ty: p.y - w.y * s };
    renderCanvas();
  }, { passive: false });

  /** Rooms snap edge-to-edge with their neighbours (within 20 cm). */
  const snapToRooms = (r, moving = [r]) => {
    const others = floor().rooms.filter((o) => !moving.includes(o));
    const near = (a, b) => Math.abs(a - b) <= 20;
    let bx = null, by = null;
    for (const o of others) {
      for (const [mine, theirs] of [[r.x, o.x + o.w], [r.x, o.x], [r.x + r.w, o.x], [r.x + r.w, o.x + o.w]]) {
        if (near(mine, theirs) && (bx == null || Math.abs(theirs - mine) < Math.abs(bx))) bx = theirs - mine;
      }
      for (const [mine, theirs] of [[r.y, o.y + o.h], [r.y, o.y], [r.y + r.h, o.y], [r.y + r.h, o.y + o.h]]) {
        if (near(mine, theirs) && (by == null || Math.abs(theirs - mine) < Math.abs(by))) by = theirs - mine;
      }
    }
    if (bx != null) r.x += bx;
    if (by != null) r.y += by;
  };

  const moveItem = (it, o, w, dx, dy) => {
    const f = floor();
    if (ITEMS[it.type].kind === 'wall') {
      const hit = wallSnap(f.rooms, w.x, w.y, 80 / view.s);
      if (!hit) return;
      const hinge = it.type === 'door' && (it.leaves || 1) === 1 ? hingeSide(it) : null;
      if (drag.grab === undefined) { // where along the door it was picked up (so it doesn't jump to centre on the pointer)
        const r0 = roomById(o.roomId), L = r0 && wallLine(r0, o.wall);
        const along = L ? ((drag.w0.x - L.x1) * (L.x2 - L.x1) + (drag.w0.y - L.y1) * (L.y2 - L.y1)) / L.len : o.at + it.size / 2;
        drag.grab = Math.max(0, Math.min(it.size, along - o.at));
      }
      Object.assign(it, { roomId: hit.room.id, wall: hit.wall, at: Math.max(0, snap(hit.at - drag.grab)) });
      guide = null;
      const mid = !drag.noCentre && centreOpening(wallLine(hit.room, hit.wall).len, it.size, it.at); // clicks onto the middle of the wall (Alt = off)
      if (mid != null && mid !== false) {
        it.at = mid;
        const across = hit.wall === 'n' || hit.wall === 's';
        guide = { room: hit.room, axis: across ? 'x' : 'y', at: (across ? hit.room.w : hit.room.h) / 2 };
      }
      if (it.type === 'door') it.out = hit.out; // dragged out of the room: it opens outwards
      if (hinge) setHinge(it, hinge); // keep the same hinge side (seen from inside) on the new wall
      return;
    }
    const cx = o.ax + (o.w || 0) / 2 + dx, cy = o.ay + (o.h || 0) / 2 + dy; // work from the centre, so turning mid-drag doesn't jump
    const r = roomAt(f.rooms, cx, cy) || (ITEMS[it.type].outside ? nearestRoom(f.rooms, cx, cy)?.room : null) || roomById(it.roomId);
    it.roomId = r.id;
    it.dx = snap(cx - r.x - (it.w || 0) / 2);
    it.dy = snap(cy - r.y - (it.h || 0) / 2);
    autoRotate(r, it); // a cabinet brought up to a wall turns its back to it
    autoRadiator(r, it); // a radiator runs along whichever wall it is taken to
    settleItem(r, it);
    const before = [it.dx, it.dy];
    snapToUnits(r, f.items, it); // closes up against the unit next to it
    guide = null;
    if (!drag?.noCentre && it.dx === before[0] && it.dy === before[1]) { // not closed up against a neighbour: click onto the middle of the wall (Alt = off)
      const g = snapToWallCentre(r, it);
      if (g) guide = { room: r, ...g };
    }
  };

  // ----- cabinets: choose the kind, then width and options, and the unit lands in the room ready to drag -----
  /** A plain tool with a width list (appliance space, fillers) behaves like a kind with nothing to choose. */
  const plainKind = (type) => ({ type, label: ITEMS[type].label, sizes: ITEMS[type].sizes });
  const kindFor = (arg) => (typeof arg === 'string' ? KINDS[arg] || plainKind(arg) : arg);
  const cabinetDialog = async (kind) => {
    const type = kind.type;
    const d = ITEMS[type];
    const opt = optionDefaults(kind); // the choices made in the dialog (height, depth, handing …)
    const props = () => ({ ...(kind.preset || {}), ...opt });
    const sizesNow = () => sizesFor(kind, props());
    let width = sizesNow().includes(d.w) ? d.w : sizesNow()[0];
    let door = null, hand = 'right';
    const doorsFor = (n) => DOOR_OPTIONS[n] || [Math.round(n / 2)];
    const doorOptions = (n) => doorsFor(n).map((m) => h('option', { value: String(m) }, `${m * 10} mm`));
    const parts = [];
    let doorField = null;
    let useOther = false;
    const pic = h('div', { class: 'unit-pic' });
    const refreshPic = () => {
      const typed = useOther ? num(customInput.value) / 10 : NaN;
      pic.innerHTML = unitPicture(type, { ...props(), width: typed > 0.5 ? typed : width, hand: kind.options?.some((o) => o.key === 'hand') ? opt.hand : hand, door, pattern: PATTERNS[0] });
    };
    const customInput = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Width in mm', oninput: () => refreshPic() });
    const customLabel = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Width (mm)'), customInput);
    customLabel.hidden = true;
    const widthOptions = () => [...sizesNow().map((n) => h('option', { value: String(n) }, `${Math.round(n * 10)} mm`)), h('option', { value: 'other' }, 'Other…')];
    const widthField = selectField('Width', String(width), [...sizesNow().map((n) => [String(n), `${Math.round(n * 10)} mm`]), ['other', 'Other…']], (v) => {
      useOther = v === 'other';
      customLabel.hidden = !useOther;
      if (useOther) {
        customInput.focus();
        refreshPic();
        return;
      }
      width = Number(v);
      if (d.blind) {
        const sel = doorField.querySelector('select');
        sel.replaceChildren(...doorOptions(width));
        door = doorsFor(width).slice(-1)[0];
        sel.value = String(door);
      }
      refreshPic();
    }, { placeholder: null });
    parts.push(widthField, customLabel);
    // a choice such as height or depth can change which widths exist (half height has no 200 mm; a deep corner unit is 731)
    const refillWidths = () => {
      const sel = widthField.querySelector('select');
      const list = sizesNow();
      if (!useOther && !list.includes(width)) width = list[0];
      sel.replaceChildren(...widthOptions());
      sel.value = useOther ? 'other' : String(width);
      refreshPic();
    };
    for (const o of kind.options || []) {
      parts.push(selectField(o.label, String(opt[o.key]), o.values.map(([v, l]) => [String(v), l]), (v) => {
        opt[o.key] = typeof o.values[0][0] === 'number' ? Number(v) : v;
        refillWidths();
      }, { placeholder: null }));
    }
    if (d.blind) {
      door = doorsFor(width).slice(-1)[0];
      doorField = selectField('Door width', String(door), doorsFor(width).map((m) => [String(m), `${m * 10} mm`]), (v) => { door = Number(v); refreshPic(); }, { placeholder: null });
      parts.push(doorField, selectField('Blind end (seen from the front)', 'right', [['right', 'Right'], ['left', 'Left']], (v) => { hand = v; refreshPic(); }, { placeholder: null }));
    }
    refreshPic();
    parts.unshift(pic);
    const card = (label, node) => h('span', { class: 'cat-card-in cat-row' }, node, h('span', { class: 'cat-name' }, label)); // a small drawing and the name; the button text stays just the name
    const choices = d.patterns ? PATTERNS.map((p) => ({ value: p, label: card(`Doors ${p}`, picNode(type, { ...props(), pattern: p, width: 60, labels: false })), name: `Doors ${p}` }))
      : d.space ? APPLIANCES.map((a) => ({ value: a, label: a }))
        : [{ value: 'add', label: 'Add' }];
    const v = await choose({
      title: kind.label,
      message: d.patterns ? 'Pick the width, then the door pattern (upper door / lower door).'
        : d.space ? 'Pick the width, then what goes in the space.'
          : d.blind ? 'Pick the width, the door width and which end is blind. The corner post sizes itself to the cabinet beside it.'
            : kind.options?.length ? 'Pick the width and the options, then Add.'
              : 'Pick the width.',
      content: h('div', null, ...parts),
      buttons: [...choices.map((c) => ({ ...c, class: c.name ? 'cat-card cat-card-row' : 'btn-primary btn-big' })), { label: 'Cancel', value: null }],
    });
    if (!v) return null;
    const typed = useOther ? num(customInput.value) / 10 : NaN; // typed in mm, kept in cm
    const finalWidth = typed > 0.5 ? Math.round(typed * 10) / 10 : width;
    return { width: finalWidth, choice: v, door: d.blind ? Math.min(door, finalWidth - 20) : door, hand, props: props() };
  };
  /** A new unit with the size and options chosen in the cabinet dialog (pick is null for plain fixtures). */
  const makeCabinet = (type, pick, roomId) => {
    const d = ITEMS[type];
    const it = newPlanItem(type, { roomId });
    if (pick) {
      it.uw = pick.width;
      if (d.corner) it.ud = pick.width;
      if (d.patterns) it.pattern = pick.choice;
      if (d.space) it.appliance = pick.choice;
      if (d.blind) { it.door = pick.door; it.hand = pick.hand; }
      Object.assign(it, pick.props || {}); // what the kind sets (style, variant, height, depth, handing)
    }
    setDepth(it, plan.settings); // carcass + gap + door front (and the end panels of an appliance space)
    applyRot(it);
    return it;
  };
  /** The End panel button: pick the thickness, and the panel lands beside the selected unit (or in the room, ready to drag). */
  const addPanel = async (type) => {
    const d = ITEMS[type];
    const f = floor();
    if (!f.rooms.length) return toast('Add the rooms on the Room dimensions tab first');
    placing = null;
    renderToolbar();
    const board = Math.round((plan.settings.board || 18));
    let thick = PANEL_THICKNESSES.includes(board) ? board : 18;
    const v = await choose({
      title: d.label,
      message: `An end panel is a loose board for the exposed end of a unit, ${PANEL_DEPTH * 10} mm deep. It is its own part and never changes the unit's size.`,
      content: h('div', null, selectField('Thickness', String(thick), PANEL_THICKNESSES.map((n) => [String(n), `${n} mm`]), (x) => { thick = Number(x); }, { placeholder: null })),
      buttons: [{ label: 'Add', value: 'add', class: 'btn-primary btn-big' }, { label: 'Cancel', value: null }],
    });
    if (v !== 'add') return;
    const centre = toWorld({ x: (canvas.clientWidth || 360) / 2, y: (canvas.clientHeight || 400) / 2 });
    const beside = igroup().length === 1 ? f.items.find((i) => i.id === igroup()[0]) : null; // one unit selected: put it against that unit
    const r = (beside && roomById(beside.roomId)) || roomAt(f.rooms, centre.x, centre.y) || f.rooms[0];
    remember();
    const it = newPlanItem(type, { roomId: r.id });
    it.uw = thick / 10;
    it.ud = PANEL_DEPTH;
    applyRot(it);
    clearSpot(r, f.items, it);
    if (beside && ITEMS[beside.type].kind === 'fixture' && !ITEMS[beside.type].panel) {
      it.rot = beside.rot || 0; // same way round as the unit, back to back with it
      applyRot(it);
      const across = (it.rot % 180 === 0);
      const free = (x, y) => f.items.every((o) => o === it || o.roomId !== r.id || ITEMS[o.type].kind !== 'fixture' || ITEMS[o.type].run !== 'base' || x >= o.dx + o.w - 0.01 || x + it.w <= o.dx + 0.01 || y >= o.dy + o.h - 0.01 || y + it.h <= o.dy + 0.01);
      const backY = (it.rot === 180 ? beside.dy + beside.h - it.h : beside.dy), backX = (it.rot === 90 ? beside.dx + beside.w - it.w : beside.dx);
      const spots = across
        ? [[beside.dx + beside.w, backY], [beside.dx - it.w, backY]]
        : [[backX, beside.dy + beside.h], [backX, beside.dy - it.h]];
      const spot = spots.find(([x, y]) => x >= 0 && y >= 0 && x + it.w <= r.w && y + it.h <= r.h && free(x, y));
      if (spot) { it.dx = spot[0]; it.dy = spot[1]; }
    } else {
      autoRotate(r, it);
    }
    settleItem(r, it);
    f.items.push(it);
    sel = { type: 'item', id: it.id, ids: [it.id] };
    save();
    renderAll();
    toast('End panel added – drag it against the end of a unit');
  };
  /** A family button (Base units, Wall units, Tall housing): pick the kind from picture cards, then size and options as usual. */
  const addFamily = async (menuType) => {
    const fam = ITEMS[menuType];
    placing = null;
    renderToolbar();
    const v = await choose({
      title: fam.label,
      message: fam.pick,
      content: null,
      buttons: [
        ...fam.variants.map((key) => {
          const k = KINDS[key];
          const pic = picNode(k.type, { ...(k.preset || {}), ...optionDefaults(k), width: k.sizes.reduce((a, b) => (Math.abs(b - 60) < Math.abs(a - 60) ? b : a)), labels: false }); // drawn at the width nearest 600 mm
          return { value: key, class: 'cat-card', label: h('span', { class: 'cat-card-in' }, pic, h('span', { class: 'cat-name' }, k.label), h('span', { class: 'cat-sub' }, captionForKind(k))) };
        }),
        { label: 'Cancel', value: null },
      ],
    });
    if (v) addCabinet(v);
  };
  const addCabinet = async (arg) => {
    const kindObj = kindFor(arg);
    const type = kindObj.type;
    const d = ITEMS[type];
    const f = floor();
    if (!f.rooms.length) return toast('Add the rooms on the Room dimensions tab first');
    const centre = toWorld({ x: (canvas.clientWidth || 360) / 2, y: (canvas.clientHeight || 400) / 2 });
    const r = roomAt(f.rooms, centre.x, centre.y) || f.rooms[0]; // the room in view
    placing = null;
    renderToolbar();
    const pick = await cabinetDialog(kindObj);
    if (!pick) return;
    remember();
    const it = makeCabinet(type, pick, r.id);
    clearSpot(r, f.items, it); // the middle of the room, or the nearest clear space
    autoRotate(r, it);
    settleItem(r, it);
    f.items.push(it);
    sel = { type: 'item', id: it.id };
    save();
    renderAll();
    const n = cabinetNumbers(f).get(it.id);
    toast(n ? `No. ${n} added – drag it into place` : `${kindObj.label} added – drag it into place`);
  };

  // ----- floors (whole property plans) -----
  const floorsBar = h('div', { class: 'chips plan-floors' });
  const renderFloors = () => {
    floorsBar.hidden = kind !== 'property';
    floorsBar.replaceChildren(...[
      ...plan.floors.map((f, i) => h('button', {
        type: 'button',
        'aria-pressed': String(i === fi),
        onclick: () => (i === fi ? (dims && floorMenu()) : (fi = i, sel = null, fitted = false, renderAll())),
      }, f.name)),
      dims ? h('button', { type: 'button', class: 'add-floor', onclick: addFloor }, '+ Floor') : null].filter(Boolean));
  };
  const addFloor = async () => {
    const used = new Set(plan.floors.map((f) => f.name));
    const name = FLOOR_NAMES.find((n) => !used.has(n)) || `Floor ${plan.floors.length + 1}`;
    remember();
    plan.floors.push(newFloor(name));
    fi = plan.floors.length - 1;
    sel = null;
    save();
    renderAll();
    toast(`${name} added – tap its name again to rename it`);
  };
  const floorMenu = async () => {
    const input = h('input', { type: 'text', value: floor().name, 'aria-label': 'Floor name' });
    const v = await choose({
      title: 'Floor',
      content: h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), input),
      buttons: [
        { label: 'Save', value: 'save', class: 'btn-primary' },
        plan.floors.length > 1 ? { label: 'Delete this floor', value: 'delete', class: 'btn-danger' } : null,
        { label: 'Cancel', value: null },
      ].filter(Boolean),
    });
    if (v === 'save' && input.value.trim()) {
      remember();
      floor().name = input.value.trim();
    } else if (v === 'delete' && await confirmDialog(`Delete “${floor().name}” and everything on it?`)) {
      remember();
      plan.floors.splice(fi, 1);
      fi = Math.max(0, fi - 1);
      sel = null;
      fitted = false;
    } else return;
    save();
    renderAll();
  };

  // ----- toolbar -----
  const toolbar = h('div', { class: 'plan-tools' });
  // The order of the tool buttons is the user's own: drag a button to a new place (mouse), or press Reorder and use the
  // arrows (touch). Saved per device, per kind of plan and tab, as a list of tool names; tools not in the list yet
  // (new ones) go after the others in their own group.
  const TOOL_ORDER_KEY = 'voids.planTools';
  const orderKey = `${kind}:${section}`;
  const savedOrder = () => { try { return JSON.parse(localStorage.getItem(TOOL_ORDER_KEY) || '{}')[orderKey] || []; } catch { return []; } };
  const storeOrder = (list) => { try { const all = JSON.parse(localStorage.getItem(TOOL_ORDER_KEY) || '{}'); all[orderKey] = list; localStorage.setItem(TOOL_ORDER_KEY, JSON.stringify(all)); } catch { /* storage blocked */ } };
  const sortBySaved = (tools) => {
    const saved = savedOrder();
    const rank = (t) => { const i = saved.indexOf(t); return i < 0 ? 1000 + tools.indexOf(t) : i; };
    return [...tools].sort((a, b) => rank(a) - rank(b));
  };
  let reordering = false; // the arrows are showing
  let suppressClick = false; // set for a moment after a drag, so letting go does not also press the button
  // Floor plan tab: cabinets and their parts first, then the appliances.
  const orderedTools = () => {
    const all = PALETTE[kind].filter(editable);
    if (dims) return sortBySaved(all);
    const isPart = (t) => ITEMS[t].cab || ITEMS[t].filler || ITEMS[t].panel || ITEMS[t].menu;
    const parts = sortBySaved(all.filter(isPart));
    const rest = sortBySaved(all.filter((t) => !isPart(t)));
    return parts.length && rest.length ? ['||', ...parts, '|', ...rest] : sortBySaved(all);
  };
  /** A drawing of a unit, to its real proportions, as an element (null for things with no drawing). */
  const picNode = (type, opts) => {
    const html = unitPicture(type, opts);
    if (!html) return null;
    const div = h('div', { class: 'unit-pic' });
    div.innerHTML = html;
    return div;
  };
  const iconEl = (t) => {
    const span = document.createElement('span');
    span.className = 'cat-ico';
    span.innerHTML = iconSvg(t);
    return span;
  };
  const toolKeys = () => orderedTools().filter((t) => t !== '||' && t !== '|');
  const groupOf = (t) => (dims ? 'all' : (ITEMS[t].cab || ITEMS[t].filler || ITEMS[t].panel || ITEMS[t].menu) ? 'parts' : 'rest'); // buttons are reordered within their own group
  const moveTool = (t, dir) => { // one place earlier (-1) or later (+1) within its group
    const keys = toolKeys();
    const g = keys.filter((k) => groupOf(k) === groupOf(t));
    const i = g.indexOf(t), j = i + dir;
    if (j < 0 || j >= g.length) return;
    [g[i], g[j]] = [g[j], g[i]];
    let n = 0;
    storeOrder(keys.map((k) => (groupOf(k) === groupOf(t) ? g[n++] : k)));
    renderToolbar();
  };
  const pressTool = (t) => {
    if (suppressClick || reordering) return;
    if (ITEMS[t].menu) return addFamily(t); // base units, wall units and tall housings each share one button: pick which kind
    if (ITEMS[t].panel) return addPanel(t); // end panels ask their thickness
    if (ITEMS[t].sizes) return addCabinet(plainKind(t)); // units ask their size first, then land in the room
    tape.on = false; // the tape and "tap to place" use the same banner
    tape.pending = null;
    placing = placing === t ? null : t;
    renderToolbar();
  };
  const toolButton = (t) => {
    const label = `${ITEMS[t].emoji} ${ITEMS[t].label}`;
    if (reordering) {
      return h('span', { class: 'plan-tool-re' },
        h('button', { type: 'button', class: 'btn-small', 'aria-label': `Move ${ITEMS[t].label} earlier`, onclick: () => moveTool(t, -1) }, '◀'),
        hasIcon(t) ? iconEl(t) : null,
        h('span', { class: 'plan-tool-name' }, ITEMS[t].label),
        h('button', { type: 'button', class: 'btn-small', 'aria-label': `Move ${ITEMS[t].label} later`, onclick: () => moveTool(t, 1) }, '▶'));
    }
    const card = hasIcon(t); // units and fittings show as little catalogue cards: a drawing, the name, the sizes
    return h('button', { type: 'button', class: `btn-small plan-tool${card ? ' cat' : ''}`, 'data-tool': t, 'data-label': ITEMS[t].label, 'data-grp': groupOf(t), title: 'Drag to put it where you want it', 'aria-pressed': String(placing === t), onclick: () => pressTool(t) },
      card ? [iconEl(t), h('span', { class: 'cat-name' }, ITEMS[t].label), h('span', { class: 'cat-sub' }, captionFor(t))] : label);
  };
  const renderToolbar = () => {
    toolbar.replaceChildren(...[
      dims ? h('button', { type: 'button', class: 'btn-primary btn-small', onclick: addRoom }, '+ Room') : null,
      ...orderedTools().map((t) => (t === '||' ? h('span', { class: 'plan-sep lead' }, 'Cabinets') : t === '|' ? h('span', { class: 'plan-sep' }, 'Appliances') : toolButton(t))),
      h('button', { type: 'button', class: 'btn-small plan-reorder', 'aria-pressed': String(reordering), title: 'Put the buttons in your own order', onclick: () => { reordering = !reordering; renderToolbar(); } }, reordering ? '✓ Done' : '↕ Reorder')].filter(Boolean));
    renderBanner();
  };
  // Mouse (or pen): press a tool button and drag it over another to swap places; the new order is kept.
  toolbar.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest?.('.plan-tool');
    if (!btn || e.button !== 0 || e.pointerType === 'touch' || reordering) return;
    const from = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const move = (ev) => {
      if (!dragging && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 6) return;
      dragging = true;
      btn.classList.add('dragging');
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.plan-tool');
      if (!under || under === btn || under.dataset.grp !== btn.dataset.grp) return;
      if (under.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) under.before(btn); else under.after(btn);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 80);
      storeOrder([...toolbar.querySelectorAll('.plan-tool')].map((b) => b.dataset.tool));
      renderToolbar();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  // ----- the banner over the plan: placing something, or the tape measure -----
  const tapeBtn = h('button', { type: 'button', class: 'btn-small tape-btn', title: 'Tape measure (M). Right-click on the plan puts it away', onclick: () => setTape(!tape.on) }, '📏 Tape');
  const setTape = (on) => {
    tape.on = on;
    tape.pending = null;
    tape.typed = '';
    tape.hover = null;
    if (on) placing = null;
    renderToolbar();
    renderCanvas();
  };
  const renderBanner = () => {
    tapeBtn.setAttribute('aria-pressed', String(tape.on));
    if (tape.on) {
      const modeBtn = (v, label) => h('button', { type: 'button', class: 'btn-small', 'aria-pressed': String(tape.mode === v), onclick: () => { tape.mode = v; tape.pending = null; tape.typed = ''; renderBanner(); renderCanvas(); } }, label);
      let msg;
      let typedBox = null;
      if (tape.mode === 'type' && tape.pending) {
        msg = 'Type the length, aim with the mouse, then press Enter or click';
        typedBox = h('input', { type: 'text', inputmode: 'decimal', class: 'tape-input', placeholder: 'mm', 'aria-label': 'Length in millimetres', value: tape.typed, oninput: (e) => {
          tape.typed = e.target.value;
          const len = typedCm();
          if (len > 0) tape.pending.b = endAtLength(tape.pending.a, tape.dir || { x: tape.pending.a.x + 1, y: tape.pending.a.y }, len);
          renderCanvas();
        }, onkeydown: (e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (typedCm() > 0) commitTape(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelTape(); }
        } });
        setTimeout(() => typedBox.focus(), 0);
      } else if (tape.pending) {
        msg = 'Move to the end point and click (Alt = no snapping)';
      } else {
        msg = tape.mode === 'type' ? 'Click where the measurement starts' : 'Click or drag from one point to another (Alt = no snapping). Click the end of a tape to carry on from it. Shift-click to select several. Right-click puts the tape away';
      }
      banner.hidden = false;
      banner.classList.add('tape-on');
      banner.replaceChildren(...[
        h('span', null, '📏 ', msg),
        typedBox,
        h('span', { class: 'tape-modes' }, modeBtn('drag', 'Measure'), modeBtn('type', 'Type length')),
        h('button', { type: 'button', class: 'btn-small', onclick: () => setTape(false) }, 'Done')].filter(Boolean));
    } else if (placing) {
      const d = ITEMS[placing];
      banner.classList.remove('tape-on');
      banner.hidden = false;
      banner.replaceChildren(
        h('span', null, d.kind === 'wall' ? `Tap a wall to place the ${d.label.toLowerCase()}` : `Tap inside the room where the ${d.label.toLowerCase()} goes`),
        h('button', { type: 'button', class: 'btn-small', onclick: () => { placing = null; renderToolbar(); } }, 'Cancel'));
    } else {
      banner.classList.remove('tape-on');
      banner.hidden = true;
    }
  };

  const addRoom = async () => {
    const used = new Set(floor().rooms.map((r) => r.name));
    const name = h('input', { type: 'text', list: 'plan-room-names', value: kind === 'property' ? (ROOM_NAMES.find((n) => !used.has(n)) || 'Room') : 'Room', autocapitalize: 'words', 'aria-label': 'Room name' });
    const wIn = h('input', { type: 'text', inputmode: 'decimal', value: '3.00', 'aria-label': 'Width in metres' });
    const lIn = h('input', { type: 'text', inputmode: 'decimal', value: '3.00', 'aria-label': 'Length in metres' });
    const v = await choose({
      title: '+ Room',
      content: h('div', null,
        h('datalist', { id: 'plan-room-names' }, ROOM_NAMES.map((n) => h('option', { value: n }))),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Room name'), name),
        h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Width (m)'), wIn),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Length (m)'), lIn)),
        h('p', { class: 'hint' }, 'Rough sizes are fine – drag or type exact measurements later.')),
      buttons: [{ label: 'Add room', value: 'add', class: 'btn-primary btn-big' }, { label: 'Cancel', value: null }],
    });
    if (v !== 'add') return;
    const w = Math.max(MIN_ROOM, Math.round((num(wIn.value) || 3) * 100));
    const l = Math.max(MIN_ROOM, Math.round((num(lIn.value) || 3) * 100));
    const b = bounds(floor());
    remember();
    const r = newPlanRoom({ name: name.value.trim() || 'Room', w, h: l, x: b ? b.maxX : 0, y: b ? b.minY : 0 });
    floor().rooms.push(r);
    sel = { type: 'room', id: r.id };
    save();
    renderAll();
    fit();
    toast('Room added – drag it into place');
  };

  // ----- panel for the selected room / item -----
  const panel = h('div', { class: 'plan-panel card card-body' });
  const field = (label, value, oninput, opts = {}) => {
    let edited = false; // the first change after tapping in is one undo step
    const input = h('input', { type: 'text', value, inputmode: opts.inputmode, list: opts.list, autocapitalize: opts.cap, 'aria-label': label, onfocus: () => { opts.onfocus?.(); edited = false; }, oninput: (e) => { if (!edited) { edited = true; remember(); } oninput(e.target.value); livePic?.(); renderCanvas(); renderSummary(); save(); } });
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
  };
  const delBtn = (label, fn) => h('button', { type: 'button', class: 'btn-danger btn-small', onclick: fn }, label);
  const deleteMeasures = (ids) => {
    if (!ids.length) return;
    remember();
    floor().measures = allMeasures().filter((m) => !ids.includes(m.id));
    sel = null;
    save();
    renderAll();
  };
  const deleteMeasure = (mid) => {
    const i = allMeasures().findIndex((m) => m.id === mid);
    if (i < 0) return;
    remember();
    allMeasures().splice(i, 1);
    sel = null;
    save();
    renderAll();
  };
  /** Put a unit against the end of a tape: inside (back along the tape) or outside (beyond the end). */
  let tapeUnit = null;
  const placeUnitAtEnd = async (m, side) => {
    const kindObj = kindFor(tapeUnit);
    const type = kindObj.type;
    const d = ITEMS[type];
    const f = floor();
    const pick = d.sizes ? await cabinetDialog(kindObj) : null;
    if (d.sizes && !pick) return;
    remember();
    const it = makeCabinet(type, pick, f.rooms[0].id);
    if (!placeAtEnd(f, m, it, side)) return;
    f.items.push(it);
    sel = { type: 'item', id: it.id };
    save();
    renderAll();
    toast(`${kindObj.label} placed ${side === 'inside' ? 'inside' : 'outside'} the end of the tape`);
  };
  const CORNER = { nw: 'north-west', ne: 'north-east', sw: 'south-west', se: 'south-east' };
  const refName = (f, ref) => {
    if (ref.tape) return 'the end of the measurement before it';
    if (ref.room) return `${f.rooms.find((r) => r.id === ref.room)?.name || 'room'} ${CORNER[ref.c]} corner`;
    const it = f.items.find((i) => i.id === ref.item);
    return it ? ITEMS[it.type].label.toLowerCase() : 'a unit';
  };
  const renderMeasurePanel = (m) => {
    const info = h('p', { class: 'plan-figures' });
    const attached = h('p', { class: 'hint' });
    const f0 = floor();
    const showInfo = () => {
      const dx = Math.abs(m.b.x - m.a.x), dy = Math.abs(m.b.y - m.a.y);
      info.textContent = `Angle ${measureAngle(m)}° · across ${mmText(dx)} · down ${mmText(dy)}`;
      attached.textContent = `Start ${m.ra ? `attached to ${refName(f0, m.ra)}` : 'free'} · End ${m.rb ? `attached to ${refName(f0, m.rb)}` : 'free'}`;
    };
    const parts = [
      h('strong', null, '📏 Tape measure'),
      field('Length (mm)', String(Math.round(measureLength(m) * 10)), (v) => { const n = num(v); if (n > 0) { setLength(m, n / 10); showInfo(); } }, { inputmode: 'decimal' }),
      info,
      field('Pulled off the line (mm; + or –)', String(Math.round(measureOffset(m) * 10)), (v) => { const n = num(v); if (Number.isFinite(n)) { if (n) m.off = n / 10; else delete m.off; } }, { inputmode: 'decimal' }),
      attached,
      h('p', { class: 'hint' }, 'Drag the line or its label sideways to pull it off the plan: it stays parallel, with thin dotted lines back to where it is measured from. An end dropped on a corner stays attached and follows it when the room or unit moves; drop it in the open to let go. Drag either end to re-measure it (it clicks onto straight and 22.5° / 45° lines; hold Alt to float freely). Typing a length moves the far end.'),
    ];
    if (!dims) {
      const types = orderedTools().filter((t) => ITEMS[t]?.kind === 'fixture' && t !== 'radiator').flatMap((t) => (ITEMS[t].menu ? ITEMS[t].variants : [t])); // the family buttons stand for their kinds (kind keys); plain tools are item types
      const nameOf = (t) => (KINDS[t] ? KINDS[t].label : ITEMS[t].label);
      const emojiOf = (t) => ITEMS[KINDS[t]?.type || t].emoji;
      if (!types.includes(tapeUnit)) tapeUnit = types[0] || null;
      if (tapeUnit) {
        parts.push(
          selectField('Unit to fit at the far end', tapeUnit, types.map((t) => [t, `${emojiOf(t)} ${nameOf(t)}`]), (v) => { tapeUnit = v; }, { placeholder: null }),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn-small btn-primary', title: 'The unit sits back along the tape, its edge on the far end', onclick: () => placeUnitAtEnd(m, 'inside') }, '◂│ Inside the end'),
            h('button', { type: 'button', class: 'btn-small btn-primary', title: 'The unit sits beyond the far end, its edge on it', onclick: () => placeUnitAtEnd(m, 'outside') }, '│▸ Outside the end')));
      }
    }
    else parts.push(h('p', { class: 'hint' }, 'Units can be fitted to the end of a tape on the Floor plan tab.'));
    parts.push(h('div', { class: 'btn-row' }, delBtn('Delete measurement', () => deleteMeasure(m.id))));
    panel.replaceChildren(...parts);
    showInfo();
  };
  let livePic = null; // redraws the selected unit's picture while a size is being typed
  const renderPanel = () => {
    const f = floor();
    livePic = null;
    if (sel?.type === 'measure') {
      const m = measureById(sel.id);
      if (!m) { sel = null; return renderPanel(); }
      const ids = group().filter((i) => measureById(i));
      if (ids.length > 1) {
        return panel.replaceChildren(
          h('strong', null, `📏 ${ids.length} measurements selected`),
          h('p', { class: 'hint' }, 'Drag any selected line sideways to pull them all together (each keeps to its own direction). Shift-click a measurement to add it or take it out; click an empty spot to let go.'),
          h('div', { class: 'btn-row' }, delBtn(`Delete ${ids.length} measurements`, () => deleteMeasures(ids))));
      }
      return renderMeasurePanel(m);
    }
    if (sel?.type === 'room' && rgroup().filter((i) => roomById(i)).length > 1) {
      const ids = rgroup().filter((i) => roomById(i));
      return panel.replaceChildren(
        h('strong', null, `${ids.length} rooms selected`),
        h('p', { class: 'hint' }, 'Drag any selected room to move them all together. Shift-click a room to add it or take it out. Right-click, or press Esc, to let go of them.'),
        h('div', { class: 'btn-row' }, delBtn(`Delete ${ids.length} rooms`, async () => {
          if (!(await confirmDialog(`Delete ${ids.length} rooms and everything in them?`))) return;
          remember();
          f.rooms = f.rooms.filter((q) => !ids.includes(q.id));
          f.items = f.items.filter((it) => !ids.includes(it.roomId));
          sel = null;
          save();
          renderAll();
        })));
    }
    if (sel?.type === 'room') {
      const r = roomById(sel.id);
      if (!r) { sel = null; return renderPanel(); }
      const figures = h('p', { class: 'plan-figures' });
      const showFigures = () => {
        const fg = roomFigures(r);
        figures.textContent = [`Floor ${sqm(fg.floor)}`, `Perimeter ${fg.perimeter.toFixed(2)} m`, fg.walls ? `Walls ${sqm(fg.walls)}` : 'Add the ceiling height for the wall area'].join(' · ');
      };
      let start = [];
      const metresField = (label, key) => field(label, (r[key] / 100).toFixed(2), (v) => {
        const n = num(v);
        if (n > 0) r[key] = Math.max(MIN_ROOM, Math.round(n * 100));
        for (const s0 of start) { s0.it.dx = s0.dx; s0.it.dy = s0.dy; settleItem(r, s0.it); } // from the original spots, so typing "2.5" via "2" doesn't drift
        showFigures();
      }, { inputmode: 'decimal', onfocus: () => { start = f.items.filter((it) => it.roomId === r.id && ITEMS[it.type].kind !== 'wall').map((it) => ({ it, dx: it.dx, dy: it.dy })); } });
      panel.replaceChildren(
        h('strong', null, 'Room'),
        h('datalist', { id: 'plan-room-names-2' }, ROOM_NAMES.map((n) => h('option', { value: n }))),
        field('Name', r.name, (v) => { r.name = v; }, { list: 'plan-room-names-2', cap: 'words' }),
        h('div', { class: 'grid-2' }, metresField('Width (m)', 'w'), metresField('Length (m)', 'h')),
        field('Ceiling height (m, optional)', r.height, (v) => { r.height = v; showFigures(); }, { inputmode: 'decimal' }),
        figures,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); [r.w, r.h] = [r.h, r.w]; for (const it of f.items) if (it.roomId === r.id && ITEMS[it.type].kind !== 'wall') settleItem(r, it); save(); renderAll(); } }, '⟳ Turn'),
          delBtn('Delete room', async () => {
            if (!(await confirmDialog(`Delete “${r.name}” and everything in it?`))) return;
            remember();
            f.rooms.splice(f.rooms.indexOf(r), 1);
            f.items = f.items.filter((it) => it.roomId !== r.id);
            sel = null;
            save();
            renderAll();
          })));
      showFigures();
      return;
    }
    if (sel?.type === 'item' && igroup().filter((i) => f.items.some((x) => x.id === i)).length > 1) {
      const ids = igroup().filter((i) => f.items.some((x) => x.id === i));
      return panel.replaceChildren(
        h('strong', null, `${ids.length} items selected`),
        h('p', { class: 'hint' }, 'Drag any selected unit to move them all together. Shift-click a unit to add it or take it out. Right-click, or press Esc, to let go of them.'),
        h('div', { class: 'btn-row' }, delBtn(`Delete ${ids.length} items`, () => { remember(); f.items = f.items.filter((x) => !ids.includes(x.id)); sel = null; save(); renderAll(); })));
    }
    if (sel?.type === 'item') {
      const it = f.items.find((i) => i.id === sel.id);
      if (!it) { sel = null; return renderPanel(); }
      const d = ITEMS[it.type];
      const removeIt = delBtn('Delete', () => { remember(); f.items.splice(f.items.indexOf(it), 1); sel = null; save(); renderAll(); });
      const parts = [h('strong', null, `${d.emoji} ${kindOf(it)?.label ?? d.label}`)];
      livePic = null;
      if (d.kind === 'fixture') { // the unit as a drawing, to its real proportions, following what you set below
        const opts = () => ({ width: it.uw ?? it.w, style: it.style, pattern: it.pattern, hand: it.hand, door: it.door, appliance: it.appliance, thickness: d.panel ? it.uw : undefined });
        const pic = picNode(it.type, opts());
        if (pic) {
          parts.push(pic);
          livePic = () => { pic.innerHTML = unitPicture(it.type, opts()); };
        }
      }
      if (d.kind === 'wall') {
        const change = (fn) => { remember(); fn(); save(); renderAll(); };
        if (it.type === 'door') {
          const leaves = it.leaves || 1;
          const sizes = DOOR_SIZES[leaves].includes(it.size) ? DOOR_SIZES[leaves] : [...DOOR_SIZES[leaves], it.size].sort((x, y) => x - y);
          parts.push(
            selectField('Door', String(leaves), [['1', 'Single door'], ['2', 'Double doors']], (v) => change(() => {
              it.leaves = Number(v);
              if (it.leaves === 2 && it.size < 100) it.size = 150;
              if (it.leaves === 1 && it.size > 110) it.size = 76;
            }), { placeholder: null }),
            selectField('Size', String(it.size), sizes.map((n) => [String(n), `${Math.round(n * 10)} mm`]), (v) => change(() => { it.size = Number(v); }), { placeholder: null }));
          if (leaves === 1) parts.push(selectField('Hinged on (seen from inside)', hingeSide(it), [['left', 'Left'], ['right', 'Right']], (v) => change(() => setHinge(it, v)), { placeholder: null }));
          parts.push(selectField('Opens', it.out ? 'out' : 'in', [['in', 'Into the room'], ['out', 'Out of the room']], (v) => change(() => { it.out = v === 'out'; }), { placeholder: null }));
        } else {
          parts.push(field('Width (mm)', String(Math.round(it.size * 10)), (v) => { const n = num(v) / 10; if (n > 10) it.size = Math.round(n * 10) / 10; }, { inputmode: 'decimal' }));
        }
        parts.push(h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn-small btn-primary', onclick: () => editFeature(it) }, '✎ Edit details'),
          removeIt));
        parts.push(h('p', { class: 'hint' }, it.type === 'door'
          ? 'Drag it along the wall and it turns itself on each wall. Drag it out of the room and it opens outwards; back in, and it opens into the room. Double-click it (or hold for a second) for distances from the corners, or to delete it.'
          : 'Drag it along the wall, or onto another wall. Double-click it (or hold for a second) to edit sizes and distances from the corners.'));
      } else if (d.kind === 'fixture') {
        const r = roomById(it.roomId);
        if (d.facing) {
          const refit = () => { applyRot(it); settleItem(r, it); snapToUnits(r, f.items, it); save(); };
          const minCm = d.filler ? 0.5 : 5; // (cm; people type millimetres)
          const setWidth = (n) => {
            it.uw = n;
            if (d.corner) it.ud = n;
            if (d.blind) it.door = Math.min((DOOR_OPTIONS[n] || [it.door]).slice(-1)[0], n - 20);
          };
          if (d.sizes) {
            const widthNow = it.uw;
            const itKind = kindOf(it);
            const sizeList = itKind ? sizesFor(itKind, it) : d.sizes; // the widths this kind (and height / depth) comes in
            const opts = sizeList.includes(widthNow) ? sizeList : [...sizeList, widthNow].sort((x, y) => x - y);
            const custom = field(d.corner ? 'Size (mm)' : 'Width (mm)', String(Math.round(widthNow * 10)), (v) => { const n = num(v) / 10; if (n > minCm) { setWidth(Math.round(n * 10) / 10); refit(); } }, { inputmode: 'decimal' });
            custom.hidden = true;
            parts.push(selectField('Unit width', String(widthNow), [...opts.map((n) => [String(n), `${n * 10} mm`]), ['other', 'Other…']], (v) => {
              if (v === 'other') {
                custom.hidden = false;
                custom.querySelector('input').focus();
                return;
              }
              remember();
              setWidth(Number(v));
              refit();
              renderAll();
            }, { placeholder: null }), custom);
            for (const o of itKind?.options || []) { // this kind's own choices: height, depth, handing, front
              if (o.key === 'hand' && d.blind) continue;
              const cur = it[o.key] ?? o.def ?? o.values[0][0];
              const vals = o.values.some(([v]) => v === cur) ? o.values : [...o.values, [cur, String(cur)]];
              parts.push(selectField(o.label, String(cur), vals.map(([v, l]) => [String(v), l]), (v) => {
                remember();
                it[o.key] = typeof o.values[0][0] === 'number' ? Number(v) : v;
                if (o.key === 'cd') setDepth(it, plan.settings);
                const list = sizesFor(itKind, it);
                if (!list.includes(it.uw)) setWidth(list[0]); // e.g. a deep corner unit is 731, a standard one 631
                refit();
                renderAll();
              }, { placeholder: null }));
            }
            if (d.hgt && !(itKind?.options || []).some((o) => o.key === 'hgt')) {
              parts.push(field('Height (mm)', it.hgt != null ? String(Math.round(it.hgt * 10)) : '', (v) => { const n = num(v) / 10; if (n > 10) it.hgt = Math.round(n * 10) / 10; }, { inputmode: 'decimal' }));
            }
            if (!d.corner) {
              parts.push(d.fronted
                ? field('Carcass depth (mm)', String(Math.round(it.cd * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.cd = Math.round(n * 10) / 10; setDepth(it, plan.settings); refit(); } }, { inputmode: 'decimal' })
                : field('Depth (mm)', String(Math.round(it.ud * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.ud = Math.round(n * 10) / 10; refit(); } }, { inputmode: 'decimal' }));
            }
          } else if (d.panel) { // an end panel: its thickness (16 / 18 / 22 mm) and depth; it never changes the unit beside it
            const thickNow = Math.round(it.uw * 10);
            const thicks = PANEL_THICKNESSES.includes(thickNow) ? PANEL_THICKNESSES : [...PANEL_THICKNESSES, thickNow].sort((x, y) => x - y);
            parts.push(
              selectField('Thickness', String(thickNow), thicks.map((n) => [String(n), `${n} mm`]), (v) => { remember(); it.uw = Number(v) / 10; refit(); renderAll(); }, { placeholder: null }),
              field('Depth (mm)', String(Math.round(it.ud * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.ud = Math.round(n * 10) / 10; refit(); } }, { inputmode: 'decimal' }),
              h('p', { class: 'hint' }, `A loose board for the exposed end of a unit, ${Math.round(it.ud * 10)} mm deep so it lines up with the doors. Drag it against the unit's end and it closes up flush; the unit itself keeps its size.`));
          } else {
            parts.push(h('div', { class: 'grid-2' },
              field('Width (mm)', String(Math.round(it.uw * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.uw = Math.round(n * 10) / 10; refit(); } }, { inputmode: 'decimal' }),
              field('Depth (mm)', String(Math.round(it.ud * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.ud = Math.round(n * 10) / 10; refit(); } }, { inputmode: 'decimal' })));
          }
          if (d.styles) parts.push(selectField('Type', it.style || 'door', Object.entries(STYLES), (v) => { remember(); it.style = v; save(); renderAll(); }, { placeholder: null }));
          if (d.patterns) parts.push(selectField('Door pattern', it.pattern || PATTERNS[0], PATTERNS, (v) => { remember(); it.pattern = v; save(); renderAll(); }, { placeholder: null }));
          if (d.blind) {
            const doorOpts = DOOR_OPTIONS[Math.round(it.uw)] || [];
            const doors = doorOpts.includes(it.door) ? doorOpts : [...doorOpts, it.door].sort((x, y) => x - y);
            parts.push(
              selectField('Door width', String(it.door), doors.map((m) => [String(m), `${m * 10} mm`]), (v) => { remember(); it.door = Number(v); save(); renderAll(); }, { placeholder: null }),
              selectField('Blind end (seen from the front)', it.hand || 'right', [['right', 'Right'], ['left', 'Left']], (v) => { remember(); it.hand = v; it.handLock = true; save(); renderAll(); }, { placeholder: null }),
              h('p', { class: 'hint' }, `Corner post: ${Math.round((it.post ?? 7) * 10)} mm – it resizes itself to meet the cabinet beside the blind end.`));
          }
          if (d.space) parts.push(selectField('Appliance', it.appliance || APPLIANCES[0], APPLIANCES, (v) => { remember(); it.appliance = v; save(); renderAll(); }, { placeholder: null }));
          if (d.fronted) {
            parts.push(h('p', { class: 'hint' }, d.space
              ? `Clear space ${Math.round(it.uw * 10)} mm. Add end panels beside it with the End panel button.`
              : `Depth on the plan: ${Math.round(it.ud * 10)} mm = ${Math.round(it.cd * 10)} mm carcass + 2 mm gap + ${plan.settings.front} mm front.`));
          }
          const n = cabinetNumbers(f).get(it.id);
          parts.push(h('p', { class: 'hint' }, `${n ? `No. ${n} on the key. ` : d.filler ? 'Listed under the key. ' : ''}It turns its back to the nearest wall by itself – use Turn for a special detail.`));
          parts.push(h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn-small', onclick: () => {
              remember();
              rotateAbout(it, ((it.rot || 0) + 90) % 360);
              it.manual = true; // you chose this way round, so it stays put
              settleItem(r, it);
              save();
              renderAll();
            } }, '⟳ Turn'),
            it.manual ? h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); it.manual = false; autoRotate(r, it); settleItem(r, it); save(); renderAll(); } }, '↺ Face the wall') : null,
            removeIt));
        } else {
          parts.push(h('div', { class: 'grid-2' },
            field('Width (mm)', String(Math.round(it.w * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.w = Math.round(n * 10) / 10; settleItem(r, it); } }, { inputmode: 'decimal' }),
            field('Depth (mm)', String(Math.round(it.h * 10)), (v) => { const n = num(v) / 10; if (n > 5) { it.h = Math.round(n * 10) / 10; settleItem(r, it); } }, { inputmode: 'decimal' })));
          parts.push(h('div', { class: 'btn-row' },
            it.type === 'radiator' ? h('button', { type: 'button', class: 'btn-small btn-primary', onclick: () => editFeature(it) }, '✎ Edit details') : null,
            h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); [it.w, it.h] = [it.h, it.w]; if (it.type === 'radiator') it.manual = true; settleItem(r, it); save(); renderAll(); } }, '⟳ Turn'),
            it.type === 'radiator' && it.manual ? h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); it.manual = false; autoRadiator(r, it); settleItem(r, it); save(); renderAll(); } }, '↺ Run along the wall') : null,
            removeIt));
        }
      } else {
        parts.push(h('p', { class: 'hint' }, `Shown as “${d.code}” on the plan. Drag it to where it is.`), h('div', { class: 'btn-row' }, removeIt));
      }
      panel.replaceChildren(...parts);
      return;
    }
    const toDimensions = h('button', { type: 'button', class: 'btn-small', onclick: () => go(`/job/${job.id}/dimensions`) }, '← Room dimensions');
    panel.replaceChildren(...(dims ? [
      h('p', { class: 'hint plan-help' }, f.rooms.length
        ? 'Tap a room to size or rename it – drag it to move (rooms snap together), drag a corner (or the small square on an edge) to resize. Pick a button above, then tap the plan to add doors, windows and services. When it is right, go on to the Floor plan tab.'
        : 'Start with “+ Room”. Add each room with rough sizes, then drag them together like a jigsaw.'),
    ] : [
      h('p', { class: 'hint plan-help' }, f.rooms.length
        ? '🔒 Rooms, doors, windows and services are fixed here. Pick a button above, then tap inside a room to place it; drag to move, tap to size or turn.'
        : 'There are no rooms yet. Add them on the Room dimensions tab first.'),
      toDimensions,
    ]));
  };

  // ----- totals and key -----
  const summary = h('div', { class: 'plan-summary' });
  const renderSummary = () => {
    const key = dims ? legend([floor()]) : []; // services are not shown over the layout
    const appliances = dims ? [] : floor().items.filter((i) => ITEMS[i.type].facing && !ITEMS[i.type].cab && !ITEMS[i.type].filler && !ITEMS[i.type].panel);
    const nums = cabinetNumbers(floor());
    const cabs = floor().items.filter((it) => nums.has(it.id));
    const extras = panelLines(floor(), plan.settings);
    summary.replaceChildren(...[
      h('span', null, kind === 'property' ? `${floor().name}: ` : 'Floor area: ', h('b', null, sqm(floorArea(floor())))),
      kind === 'property' && plan.floors.length > 1 ? h('span', null, 'Whole property: ', h('b', null, sqm(planArea(plan)))) : null,
      key.length ? h('span', { class: 'plan-key' }, key.map(([c, l]) => `${c} = ${l}`).join(' · ')) : null,
      cabs.length ? h('ol', { class: 'plan-cabs' }, cabs.map((it) => h('li', null, h('b', null, String(nums.get(it.id))), cabinetText(it)))) : null,
      extras.length ? h('ul', { class: 'plan-cabs plan-extras' }, extras.map((t) => h('li', null, t))) : null,
      appliances.length ? h('span', { class: 'plan-key' }, `Appliances: ${appliances.map((i) => ITEMS[i.type].label).join(', ')}`) : null].filter(Boolean));
  };

  // Door / drawer front and end panel / filler board thickness: 18 mm as standard, 22 mm if you prefer.
  const settingsCard = h('div', { class: 'plan-settings' });
  const renderSettings = () => {
    const st = plan.settings;
    settingsCard.hidden = dims || !PALETTE[kind].some((t) => ITEMS[t].fronted);
    const options = (v, list = [18, 22]) => [...new Set([...list, v])].sort((a, b) => a - b).map((n) => [String(n), `${n} mm`]);
    const change = (key, v) => {
      remember();
      st[key] = Number(v);
      save();
      renderAll();
    };
    settingsCard.replaceChildren(
      h('strong', null, 'Board thickness'),
      h('div', { class: 'grid-2' },
        selectField('Doors and drawer fronts', String(st.front), options(st.front), (v) => change('front', v), { placeholder: null }),
        selectField('Fillers and new end panels', String(st.board), options(st.board, PANEL_THICKNESSES), (v) => change('board', v), { placeholder: null })));
  };

  const renderAll = () => {
    renderFloors();
    renderSettings();
    renderToolbar();
    renderPanel();
    renderSummary();
    if (!fitted && canvas.clientWidth) {
      fitted = true;
      fit();
    } else {
      renderCanvas();
    }
  };

  const zoomBtns = h('div', { class: 'plan-zoom' },
    tapeBtn,
    h('button', { type: 'button', class: 'btn-small', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.25) }, '＋'),
    h('button', { type: 'button', class: 'btn-small', 'aria-label': 'Zoom out', onclick: () => zoomBy(0.8) }, '－'),
    h('button', { type: 'button', class: 'btn-small', onclick: fit }, '⤢ Fit'),
    undoBtn);
  const zoomBy = (k) => {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const c = toWorld({ x: W / 2, y: H / 2 });
    const s = Math.max(0.05, Math.min(6, view.s * k));
    view = { s, tx: W / 2 - c.x * s, ty: H / 2 - c.y * s };
    renderCanvas();
  };

  // ----- layout -----
  // Phones: one column, exactly as before. Tablets and desktops (760 px and up): the window is split into a
  // panel (tools, floors, the selected item, key, notes) and a canvas that fills the height. The panel starts
  // on the left; drag its handle across to move it, drag the edge to resize it, or hide it. Remembered per device.
  const PANEL_KEY = 'voids.planPanel';
  const prefs = (() => {
    const d = { side: 'left', width: 340, collapsed: false };
    try { return { ...d, ...JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') }; } catch { return d; }
  })();
  const savePrefs = () => { try { localStorage.setItem(PANEL_KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ } };
  const clampWidth = (w) => Math.max(260, Math.min(560, Math.round(w) || 340));
  const page = h('div', { class: 'content plan-page' });
  const applyPrefs = () => {
    prefs.width = clampWidth(prefs.width);
    page.dataset.side = prefs.side === 'right' ? 'right' : 'left';
    page.dataset.collapsed = String(Boolean(prefs.collapsed));
    page.style.setProperty('--side-w', `${prefs.width}px`);
  };
  const toolsWrap = h('div', { class: 'plan-tools-wrap' }, toolbar);
  const notes = dims ? null : h('label', { class: 'field plan-notes', style: 'margin-top:14px' }, h('span', { class: 'field-label' }, 'Notes'),
    h('textarea', { placeholder: 'Anything to note about the plan', oninput: (e) => { plan.notes = e.target.value; save(); } }, plan.notes || ''));
  const footer = completeFooter(job, section, dims ? { check: async () => plan.floors.some((f) => f.rooms.length) || confirmDialog('No rooms added yet. Mark Room dimensions complete anyway?', { title: 'No rooms yet', ok: 'Mark complete', danger: false }) } : {});

  const sideBtn = (label, title, onclick) => h('button', { type: 'button', class: 'plan-side-btn', 'aria-label': title, title, onclick }, label);
  const grip = h('div', { class: 'plan-grip', title: 'Drag to the other side of the screen', 'aria-label': 'Drag to move the panel' }, '⠿ Tools');
  const sideHandle = h('div', { class: 'plan-side-handle' }, grip,
    sideBtn('⇄', 'Move the panel to the other side', () => { prefs.side = prefs.side === 'left' ? 'right' : 'left'; applyPrefs(); savePrefs(); }),
    sideBtn('⇤', 'Hide the panel', () => { prefs.collapsed = true; applyPrefs(); savePrefs(); }));
  const splitter = h('div', { class: 'plan-split', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Drag to resize the panel', tabindex: '0' });
  const showBtn = h('button', { type: 'button', class: 'plan-show-panel btn-small', onclick: () => { prefs.collapsed = false; applyPrefs(); savePrefs(); } }, '▸ Tools');
  revealPanel = () => {
    if (prefs.collapsed) { prefs.collapsed = false; applyPrefs(); savePrefs(); }
    const first = sideEl.querySelector('select');
    first?.closest('.field')?.scrollIntoView?.({ block: 'nearest' });
  };
  const sideEl = h('div', { class: 'plan-side' });
  const mainEl = h('div', { class: 'plan-main' });

  // drag the handle across the screen to move the panel to the other side
  grip.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    let target = prefs.side;
    const move = (ev) => {
      const r = page.getBoundingClientRect();
      target = ev.clientX > r.left + r.width / 2 ? 'right' : 'left';
      page.dataset.drop = target; // shows where it will land
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      delete page.dataset.drop;
      if (target !== prefs.side) { prefs.side = target; applyPrefs(); savePrefs(); }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  // drag the edge to make the panel wider or narrower
  splitter.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = page.getBoundingClientRect();
      prefs.width = prefs.side === 'left' ? ev.clientX - r.left : r.right - ev.clientX;
      applyPrefs();
    };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      splitter.removeEventListener('pointercancel', up);
      savePrefs();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
    splitter.addEventListener('pointercancel', up);
  });
  splitter.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const grow = (e.key === 'ArrowRight') === (prefs.side === 'left');
    prefs.width += grow ? 24 : -24;
    applyPrefs();
    savePrefs();
  });

  const wideMq = matchMedia('(min-width: 760px)');
  const arrange = () => {
    if (wideMq.matches) {
      sideEl.replaceChildren(...[sideHandle, floorsBar, toolsWrap, panel, summary, settingsCard, notes, footer].filter(Boolean));
      mainEl.replaceChildren(canvas, zoomBtns, showBtn);
      page.replaceChildren(sideEl, splitter, mainEl);
    } else {
      page.replaceChildren(...[floorsBar, toolsWrap, canvas, zoomBtns, summary, settingsCard, panel, notes, footer].filter(Boolean)); // the phone layout, as it always was
    }
  };
  applyPrefs();
  arrange();
  wideMq.addEventListener('change', () => { if (!page.isConnected) return; arrange(); fitted = false; renderAll(); });
  root.append(...jobChrome(job, section), page);

  // Draw once the canvas is on screen (it needs its size), and again if the size changes.
  const ro = new ResizeObserver(() => {
    if (!canvas.isConnected) return ro.disconnect();
    if (!fitted && canvas.clientWidth) { fitted = true; fit(); } else renderCanvas();
  });
  ro.observe(canvas);

  // Keyboard (desktop): Ctrl+Z undo, Delete removes the selected item or room, Esc cancels / deselects.
  const onKey = (e) => {
    if (!canvas.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (history.length) undo();
    } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setTape(!tape.on);
    } else if (e.key === 'Escape') {
      if (tape.pending) return cancelTape(); // first Esc drops the line being made, the next puts the tape away
      if (tape.on) setTape(false);
      placing = null;
      sel = null;
      renderToolbar();
      renderCanvas();
      renderPanel();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      const f = floor();
      if (sel.type === 'measure') return deleteMeasures(group());
      if (sel.type === 'item') {
        const ids = igroup();
        if (!f.items.some((x) => ids.includes(x.id))) return;
        remember();
        f.items = f.items.filter((x) => !ids.includes(x.id));
        sel = null;
        save();
        renderAll();
      } else {
        const ids = rgroup().filter((i) => roomById(i));
        if (!ids.length) return;
        const r = roomById(ids[0]);
        confirmDialog(ids.length > 1 ? `Delete ${ids.length} rooms and everything in them?` : `Delete “${r.name}” and everything in it?`).then((ok) => {
          if (!ok) return;
          remember();
          f.rooms = f.rooms.filter((q) => !ids.includes(q.id));
          f.items = f.items.filter((it) => !ids.includes(it.roomId));
          sel = null;
          save();
          renderAll();
        });
      }
    }
  };
  document.addEventListener('keydown', onKey);
  renderAll();
}

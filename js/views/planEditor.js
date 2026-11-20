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
  blindGeometry, refreshPosts, endPanels, panelLines, setDepth, refreshDepths,
  cabinetShapes, badgePoint, featureTags, placementDims, wallCorners, WALL_NAMES, DOOR_SIZES, WINDOW_SIZES, hingeSide, setHinge, radiatorWall, nearestRoom, clampItem,
} from '../plan.js';
import { shownLine, measureOffset, newMeasure, measureLength, measureAngle, mmText, snapTape, endAtLength, setLength, measureHit, placeAtEnd, refAt, syncMeasures } from '../measure.js';

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
  const tape = { on: false, mode: 'drag', pending: null, typed: '', hover: null, snap: null, dir: null };
  const measures = () => (floor().measures ||= []);
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
    const b = bounds(floor());
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
      out.push(`<rect class="room${sel?.type === 'room' && sel.id === r.id ? ' sel' : ''}" x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * s}" height="${r.h * s}"/>`);
    }
    const isSel = (it) => sel?.type === 'item' && sel.id === it.id;
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
      const cls = `fx${d.dashed ? ' dashed' : ''}${isSel(it) ? ' sel' : ''}`;
      const line = (c, a) => `<line class="${c}" x1="${x + a[0] * s}" y1="${y + a[1] * s}" x2="${x + a[2] * s}" y2="${y + a[3] * s}"/>`;
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
      } else if (!d.filler && w > 34 && hh > 13) {
        out.push(`<text class="fx-t" x="${x + w / 2}" y="${y + hh / 2}" font-size="${Math.min(11, hh * 0.45, w / d.label.length * 1.9)}">${esc(d.label)}</text>`);
      }
    }
    // end panels (thin, drawn at least 3 px so they show when zoomed out)
    for (const p of endPanels(f, plan.settings)) {
      const r = roomById(p.roomId);
      if (!r) continue;
      const pw = Math.max(p.w * s, 3), ph = Math.max(p.h * s, 3);
      out.push(`<rect class="endp" x="${X(r.x + p.x) - (pw - p.w * s) / 2}" y="${Y(r.y + p.y) - (ph - p.h * s) / 2}" width="${pw}" height="${ph}"/>`);
    }
    for (const it of f.items) {
      const r = roomById(it.roomId);
      if (!r || ITEMS[it.type].kind !== 'wall') continue;
      const g = openingGeometry(r, it);
      const seg = `x1="${X(g.a.x)}" y1="${Y(g.a.y)}" x2="${X(g.b.x)}" y2="${Y(g.b.y)}"`;
      out.push(`<line class="gap" ${seg}/>`);
      if (it.type === 'door') {
        for (const lf of g.leaves) {
          out.push(`<line class="leaf${isSel(it) ? ' sel' : ''}" x1="${X(lf.hinge.x)}" y1="${Y(lf.hinge.y)}" x2="${X(lf.leaf.x)}" y2="${Y(lf.leaf.y)}"/>`);
          out.push(`<polyline class="swing${isSel(it) ? ' sel' : ''}" points="${lf.arc.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`);
        }
      } else {
        out.push(`<line class="win${isSel(it) ? ' sel' : ''}" ${seg}/>`, `<line class="win-in" ${seg}/>`);
      }
      if (dims && tags.has(it.id)) out.push(`<text class="tag" x="${X((g.a.x + g.b.x) / 2) + g.L.nx * 18}" y="${Y((g.a.y + g.b.y) / 2) + g.L.ny * 18}">${tags.get(it.id)}</text>`);
    }
    for (const it of f.items) {
      const r = roomById(it.roomId);
      const d = ITEMS[it.type];
      if (!r || d.kind !== 'point' || !dims) continue; // services only show on Room dimensions; they get in the way of the layout
      const cx = X(r.x + it.dx), cy = Y(r.y + it.dy);
      out.push(`<circle class="pt${isSel(it) ? ' sel' : ''}" cx="${cx}" cy="${cy}" r="13"/><text class="pt-t" x="${cx}" y="${cy}">${d.code}</text>`);
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
      const on = sel?.type === 'measure' && sel.id === m.id;
      const ax = X(m.a.x), ay = Y(m.a.y), bx = X(m.b.x), by = Y(m.b.y);
      const sh = shownLine(m); // the dimension line as drawn, pulled off its reference points by m.off
      const sax = X(sh.a.x), say = Y(sh.a.y), sbx = X(sh.b.x), sby = Y(sh.b.y);
      if (Math.abs(sh.o) * s > 3) { // thin dotted extension lines from the references out to the dimension line
        const ex = sh.n.x * Math.sign(sh.o) * 5, ey = sh.n.y * Math.sign(sh.o) * 5; // run a little past it
        out.push(`<line class="tape-ext" x1="${ax}" y1="${ay}" x2="${sax + ex}" y2="${say + ey}"/><line class="tape-ext" x1="${bx}" y1="${by}" x2="${sbx + ex}" y2="${sby + ey}"/>`);
      }
      out.push(`<line class="tape-l${on ? ' sel' : ''}" x1="${sax}" y1="${say}" x2="${sbx}" y2="${sby}"/>`);
      if (Math.abs(sh.o) * s > 3) out.push(`<circle class="tape-tick" cx="${sax}" cy="${say}" r="2.5"/><circle class="tape-tick" cx="${sbx}" cy="${sby}" r="2.5"/>`);
      out.push(`<circle class="tape-e${on ? ' sel' : ''}${m.ra ? ' att' : ''}" cx="${ax}" cy="${ay}" r="${on ? 6 : 4}"/><circle class="tape-e${on ? ' sel' : ''}${m.rb ? ' att' : ''}" cx="${bx}" cy="${by}" r="${on ? 6 : 4}"/>`);
      out.push(tapeLabel(sh.a, sh.b, mmText(measureLength(m)), on ? 'sel' : ''));
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
    // Corner handles (drag both ways) and edge-middle handles (one way only) on the selected room.
    if (sel?.type === 'room') {
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
    if (sel?.type === 'room') {
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
        parts.push(h('button', { type: 'button', class: 'btn-small', onclick: () => { touch(); [it.w, it.h] = [it.h, it.w]; clampItem(r, it); live(); buildBody(); } }, '⟳ Turn it round'));
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
      const it = newPlanItem(type, { roomId: hit.room.id, wall: hit.wall, at: Math.max(0, snap(hit.at - d.size / 2)), ...(type === 'door' && hit.out ? { out: true } : {}) });
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
  const cancelTape = () => { tape.pending = null; tape.typed = ''; tape.snap = null; tape.hover = null; renderBanner(); renderCanvas(); };
  const commitTape = () => {
    const m = tape.pending;
    tape.pending = null;
    tape.typed = '';
    tape.snap = null;
    if (m && measureLength(m) >= 1) {
      remember();
      const made = newMeasure(m.a, m.b, refAt(floor(), m.a), refAt(floor(), m.b)); // an end that lands on a corner stays attached to it
      measures().push(made);
      sel = { type: 'measure', id: made.id };
      save();
    }
    renderBanner();
    renderPanel();
    renderCanvas();
  };
  /** The tape end or body under the pointer (ends always; the body and the length label too). */
  const measureAt = (p) => {
    const w = toWorld(p);
    for (const m of [...measures()].reverse()) {
      if (tape.on && sel?.id !== m.id) continue; // with the tape out, only the selected one can be picked up, so a new one can start on an old one's corner
      const part = measureHit(m, w, 14 / view.s, 8 / view.s, tape.on);
      if (part) return { m, part };
      const sh = shownLine(m);
      const mid = { x: (sh.a.x + sh.b.x) / 2, y: (sh.a.y + sh.b.y) / 2 };
      if (Math.hypot(w.x - mid.x, w.y - mid.y) <= 16 / view.s) return { m, part: 'line' };
    }
    return null;
  };

  svg.addEventListener('pointerdown', (e) => {
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
    const mh = measureAt(p);
    if (mh) { // pick up a tape: an end re-measures it, the body or label moves the whole tape
      sel = { type: 'measure', id: mh.m.id };
      drag = mh.part === 'line'
        ? { kind: 'moff', m: mh.m, off0: measureOffset(mh.m), w0: w, p0: p, snapshot }
        : { kind: 'mend', m: mh.m, end: mh.part, p0: p, snapshot };
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
      sel = { type: 'item', id: hit.item.id };
      if (ITEMS[hit.item.type].kind === 'wall') setTimeout(revealPanel, 0); // after the panel redraws
      const r = roomById(hit.item.roomId);
      drag = { kind: 'item', item: hit.item, o: { ...hit.item, ax: r.x + (hit.item.dx || 0), ay: r.y + (hit.item.dy || 0) }, w0: w, p0: p, snapshot };
    } else if (hit?.kind === 'room') {
      sel = { type: 'room', id: hit.room.id };
      drag = { kind: 'room', room: hit.room, o: { x: hit.room.x, y: hit.room.y }, w0: w, p0: p, snapshot };
    } else {
      sel = null;
      drag = { kind: 'pan', p0: p, v0: { ...view } };
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
    if (drag.kind === 'moff') { // pull the dimension line sideways only: it stays parallel to what it measures
      const n = shownLine(drag.m).n;
      let off = drag.off0 + dx * n.x + dy * n.y;
      if (Math.abs(off) * view.s < 6) off = 0; // clicks back onto the line it measures
      drag.m.off = off ? Math.round(off * 10) / 10 : 0;
      if (!off) delete drag.m.off;
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
    if (tape.hover) { tape.hover = null; renderCanvas(); }
  };
  const endPointer = (e) => {
    clearTimeout(pressTimer);
    pointers.delete(e.pointerId);
    if (!drag) return;
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
  const snapToRooms = (r) => {
    const others = floor().rooms.filter((o) => o !== r);
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
    settleItem(r, it);
    snapToUnits(r, f.items, it); // closes up against the unit next to it
  };

  // ----- cabinets: choose the width and type, then the unit lands in the room ready to drag -----
  const cabinetDialog = async (type) => {
    const d = ITEMS[type];
    let width = d.sizes.includes(d.w) ? d.w : d.sizes[0];
    let door = null, hand = 'right';
    const doorsFor = (n) => DOOR_OPTIONS[n] || [Math.round(n / 2)];
    const doorOptions = (n) => doorsFor(n).map((m) => h('option', { value: String(m) }, `${m * 10} mm`));
    const parts = [];
    let doorField = null;
    let useOther = false;
    const customInput = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Width in cm' });
    const customLabel = h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Width (cm)'), customInput);
    customLabel.hidden = true;
    const widthField = selectField('Width', String(width), [...d.sizes.map((n) => [String(n), `${n * 10} mm`]), ['other', 'Other…']], (v) => {
      useOther = v === 'other';
      customLabel.hidden = !useOther;
      if (useOther) {
        customInput.focus();
        return;
      }
      width = Number(v);
      if (d.blind) {
        const sel = doorField.querySelector('select');
        sel.replaceChildren(...doorOptions(width));
        door = doorsFor(width).slice(-1)[0];
        sel.value = String(door);
      }
    }, { placeholder: null });
    parts.push(widthField, customLabel);
    if (d.blind) {
      door = doorsFor(width).slice(-1)[0];
      doorField = selectField('Door width', String(door), doorsFor(width).map((m) => [String(m), `${m * 10} mm`]), (v) => { door = Number(v); }, { placeholder: null });
      parts.push(doorField, selectField('Blind end (seen from the front)', 'right', [['right', 'Right'], ['left', 'Left']], (v) => { hand = v; }, { placeholder: null }));
    }
    const choices = d.styles ? Object.entries(STYLES).map(([value, label]) => ({ value, label }))
      : d.patterns ? PATTERNS.map((p) => ({ value: p, label: `Doors ${p}` }))
        : d.space ? APPLIANCES.map((a) => ({ value: a, label: a }))
          : [{ value: 'add', label: 'Add' }];
    const v = await choose({
      title: d.label,
      message: d.styles ? 'Pick the width, then the type of unit.'
        : d.patterns ? 'Pick the width, then the door pattern (upper door / lower door).'
          : d.space ? 'Pick the width, then what goes in the space. End panels are added either side.'
            : d.blind ? 'Pick the width, the door width and which end is blind. The corner post sizes itself to the cabinet beside it.'
              : 'Pick the width.',
      content: h('div', null, ...parts),
      buttons: [...choices.map((c) => ({ ...c, class: 'btn-primary btn-big' })), { label: 'Cancel', value: null }],
    });
    if (!v) return null;
    const typed = useOther ? num(customInput.value) : NaN;
    const finalWidth = typed > 0.5 ? Math.round(typed * 10) / 10 : width;
    return { width: finalWidth, choice: v, door: d.blind ? Math.min(door, finalWidth - 20) : door, hand };
  };
  /** A new unit with the size and options chosen in the cabinet dialog (pick is null for plain fixtures). */
  const makeCabinet = (type, pick, roomId) => {
    const d = ITEMS[type];
    const it = newPlanItem(type, { roomId });
    if (pick) {
      it.uw = pick.width;
      if (d.corner) it.ud = pick.width;
      if (d.styles) it.style = pick.choice;
      if (d.patterns) it.pattern = pick.choice;
      if (d.space) it.appliance = pick.choice;
      if (d.blind) { it.door = pick.door; it.hand = pick.hand; }
    }
    setDepth(it, plan.settings); // carcass + gap + door front (and the end panels of an appliance space)
    applyRot(it);
    return it;
  };
  const addCabinet = async (type) => {
    const d = ITEMS[type];
    const f = floor();
    if (!f.rooms.length) return toast('Add the rooms on the Room dimensions tab first');
    const centre = toWorld({ x: (canvas.clientWidth || 360) / 2, y: (canvas.clientHeight || 400) / 2 });
    const r = roomAt(f.rooms, centre.x, centre.y) || f.rooms[0]; // the room in view
    placing = null;
    renderToolbar();
    const pick = await cabinetDialog(type);
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
    toast(n ? `No. ${n} added – drag it into place` : `${d.label} added – drag it into place`);
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
  // Floor plan tab: cabinets and their parts first, then the appliances.
  const orderedTools = () => {
    const all = PALETTE[kind].filter(editable);
    if (dims) return all;
    const parts = all.filter((t) => ITEMS[t].cab || ITEMS[t].filler);
    const rest = all.filter((t) => !(ITEMS[t].cab || ITEMS[t].filler));
    return parts.length && rest.length ? ['||', ...parts, '|', ...rest] : all;
  };
  const renderToolbar = () => {
    toolbar.replaceChildren(...[
      dims ? h('button', { type: 'button', class: 'btn-primary btn-small', onclick: addRoom }, '+ Room') : null,
      ...orderedTools().map((t) => (t === '||' ? h('span', { class: 'plan-sep lead' }, 'Cabinets') : t === '|' ? h('span', { class: 'plan-sep' }, 'Appliances') : h('button', {
        type: 'button',
        class: 'btn-small plan-tool',
        'aria-pressed': String(placing === t),
        onclick: () => {
          if (ITEMS[t].sizes) return addCabinet(t); // units ask their size first, then land in the room
          tape.on = false; // the tape and "tap to place" use the same banner
          tape.pending = null;
          placing = placing === t ? null : t;
          renderToolbar();
        },
      }, `${ITEMS[t].emoji} ${ITEMS[t].label}`)))].filter(Boolean));
    renderBanner();
  };

  // ----- the banner over the plan: placing something, or the tape measure -----
  const tapeBtn = h('button', { type: 'button', class: 'btn-small tape-btn', title: 'Tape measure (M)', onclick: () => setTape(!tape.on) }, '📏 Tape');
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
        msg = tape.mode === 'type' ? 'Click where the measurement starts' : 'Click or drag from one point to another (Alt = no snapping)';
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
    const input = h('input', { type: 'text', value, inputmode: opts.inputmode, list: opts.list, autocapitalize: opts.cap, 'aria-label': label, onfocus: () => { opts.onfocus?.(); edited = false; }, oninput: (e) => { if (!edited) { edited = true; remember(); } oninput(e.target.value); renderCanvas(); renderSummary(); save(); } });
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
  };
  const delBtn = (label, fn) => h('button', { type: 'button', class: 'btn-danger btn-small', onclick: fn }, label);
  const deleteMeasure = (mid) => {
    const i = measures().findIndex((m) => m.id === mid);
    if (i < 0) return;
    remember();
    measures().splice(i, 1);
    sel = null;
    save();
    renderAll();
  };
  /** Put a unit against the end of a tape: inside (back along the tape) or outside (beyond the end). */
  let tapeUnit = null;
  const placeUnitAtEnd = async (m, side) => {
    const type = tapeUnit;
    const d = ITEMS[type];
    const f = floor();
    const pick = d.sizes ? await cabinetDialog(type) : null;
    if (d.sizes && !pick) return;
    remember();
    const it = makeCabinet(type, pick, f.rooms[0].id);
    if (!placeAtEnd(f, m, it, side)) return;
    f.items.push(it);
    sel = { type: 'item', id: it.id };
    save();
    renderAll();
    toast(`${d.label} placed ${side === 'inside' ? 'inside' : 'outside'} the end of the tape`);
  };
  const CORNER = { nw: 'north-west', ne: 'north-east', sw: 'south-west', se: 'south-east' };
  const refName = (f, ref) => {
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
      const types = orderedTools().filter((t) => ITEMS[t]?.kind === 'fixture' && t !== 'radiator');
      if (!types.includes(tapeUnit)) tapeUnit = types[0] || null;
      if (tapeUnit) {
        parts.push(
          selectField('Unit to fit at the far end', tapeUnit, types.map((t) => [t, `${ITEMS[t].emoji} ${ITEMS[t].label}`]), (v) => { tapeUnit = v; }, { placeholder: null }),
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
  const renderPanel = () => {
    const f = floor();
    if (sel?.type === 'measure') {
      const m = measureById(sel.id);
      if (!m) { sel = null; return renderPanel(); }
      return renderMeasurePanel(m);
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
    if (sel?.type === 'item') {
      const it = f.items.find((i) => i.id === sel.id);
      if (!it) { sel = null; return renderPanel(); }
      const d = ITEMS[it.type];
      const removeIt = delBtn('Delete', () => { remember(); f.items.splice(f.items.indexOf(it), 1); sel = null; save(); renderAll(); });
      const parts = [h('strong', null, `${d.emoji} ${d.label}`)];
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
          parts.push(field('Width (cm)', String(it.size), (v) => { const n = num(v); if (n > 10) it.size = Math.round(n); }, { inputmode: 'decimal' }));
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
          const minCm = d.filler ? 0.5 : 5;
          const setWidth = (n) => {
            it.uw = n;
            if (d.corner) it.ud = n;
            if (d.blind) it.door = Math.min((DOOR_OPTIONS[n] || [it.door]).slice(-1)[0], n - 20);
          };
          if (d.sizes) {
            const widthNow = it.uw;
            const opts = d.sizes.includes(widthNow) ? d.sizes : [...d.sizes, widthNow].sort((x, y) => x - y);
            const custom = field(d.corner ? 'Size (cm)' : 'Width (cm)', String(widthNow), (v) => { const n = num(v); if (n > minCm) { setWidth(d.filler ? Math.round(n * 10) / 10 : Math.round(n)); refit(); } }, { inputmode: 'decimal' });
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
            if (!d.corner) {
              parts.push(d.fronted
                ? field('Carcass depth (cm)', String(it.cd), (v) => { const n = num(v); if (n > 5) { it.cd = Math.round(n * 10) / 10; setDepth(it, plan.settings); refit(); } }, { inputmode: 'decimal' })
                : field('Depth (cm)', String(it.ud), (v) => { const n = num(v); if (n > 5) { it.ud = Math.round(n); refit(); } }, { inputmode: 'decimal' }));
            }
          } else {
            parts.push(h('div', { class: 'grid-2' },
              field('Width (cm)', String(it.uw), (v) => { const n = num(v); if (n > 5) { it.uw = Math.round(n); refit(); } }, { inputmode: 'decimal' }),
              field('Depth (cm)', String(it.ud), (v) => { const n = num(v); if (n > 5) { it.ud = Math.round(n); refit(); } }, { inputmode: 'decimal' })));
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
          if (d.cab && !d.corner && !d.space) {
            const ends = it.endL && it.endR ? 'both' : it.endL ? 'left' : it.endR ? 'right' : 'none';
            parts.push(selectField('End panels (seen from the front)', ends, [['none', 'None'], ['left', 'Left end'], ['right', 'Right end'], ['both', 'Both ends']], (v) => {
              remember();
              it.endL = v === 'left' || v === 'both';
              it.endR = v === 'right' || v === 'both';
              save();
              renderAll();
            }, { placeholder: null }));
          }
          if (d.fronted) {
            parts.push(h('p', { class: 'hint' }, d.space
              ? `Clear space ${Math.round(it.uw * 10)} mm between two ${plan.settings.board} mm end panels (${Math.round((it.uw + it.ew) * 10)} mm in all).`
              : `Depth on the plan: ${Math.round(it.ud * 10)} mm = ${Math.round(it.cd * 10)} mm carcass + 2 mm gap + ${plan.settings.front} mm front.`));
          }
          const n = cabinetNumbers(f).get(it.id);
          parts.push(h('p', { class: 'hint' }, `${n ? `No. ${n} on the key. ` : d.filler ? 'Listed under the key. ' : ''}It turns its back to the nearest wall by itself – use Turn for a special detail.${d.space ? ' End panels are added either side automatically.' : ''}`));
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
            field('Width (cm)', String(it.w), (v) => { const n = num(v); if (n > 5) { it.w = Math.round(n); settleItem(r, it); } }, { inputmode: 'decimal' }),
            field('Depth (cm)', String(it.h), (v) => { const n = num(v); if (n > 5) { it.h = Math.round(n); settleItem(r, it); } }, { inputmode: 'decimal' })));
          parts.push(h('div', { class: 'btn-row' },
            it.type === 'radiator' ? h('button', { type: 'button', class: 'btn-small btn-primary', onclick: () => editFeature(it) }, '✎ Edit details') : null,
            h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); [it.w, it.h] = [it.h, it.w]; settleItem(r, it); save(); renderAll(); } }, '⟳ Turn'),
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
    const appliances = dims ? [] : floor().items.filter((i) => ITEMS[i.type].facing && !ITEMS[i.type].cab && !ITEMS[i.type].filler);
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
    const options = (v) => [...new Set([18, 22, v])].sort((a, b) => a - b).map((n) => [String(n), `${n} mm`]);
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
        selectField('End panels and fillers', String(st.board), options(st.board), (v) => change('board', v), { placeholder: null })));
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
      if (sel.type === 'measure') return deleteMeasure(sel.id);
      if (sel.type === 'item') {
        const i = f.items.findIndex((x) => x.id === sel.id);
        if (i < 0) return;
        remember();
        f.items.splice(i, 1);
        sel = null;
        save();
        renderAll();
      } else {
        const r = roomById(sel.id);
        if (!r) return;
        confirmDialog(`Delete “${r.name}” and everything in it?`).then((ok) => {
          if (!ok) return;
          remember();
          f.rooms.splice(f.rooms.indexOf(r), 1);
          f.items = f.items.filter((it) => it.roomId !== r.id);
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

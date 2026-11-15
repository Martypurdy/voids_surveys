// Designer › floor plan editor. Rooms are boxes: drag to move (they snap together),
// drag a corner to resize, or type exact sizes. Tap a wall to add a door or window; tap
// inside a room to add the fuse board, water main, meters, units, sink, bath and so on.
// Measurements and areas show automatically. One finger drags, two fingers zoom.
import { scheduleSave } from '../db.js';
import { h, toast, choose, confirmDialog } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';
import {
  ITEMS, PALETTE, ROOM_NAMES, FLOOR_NAMES, newPlanRoom, newFloor, newPlanItem, roomFigures, floorArea, planArea,
  metres, sqm, openingGeometry, nearestWall, roomAt, bounds, settleItem, legend,
} from '../plan.js';

const SNAP = 5; // cm
const MIN_ROOM = 50; // cm
const snap = (v) => Math.round(v / SNAP) * SNAP;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const SVG_NS = 'http://www.w3.org/2000/svg';

export default async function planEditor(root, { id }) {
  const job = await loadJobOr404(id);
  const plan = job.plan;
  const kind = plan.kind;
  const save = () => scheduleSave(job);
  let fi = 0;
  const floor = () => plan.floors[fi];
  const roomById = (rid) => floor().rooms.find((r) => r.id === rid);
  let view = { s: 1, tx: 20, ty: 20 };
  let sel = null; // { type: 'room' | 'item', id }
  let placing = null; // item type waiting for a tap
  let fitted = false;

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
    for (const r of f.rooms) {
      out.push(`<rect class="room${sel?.type === 'room' && sel.id === r.id ? ' sel' : ''}" x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * s}" height="${r.h * s}"/>`);
    }
    const isSel = (it) => sel?.type === 'item' && sel.id === it.id;
    // fixtures, then openings, then symbols
    for (const it of f.items) {
      const r = roomById(it.roomId);
      const d = ITEMS[it.type];
      if (!r || d.kind !== 'fixture') continue;
      const x = X(r.x + it.dx), y = Y(r.y + it.dy), w = it.w * s, hh = it.h * s;
      out.push(`<rect class="fx${d.dashed ? ' dashed' : ''}${isSel(it) ? ' sel' : ''}" x="${x}" y="${y}" width="${w}" height="${hh}"/>`);
      if (w > 34 && hh > 13) out.push(`<text class="fx-t" x="${x + w / 2}" y="${y + hh / 2}" font-size="${Math.min(11, hh * 0.45, w / d.label.length * 1.9)}">${esc(d.label)}</text>`);
    }
    for (const it of f.items) {
      const r = roomById(it.roomId);
      if (!r || ITEMS[it.type].kind !== 'wall') continue;
      const g = openingGeometry(r, it);
      const seg = `x1="${X(g.a.x)}" y1="${Y(g.a.y)}" x2="${X(g.b.x)}" y2="${Y(g.b.y)}"`;
      out.push(`<line class="gap" ${seg}/>`);
      if (it.type === 'door') {
        out.push(`<line class="leaf${isSel(it) ? ' sel' : ''}" x1="${X(g.hinge.x)}" y1="${Y(g.hinge.y)}" x2="${X(g.leaf.x)}" y2="${Y(g.leaf.y)}"/>`);
        out.push(`<polyline class="swing${isSel(it) ? ' sel' : ''}" points="${g.arc.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`);
      } else {
        out.push(`<line class="win${isSel(it) ? ' sel' : ''}" ${seg}/>`, `<line class="win-in" ${seg}/>`);
      }
    }
    for (const it of f.items) {
      const r = roomById(it.roomId);
      const d = ITEMS[it.type];
      if (!r || d.kind !== 'point') continue;
      const cx = X(r.x + it.dx), cy = Y(r.y + it.dy);
      out.push(`<circle class="pt${isSel(it) ? ' sel' : ''}" cx="${cx}" cy="${cy}" r="13"/><text class="pt-t" x="${cx}" y="${cy}">${d.code}</text>`);
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
    // Corner handles on the selected room.
    if (sel?.type === 'room') {
      const r = roomById(sel.id);
      if (r) for (const [cx, cy] of corners(r)) out.push(`<circle class="handle" cx="${X(cx)}" cy="${Y(cy)}" r="9"/>`);
    }
    if (!f.rooms.length) out.push(`<text class="empty-t" x="${W / 2}" y="${H / 2}">Tap “+ Room” to start</text>`);
    svg.innerHTML = out.join('');
  };
  const corners = (r) => [[r.x, r.y, 'nw'], [r.x + r.w, r.y, 'ne'], [r.x, r.y + r.h, 'sw'], [r.x + r.w, r.y + r.h, 'se']];

  // ----- hit testing (screen point -> what's there) -----
  const hitTest = (p) => {
    const w = toWorld(p);
    const tol = 14 / view.s;
    const f = floor();
    if (sel?.type === 'room') {
      const r = roomById(sel.id);
      const c = r && corners(r).find(([cx, cy]) => Math.hypot(w.x - cx, w.y - cy) < 20 / view.s);
      if (c) return { kind: 'handle', room: r, corner: c[2] };
    }
    for (const it of [...f.items].reverse()) {
      const r = roomById(it.roomId);
      if (!r) continue;
      const d = ITEMS[it.type];
      if (d.kind === 'point' && Math.hypot(w.x - (r.x + it.dx), w.y - (r.y + it.dy)) < 17 / view.s) return { kind: 'item', item: it };
      if (d.kind === 'wall') {
        const g = openingGeometry(r, it);
        const mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2;
        if (Math.abs(w.x - mx) <= (g.L.nx ? tol : g.size / 2 + tol) && Math.abs(w.y - my) <= (g.L.ny ? tol : g.size / 2 + tol)) return { kind: 'item', item: it };
      }
    }
    for (const it of [...f.items].reverse()) {
      const r = roomById(it.roomId);
      if (r && ITEMS[it.type].kind === 'fixture' && w.x >= r.x + it.dx && w.x <= r.x + it.dx + it.w && w.y >= r.y + it.dy && w.y <= r.y + it.dy + it.h) return { kind: 'item', item: it };
    }
    const r = roomAt(f.rooms, w.x, w.y);
    return r ? { kind: 'room', room: r } : null;
  };

  // ----- placing new items -----
  const place = (type, w) => {
    const d = ITEMS[type];
    const f = floor();
    if (d.kind === 'wall') {
      const hit = nearestWall(f.rooms, w.x, w.y, 45 / view.s);
      if (!hit) return toast(`Tap on a wall to place the ${d.label.toLowerCase()}`);
      remember();
      const it = newPlanItem(type, { roomId: hit.room.id, wall: hit.wall, at: Math.max(0, snap(hit.at - d.size / 2)) });
      f.items.push(it);
      sel = { type: 'item', id: it.id };
    } else {
      const r = roomAt(f.rooms, w.x, w.y);
      if (!r) return toast(`Tap inside a room to place the ${d.label.toLowerCase()}`);
      remember();
      const it = newPlanItem(type, { roomId: r.id });
      it.dx = snap(w.x - r.x - (it.w || 0) / 2);
      it.dy = snap(w.y - r.y - (it.h || 0) / 2);
      settleItem(r, it);
      f.items.push(it);
      sel = { type: 'item', id: it.id };
    }
    save();
    renderAll();
  };

  // ----- dragging, panning, pinch-zoom -----
  const pointers = new Map();
  let drag = null;
  const pt = (e) => { const b = svg.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pt(e));
    if (pointers.size === 2) {
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
    const hit = hitTest(p);
    const snapshot = JSON.stringify(plan.floors);
    if (hit?.kind === 'handle') {
      drag = { kind: 'resize', room: hit.room, corner: hit.corner, o: { ...hit.room }, w0: w, p0: p, snapshot };
    } else if (hit?.kind === 'item') {
      sel = { type: 'item', id: hit.item.id };
      const r = roomById(hit.item.roomId);
      drag = { kind: 'item', item: hit.item, o: { ...hit.item, ax: r.x + (hit.item.dx || 0), ay: r.y + (hit.item.dy || 0) }, w0: w, p0: p, snapshot };
    } else if (hit?.kind === 'room') {
      sel = { type: 'room', id: hit.room.id };
      drag = { kind: 'room', room: hit.room, o: { x: hit.room.x, y: hit.room.y }, w0: w, p0: p, snapshot };
    } else {
      sel = null;
      drag = { kind: 'pan', p0: p, v0: { ...view } };
    }
    renderCanvas();
    renderPanel();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
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
    if (drag.kind === 'pan') {
      view.tx = drag.v0.tx + (p.x - drag.p0.x);
      view.ty = drag.v0.ty + (p.y - drag.p0.y);
      return renderCanvas();
    }
    const w = toWorld(p);
    const dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
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
      // Keep fittings where they are on the plan while the room's corner moves.
      for (const it of floor().items) {
        if (it.roomId !== r.id) continue;
        if (ITEMS[it.type].kind === 'wall') {
          it.at = Math.max(0, it.at + (it.wall === 'n' || it.wall === 's' ? r.x - x1 : r.y - y1));
          continue;
        }
        it.dx += r.x - x1;
        it.dy += r.y - y1;
      }
      Object.assign(r, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      for (const it of floor().items) if (it.roomId === r.id && ITEMS[it.type].kind !== 'wall') settleItem(r, it);
    } else if (drag.kind === 'item') {
      moveItem(drag.item, drag.o, w, dx, dy);
    }
    renderCanvas();
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.kind === 'pinch') {
      if (pointers.size === 0) drag = null;
      return;
    }
    if (drag.moved && drag.snapshot) {
      remember(drag.snapshot);
      save();
      renderPanel();
      renderSummary();
    }
    drag = null;
  };
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
      const hit = nearestWall(f.rooms, w.x, w.y, 80 / view.s);
      if (!hit) return;
      Object.assign(it, { roomId: hit.room.id, wall: hit.wall, at: Math.max(0, snap(hit.at - it.size / 2)) });
      return;
    }
    const ax = o.ax + dx, ay = o.ay + dy;
    const cx = ax + (it.w || 0) / 2, cy = ay + (it.h || 0) / 2;
    const r = roomAt(f.rooms, cx, cy) || roomById(it.roomId);
    it.roomId = r.id;
    it.dx = snap(ax - r.x);
    it.dy = snap(ay - r.y);
    settleItem(r, it);
  };

  // ----- floors (whole property plans) -----
  const floorsBar = h('div', { class: 'chips plan-floors' });
  const renderFloors = () => {
    floorsBar.hidden = kind !== 'property';
    floorsBar.replaceChildren(
      ...plan.floors.map((f, i) => h('button', {
        type: 'button',
        'aria-pressed': String(i === fi),
        onclick: () => (i === fi ? floorMenu() : (fi = i, sel = null, fitted = false, renderAll())),
      }, f.name)),
      h('button', { type: 'button', class: 'add-floor', onclick: addFloor }, '+ Floor'));
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
  const renderToolbar = () => {
    toolbar.replaceChildren(
      h('button', { type: 'button', class: 'btn-primary btn-small', onclick: addRoom }, '+ Room'),
      ...PALETTE[kind].map((t) => h('button', {
        type: 'button',
        class: 'btn-small plan-tool',
        'aria-pressed': String(placing === t),
        onclick: () => {
          placing = placing === t ? null : t;
          renderToolbar();
        },
      }, `${ITEMS[t].emoji} ${ITEMS[t].label}`)));
    if (placing) {
      const d = ITEMS[placing];
      banner.hidden = false;
      banner.replaceChildren(
        h('span', null, d.kind === 'wall' ? `Tap a wall to place the ${d.label.toLowerCase()}` : `Tap inside the room where the ${d.label.toLowerCase()} goes`),
        h('button', { type: 'button', class: 'btn-small', onclick: () => { placing = null; renderToolbar(); } }, 'Cancel'));
    } else {
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
    const input = h('input', { type: 'text', value, inputmode: opts.inputmode, list: opts.list, autocapitalize: opts.cap, 'aria-label': label, onfocus: () => remember(), oninput: (e) => { oninput(e.target.value); renderCanvas(); renderSummary(); save(); } });
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
  };
  const delBtn = (label, fn) => h('button', { type: 'button', class: 'btn-danger btn-small', onclick: fn }, label);
  const renderPanel = () => {
    const f = floor();
    if (sel?.type === 'room') {
      const r = roomById(sel.id);
      if (!r) { sel = null; return renderPanel(); }
      const figures = h('p', { class: 'plan-figures' });
      const showFigures = () => {
        const fg = roomFigures(r);
        figures.textContent = [`Floor ${sqm(fg.floor)}`, `Perimeter ${fg.perimeter.toFixed(2)} m`, fg.walls ? `Walls ${sqm(fg.walls)}` : 'Add the ceiling height for the wall area'].join(' · ');
      };
      const metresField = (label, key) => field(label, (r[key] / 100).toFixed(2), (v) => {
        const n = num(v);
        if (n > 0) r[key] = Math.max(MIN_ROOM, Math.round(n * 100));
        for (const it of f.items) if (it.roomId === r.id && ITEMS[it.type].kind !== 'wall') settleItem(r, it);
        showFigures();
      }, { inputmode: 'decimal' });
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
        parts.push(field('Width (cm)', String(it.size), (v) => { const n = num(v); if (n > 10) it.size = Math.round(n); }, { inputmode: 'decimal' }));
        parts.push(h('div', { class: 'btn-row' },
          it.type === 'door' ? h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); it.flip = !it.flip; save(); renderCanvas(); } }, '⇄ Flip swing') : null,
          removeIt));
        parts.push(h('p', { class: 'hint' }, 'Drag it along the wall, or onto another wall.'));
      } else if (d.kind === 'fixture') {
        const r = roomById(it.roomId);
        parts.push(h('div', { class: 'grid-2' },
          field('Width (cm)', String(it.w), (v) => { const n = num(v); if (n > 5) { it.w = Math.round(n); settleItem(r, it); } }, { inputmode: 'decimal' }),
          field('Depth (cm)', String(it.h), (v) => { const n = num(v); if (n > 5) { it.h = Math.round(n); settleItem(r, it); } }, { inputmode: 'decimal' })));
        parts.push(h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn-small', onclick: () => { remember(); [it.w, it.h] = [it.h, it.w]; settleItem(r, it); save(); renderAll(); } }, '⟳ Turn'),
          removeIt));
      } else {
        parts.push(h('p', { class: 'hint' }, `Shown as “${d.code}” on the plan. Drag it to where it is.`), h('div', { class: 'btn-row' }, removeIt));
      }
      panel.replaceChildren(...parts);
      return;
    }
    panel.replaceChildren(
      h('p', { class: 'hint plan-help' }, f.rooms.length
        ? 'Tap a room to size or rename it – drag it to move (rooms snap together), drag a corner to resize. Pick a button above, then tap the plan to add doors, windows and fittings. Pinch or use two fingers to zoom.'
        : 'Start with “+ Room”. Add each room with rough sizes, then drag them together like a jigsaw.'));
  };

  // ----- totals and key -----
  const summary = h('div', { class: 'plan-summary' });
  const renderSummary = () => {
    const key = legend([floor()]);
    summary.replaceChildren(...[
      h('span', null, kind === 'property' ? `${floor().name}: ` : 'Floor area: ', h('b', null, sqm(floorArea(floor())))),
      kind === 'property' && plan.floors.length > 1 ? h('span', null, 'Whole property: ', h('b', null, sqm(planArea(plan)))) : null,
      key.length ? h('span', { class: 'plan-key' }, key.map(([c, l]) => `${c} = ${l}`).join(' · ')) : null].filter(Boolean));
  };

  const renderAll = () => {
    renderFloors();
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

  root.append(
    ...jobChrome(job, 'plan'),
    h('div', { class: 'content plan-page' },
      floorsBar,
      h('div', { class: 'plan-tools-wrap' }, toolbar),
      canvas,
      zoomBtns,
      summary,
      panel,
      h('label', { class: 'field', style: 'margin-top:14px' }, h('span', { class: 'field-label' }, 'Notes'),
        h('textarea', { placeholder: 'Anything to note about the plan', oninput: (e) => { plan.notes = e.target.value; save(); } }, plan.notes || '')),
      completeFooter(job, 'plan')));

  // Draw once the canvas is on screen (it needs its size), and again if the size changes.
  const ro = new ResizeObserver(() => {
    if (!canvas.isConnected) return ro.disconnect();
    if (!fitted && canvas.clientWidth) { fitted = true; fit(); } else renderCanvas();
  });
  ro.observe(canvas);
  renderAll();
}

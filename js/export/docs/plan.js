// Designer floor plans as Word (the drawings plus schedules) and Excel (schedules you can sort and order from).
import { addressLines, fmtDateTime } from '../../model.js';
import {
  ITEMS, roomFigures, floorArea, planArea, metres, sqm, featureTags, describeFeature, serviceInfo, cabinetNumbers, cabinetText,
  panelLines, settingsLine, refreshDepths, openingGeometry, radiatorWall, wallCorners, hingeSide, WALL_NAMES,
} from '../../plan.js';

const mm = (cm) => Math.round(cm * 10);
const numOf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Floors with rooms, and the facts about each. */
function collect(job) {
  const plan = job.plan;
  refreshDepths(plan);
  return plan.floors.filter((f) => f.rooms.length).map((f) => {
    const roomOf = (id) => f.rooms.find((r) => r.id === id);
    const placed = f.items.filter((it) => roomOf(it.roomId));
    const tags = featureTags(f);
    const nums = cabinetNumbers(f);
    const units = placed.filter((it) => ITEMS[it.type].kind === 'fixture' && it.type !== 'radiator');
    return {
      floor: f, roomOf, tags, nums, placed,
      doors: placed.filter((it) => it.type === 'door'), windows: placed.filter((it) => it.type === 'window'), radiators: placed.filter((it) => it.type === 'radiator'),
      services: placed.filter((it) => ITEMS[it.type].kind === 'point'),
      cabinets: units.filter((it) => nums.has(it.id)),
      appliances: units.filter((it) => ITEMS[it.type].facing && !ITEMS[it.type].cab && !ITEMS[it.type].filler),
      panels: panelLines(f, plan.settings), hasUnits: units.length > 0,
    };
  });
}

/** Does the plan have a second (cabinet layout) page per floor? Used to match PDF pages to floors. */
export const planPageMap = (job) => collect(job).map((c) => ({ room: true, layout: c.hasUnits }));

/** The Word document. pageImages: the PDF pages as pictures, in order (room page, then layout page, per floor). */
export function planModel(job, pageImages = []) {
  const plan = job.plan;
  const addr = addressLines(job.address);
  const floors = collect(job);
  const sections = [];
  let img = 0;
  const take = (caption) => { const p = pageImages[img++]; return p ? [{ ...p, caption }] : []; };
  floors.forEach((c, i) => {
    const fname = plan.kind === 'property' ? ` - ${c.floor.name}` : '';
    const rooms = c.floor.rooms.map((r) => { const fg = roomFigures(r); return [r.name, `${metres(r.w)} x ${metres(r.h)}`, sqm(fg.floor), fg.height ? `${fg.height.toFixed(2)} m` : '', fg.walls ? sqm(fg.walls) : '']; });
    sections.push({
      heading: `Room information${fname}`, pageBreak: i > 0, images: take(`Room information${fname}`),
      table: { cols: [{ title: 'Room', w: 3 }, { title: 'Size', w: 2.5 }, { title: 'Floor area', w: 1.5, align: 'right' }, { title: 'Ceiling', w: 1.2, align: 'right' }, { title: 'Wall area', w: 1.5, align: 'right' }], rows: rooms, foot: c.floor.rooms.length > 1 ? [[`${plan.kind === 'property' ? c.floor.name : 'Total'}`, '', sqm(floorArea(c.floor)), '', '']] : [] },
    });
    for (const [title, list] of [['Doors', c.doors], ['Windows', c.windows], ['Radiators', c.radiators]]) {
      if (!list.length) continue;
      sections.push({ heading: title, level: 2, table: { cols: [{ title: 'Tag', w: 0.8 }, { title: 'Description', w: 5 }, { title: 'Size', w: 4 }, { title: 'Position', w: 6 }], rows: list.map((it) => { const [head, size, dist] = describeFeature(c.roomOf(it.roomId), it, c.tags.get(it.id)); const [tag, ...rest] = head.split('  '); return [tag, rest.join('  '), size || '', dist || '']; }) } });
    }
    if (c.services.length) sections.push({ heading: 'Services', level: 2, table: { cols: [{ title: 'Code', w: 0.8 }, { title: 'Service', w: 3 }, { title: 'Where', w: 9 }], rows: c.services.map((it) => [ITEMS[it.type].code, ITEMS[it.type].label, serviceInfo(c.roomOf(it.roomId), it).text]) } });
    if (c.hasUnits) {
      sections.push({
        heading: `Cabinet layout${fname}`, pageBreak: true, images: take(`Cabinet layout${fname}`),
        table: c.cabinets.length ? { cols: [{ title: 'No.', w: 0.6 }, { title: 'Unit', w: 10 }], rows: c.cabinets.map((it) => [c.nums.get(it.id), cabinetText(it)]) } : null,
      });
      if (c.panels.length) sections.push({ heading: 'Panels and fillers', level: 2, bullets: c.panels, paras: [settingsLine(plan.settings)] });
      if (c.appliances.length) sections.push({ heading: 'Appliances', level: 2, table: { cols: [{ title: 'Appliance', w: 4 }, { title: 'Size (mm)', w: 3 }], rows: c.appliances.map((it) => [ITEMS[it.type].label, `${mm(it.uw)} x ${mm(it.ud)}`]) } });
    }
  });
  if (plan.notes) sections.push({ heading: 'Notes', paras: [plan.notes] });
  sections.push({ paras: ['Drawn to scale from the measurements entered on site. Check measurements before ordering or building.'] });
  return {
    title: plan.kind === 'property' ? 'Floor Plan' : plan.kind === 'kitchen' ? 'Kitchen Plan' : 'Bathroom Plan', subtitle: addr.join(', '), footer: addr[0] || 'Floor plan', landscape: true,
    meta: [['Drawn by', job.surveyor], ['Created', fmtDateTime(job.created)], ['Floor area', floors.length ? sqm(planArea(plan)) : '']],
    sections,
  };
}

/** The Excel workbook: schedules for ordering and checking (room areas are live formulas). */
export function planWorkbook(job) {
  const plan = job.plan;
  const floors = collect(job);
  const head = (labels) => labels.map((v) => ({ v, s: 'head' }));
  const cell = (v, s = 'cell') => ({ v: v ?? '', s });
  const sheets = [];
  const addr = addressLines(job.address).join(', ');

  const S = [[{ v: 'Floor plan', s: 'title' }], [{ v: addr, s: 'note' }], [], [{ v: 'Drawn by', s: 'bold' }, cell(job.surveyor)], [{ v: 'Created', s: 'bold' }, cell(fmtDateTime(job.created))], [{ v: 'Total floor area', s: 'bold' }, cell(floors.length ? sqm(planArea(plan)) : '')]];
  if (plan.notes) S.push([{ v: 'Notes', s: 'bold' }, cell(plan.notes)]);
  S.push([{ v: settingsLine(plan.settings), s: 'note' }]);
  sheets.push({ name: 'Summary', cols: [{ w: 20 }, { w: 80 }], rows: S, landscape: false });

  // rooms with live area formulas
  const Rm = [head(['Floor', 'Room', 'Width (m)', 'Length (m)', 'Floor area (m²)', 'Perimeter (m)', 'Ceiling height (m)', 'Wall area (m²)'])];
  for (const c of floors) for (const r of c.floor.rooms) {
    const x = Rm.length + 1;
    const h = numOf(r.height);
    Rm.push([cell(c.floor.name), cell(r.name), { v: r.w / 100, s: 'inNum' }, { v: r.h / 100, s: 'inNum' },
      { v: (r.w * r.h) / 10000, f: `C${x}*D${x}`, s: 'num' }, { v: (2 * (r.w + r.h)) / 100, f: `2*(C${x}+D${x})`, s: 'num' },
      { v: h, s: 'inNum' }, h ? { v: ((2 * (r.w + r.h)) / 100) * h, f: `IF(G${x}="","",F${x}*G${x})`, s: 'num' } : { v: '', f: `IF(G${x}="","",F${x}*G${x})`, s: 'num' }]);
  }
  sheets.push({ name: 'Rooms', cols: [{ w: 16 }, { w: 24 }, { w: 12 }, { w: 12 }, { w: 16 }, { w: 14 }, { w: 18 }, { w: 14 }], rows: Rm, freeze: { row: 1 } });

  // doors, windows, radiators
  const O = [head(['Tag', 'Type', 'Floor', 'Room', 'Wall', 'Width (mm)', 'Height (mm)', 'Sill height (mm)', 'Door type', 'Hinged', 'From corner A', 'Distance A (mm)', 'From corner B', 'Distance B (mm)'])];
  for (const c of floors) for (const it of [...c.doors, ...c.windows, ...c.radiators]) {
    const room = c.roomOf(it.roomId);
    if (it.type === 'radiator') {
      const rw = radiatorWall(room, it);
      const [ca, cb] = wallCorners[rw.wall];
      O.push([cell(c.tags.get(it.id)), cell('Radiator'), cell(c.floor.name), cell(room.name), cell(WALL_NAMES[rw.wall]), { v: mm(Math.max(it.w, it.h)), s: 'num' }, cell(''), cell(''), cell(''), cell(''), cell(rw.gap <= 30 ? ca : ''), { v: rw.gap <= 30 ? mm(rw.a) : '', s: 'num' }, cell(rw.gap <= 30 ? cb : ''), { v: rw.gap <= 30 ? mm(rw.b) : '', s: 'num' }]);
      continue;
    }
    const g = openingGeometry(room, it);
    const [ca, cb] = wallCorners[it.wall];
    const door = it.type === 'door';
    O.push([cell(c.tags.get(it.id)), cell(door ? 'Door' : 'Window'), cell(c.floor.name), cell(room.name), cell(WALL_NAMES[it.wall]), { v: mm(it.size), s: 'inNum' },
      door ? cell('') : { v: mm(it.wh ?? 120), s: 'inNum' }, door ? cell('') : { v: mm(it.sill ?? 90), s: 'inNum' },
      cell(door ? ((it.leaves || 1) === 2 ? 'Double' : 'Single') : ''), cell(door && (it.leaves || 1) === 1 ? hingeSide(it) : ''),
      cell(ca), { v: mm(g.at), s: 'num' }, cell(cb), { v: mm(g.L.len - g.at - g.size), s: 'num' }]);
  }
  sheets.push({ name: 'Doors and windows', cols: [{ w: 7 }, { w: 10 }, { w: 14 }, { w: 20 }, { w: 9 }, { w: 12 }, { w: 12 }, { w: 15 }, { w: 11 }, { w: 9 }, { w: 14 }, { w: 15 }, { w: 14 }, { w: 15 }], rows: O, freeze: { row: 1 }, autoFilter: `A1:N${Math.max(2, O.length)}` });

  const V = [head(['Code', 'Service', 'Floor', 'Room', 'Where'])];
  for (const c of floors) for (const it of c.services) V.push([cell(ITEMS[it.type].code), cell(ITEMS[it.type].label), cell(c.floor.name), cell(c.roomOf(it.roomId).name), cell(serviceInfo(c.roomOf(it.roomId), it).text)]);
  if (V.length > 1) sheets.push({ name: 'Services', cols: [{ w: 8 }, { w: 24 }, { w: 14 }, { w: 20 }, { w: 80 }], rows: V, freeze: { row: 1 } });

  // cabinets: numbers match the drawing's key
  const C = [head(['No.', 'Floor', 'Room', 'Unit', 'Level', 'Width (mm)', 'Carcass depth (mm)', 'Overall depth (mm)', 'Type / doors', 'Blind end', 'Door (mm)', 'End panels', 'Description'])];
  for (const c of floors) for (const it of c.cabinets) {
    const d = ITEMS[it.type];
    const ends = d.space ? 'Both (in the space)' : it.endL && it.endR ? 'Both' : it.endL ? 'Left' : it.endR ? 'Right' : '';
    C.push([{ v: c.nums.get(it.id), s: 'num' }, cell(c.floor.name), cell(c.roomOf(it.roomId).name), cell(d.label), cell(d.run === 'wall' ? 'Wall' : 'Base / tall'), { v: mm(it.uw), s: 'num' },
      { v: it.cd != null ? mm(it.cd) : '', s: 'num' }, { v: mm(it.ud), s: 'num' }, cell(d.styles ? it.style || 'door' : d.patterns ? `doors ${it.pattern || ''}` : d.space ? it.appliance || '' : ''), cell(d.blind ? it.hand || 'right' : ''), { v: d.blind ? mm(it.door) : '', s: 'num' }, cell(ends), cell(cabinetText(it))]);
  }
  if (C.length > 1) sheets.push({ name: 'Cabinets', cols: [{ w: 6 }, { w: 14 }, { w: 18 }, { w: 24 }, { w: 12 }, { w: 12 }, { w: 16 }, { w: 16 }, { w: 18 }, { w: 10 }, { w: 11 }, { w: 18 }, { w: 70 }], rows: C, freeze: { row: 1 }, autoFilter: `A1:M${C.length}` });

  const P = [head(['Item', 'Floor'])];
  for (const c of floors) for (const t of c.panels) P.push([cell(t), cell(c.floor.name)]);
  const Ap = [];
  for (const c of floors) for (const it of c.appliances) Ap.push([cell(c.floor.name), cell(c.roomOf(it.roomId).name), cell(ITEMS[it.type].label), { v: mm(it.uw), s: 'num' }, { v: mm(it.ud), s: 'num' }]);
  if (P.length > 1) sheets.push({ name: 'Panels and fillers', cols: [{ w: 70 }, { w: 14 }], rows: P });
  if (Ap.length) sheets.push({ name: 'Appliances', cols: [{ w: 14 }, { w: 20 }, { w: 24 }, { w: 12 }, { w: 12 }], rows: [head(['Floor', 'Room', 'Appliance', 'Width (mm)', 'Depth (mm)']), ...Ap], freeze: { row: 1 } });
  return { sheets };
}

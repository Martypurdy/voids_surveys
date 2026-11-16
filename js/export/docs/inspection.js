// Inspection reports (Empty home inspection, Ready to let) as Word and Excel. Collects the same facts the PDF
// prints, so the three formats agree; the layout is an editable document, not a copy of the PDF pages.
import { addressLines, fmtDate, fmtDateTime, worksSummary, roomStatus, roomAreas, serviceTitle, hasMeterDoor, isRtl, formOf } from '../../model.js';
import { UNITS, defectInfo, isSorCode, qtyText } from '../../data/parts.js';
import { FEATURES, featuresOf } from '../../data/features.js';
import { getLibrary } from '../../sor.js';
import { materialGroups, materialTotals, matQty } from '../../materials.js';

const numOf = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Everything the report says, gathered once. */
export async function collectInspection(job, { includeCode = false } = {}) {
  const rtl = isRtl(job);
  const showCodes = Boolean(await getLibrary());
  const schedule = new Map();

  const areaOf = (room, kind, title) => {
    const features = [];
    for (const part of featuresOf(room, kind)) {
      const p = room.parts?.[part.key];
      if (!p?.state) continue;
      if (p.state === 'ok') { features.push({ label: part.label, ok: true, defects: [], notes: '', photos: p.photos || [] }); continue; }
      const defects = [];
      for (const d of p.defects || []) {
        const def = defectInfo(FEATURES[part.key] ? part : null, d);
        defects.push({ label: def.label, qty: d.qty ? qtyText(d.qty, def.unit) : '', rawQty: d.qty, unit: def.unit, code: showCodes && isSorCode(d.id) ? String(d.id) : '' });
        const key = `${part.label}|${d.id}`;
        const row = schedule.get(key) || { part: part.label, label: def.label, unit: def.unit, code: showCodes && isSorCode(d.id) ? String(d.id) : '', total: 0, rooms: new Set() };
        row.total += parseFloat(String(d.qty).replace(',', '.')) || (UNITS[def.unit]?.count ? 1 : 0);
        row.rooms.add(room.name);
        schedule.set(key, row);
      }
      features.push({ label: part.label, ok: false, defects, notes: p.notes || '', photos: p.photos || [] });
    }
    const st = roomStatus(room, featuresOf(room, kind));
    const a = roomAreas(room.size || {});
    return {
      name: title || room.name || 'Untitled', kind, features, notes: room.notes || '', photos: room.photos || [],
      status: rtl ? (room.done ? 'Works complete' : 'Not complete') : st.state === 'ok' ? 'No work' : st.works ? 'Work needed' : st.checked < st.total ? 'Not finished' : '',
      size: room.size || {}, areas: kind === 'rooms' && a.ceiling ? a : null, done: room.done,
    };
  };

  const rooms = job.rooms.map((r) => areaOf(r, 'rooms'));
  const externals = job.externals.map((r) => areaOf(r, 'externals'));
  const security = job.security && !rtl && featuresOf(job.security, 'security').some((f) => job.security.parts?.[f.key]?.state)
    ? areaOf(job.security, 'security', 'Security - doors & windows') : null;

  const locks = job.works.cylinders || [];
  const alerts = [];
  const fobDefect = [...job.rooms, ...job.externals, job.security].filter(Boolean)
    .some((r) => Object.values(r.parts || {}).some((p) => (p.defects || []).some((d) => d.id === 'CDR-13' || /fob/i.test(d.d || ''))));
  if (!rtl && locks.includes('Communal key')) alerts.push('ACTION REQUIRED: Communal keys required – the operative must arrange keys to be cut or a communal lock change with the manager before works are complete.');
  if (!rtl && (locks.includes('Communal fob') || fobDefect)) alerts.push('ACTION REQUIRED: COMMUNAL FOB REQUIRED – arrange with the fob team before the property is handed over.');

  const ks = job.keySafe;
  const meters = job.meters.filter((m) => m.location || m.photos.length || m.serial || m.reading || m.type || m.supply || m.doorDamaged || m.notes)
    .map((m) => ({
      title: serviceTitle(m.utility), location: m.location, type: m.type, supply: m.supply,
      prepay: m.type === 'Prepayment' && m.balance !== '' ? `${m.balanceType} £${m.balance}` : '', serial: m.serial, reading: m.reading,
      date: m.reading ? fmtDate(m.date) : '', door: hasMeterDoor(m.utility) && m.doorDamaged ? (m.doorDamaged === 'yes' ? 'Damaged' : 'Not damaged') : '', notes: m.notes, photos: m.photos,
    }));
  const serviceWorks = job.meters.filter((m) => hasMeterDoor(m.utility) && m.doorDamaged === 'yes')
    .map((m) => `${serviceTitle(m.utility)} box door damaged${m.notes ? ` - ${m.notes}` : ''}${m.location ? ` (${m.location})` : ''}`);

  const groups = materialGroups(job).map((g) => ({ ...g, items: g.items.filter((it) => it.on) })).filter((g) => g.items.length);
  const materialTotalsList = materialTotals(groups);

  return {
    rtl, showCodes, includeCode, form: formOf(job), rooms, externals, security, alerts, schedule: [...schedule.values()], serviceWorks,
    works: rtl ? [] : worksSummary(job.works, 'property'), secWorks: worksSummary(job.works, 'security'),
    keySafe: { location: ks.location, code: ks.code ? (includeCode ? ks.code : 'Withheld from this report') : 'Not recorded', gps: ks.lat != null ? `${ks.lat}, ${ks.lng}${ks.accuracy != null ? ` (±${ks.accuracy} m)` : ''}` : '', photos: ks.photos, any: Boolean(ks.location || ks.code || ks.lat != null || ks.photos.length) },
    meters, legionella: job.legionella || { done: false, notes: '', photos: [] },
    gifts: Object.entries(job.gifted?.selected || {}).filter(([, r]) => r.length),
    groups, materialTotals: materialTotalsList,
  };
}

const statusLine = (areas) => {
  if (!areas.length) return '';
  const n = (f) => areas.filter(f).length;
  return `${areas.length} surveyed - ${n((a) => a.status === 'Work needed')} need work, ${n((a) => a.status === 'No work')} all OK${n((a) => a.status === 'Not finished') ? `, ${n((a) => a.status === 'Not finished')} not finished` : ''}`;
};
const defectText = (d) => `${d.label}${d.qty ? `  ${d.qty}` : ''}${d.code ? `  [${d.code}]` : ''}`;

/** The Word document. */
export function inspectionModel(job, c) {
  const addr = addressLines(job.address);
  const prop = job.property;
  const sections = [];
  const photoCaps = (list, caption) => (list || []).map((id) => ({ id, caption }));

  c.alerts.forEach((t) => sections.push({ paras: [t] }));
  const summary = [];
  if (c.rtl) {
    for (const [label, areas] of [['Rooms', c.rooms], ['Outside areas', c.externals]]) if (areas.length) summary.push([label, `${areas.length} checked - ${areas.filter((a) => a.done).length} works complete${areas.some((a) => !a.done) ? `, ${areas.filter((a) => !a.done).length} not complete` : ''}`]);
  } else {
    for (const [label, areas] of [['Rooms', c.rooms], ['Outside areas', c.externals]]) if (areas.length) {
      summary.push([label, statusLine(areas)]);
      const need = areas.filter((a) => a.status === 'Work needed').map((a) => a.name);
      if (need.length) summary.push(['Work needed in', need.join(', ')]);
    }
  }
  if (summary.length) sections.push({ heading: 'Summary', kv: summary });

  // property
  const propKv = [['Type', prop.type], ['Style', prop.style], ['Bedrooms', prop.bedrooms], ['Storeys', prop.storeys], ['Floor level', prop.floor]];
  const rtlChecks = c.rtl ? [['Clearance', job.rtl.clearance], ['Cleaning', job.rtl.cleaning]] : [];
  if (propKv.some(([, v]) => v) || c.works.length || prop.photos.length || rtlChecks.some(([, x]) => x.done || x.notes)) {
    sections.push({
      heading: 'Property', kv: propKv, paras: [prop.notes].filter(Boolean),
      bullets: c.works.map(([l, d]) => `${l}${d ? `: ${d}` : ''}`),
      photos: photoCaps(prop.photos, 'Property'),
    });
    for (const [label, x] of rtlChecks) if (x.done || x.notes) sections.push({ heading: label, level: 2, kv: [['Completed', x.done ? 'Yes' : 'Not ticked'], ['Notes', x.notes]] });
  }
  if (job.keys.length) {
    sections.push({
      heading: c.rtl ? 'Keys' : 'Key register',
      table: c.rtl
        ? { cols: [{ title: 'Key type', w: 3 }, { title: 'Quantity', w: 1 }], rows: job.keys.map((k) => [k.keySet, k.quantity]) }
        : { cols: [{ title: 'Key set', w: 3 }, { title: 'Qty', w: 0.8 }, { title: 'Received from', w: 2 }, { title: 'Issued to', w: 2 }, { title: 'Date', w: 1.6 }], rows: job.keys.map((k) => [k.keySet, k.quantity, k.receivedFrom, k.issuedTo, fmtDate(k.date)]) },
      photos: job.keys.flatMap((k) => photoCaps(k.photos, `Keys - ${k.keySet || 'key set'}`)),
    });
  }
  if (c.keySafe.any) {
    sections.push({ heading: 'Key safe', kv: [['Location', c.keySafe.location], ['Code', c.keySafe.code], ['GPS', c.keySafe.gps]], photos: photoCaps(c.keySafe.photos, 'Key safe') });
  }
  if (c.secWorks.length && !c.rtl) sections.push({ heading: 'Security and access works', bullets: c.secWorks.map(([l, d]) => `${l}${d ? `: ${d}` : ''}`) });

  // services
  const svc = [];
  if (job.heating.length) svc.push(['Heating type', job.heating.join(', ')]);
  sections.push({ heading: 'Services', kv: svc });
  for (const m of c.meters) {
    sections.push({
      heading: m.title, level: 2,
      kv: [['Location', m.location], ['Type', m.type], ['Supply', m.supply], ['Prepay balance', m.prepay], ['Serial number', m.serial], ['Reading', m.reading], ['Date read', m.date], ['Meter box door', m.door], ['Notes', m.notes]],
      photos: photoCaps(m.photos, m.title),
    });
  }
  sections.push({ heading: 'Legionella flush', level: 2, kv: [['Flush', c.legionella.done ? 'Completed – form left on site' : 'Not recorded'], ['Notes', c.legionella.notes]], photos: photoCaps(c.legionella.photos, 'Legionella flush form') });

  // rooms
  const areaSection = (a, heading) => {
    if (c.rtl) return { heading: `${a.name} - ${a.status}`, level: 2, photos: photoCaps(a.photos, a.name) };
    const sz = a.areas ? `Size ${a.size.length} x ${a.size.width} x ${a.size.height} m - ceiling/floor ${a.areas.ceiling} m², walls ${a.areas.walls} m², skirting ${a.areas.perimeter} m` : '';
    return {
      heading: `${a.name}${a.status ? ` - ${a.status}` : ''}`, level: 2, paras: [sz, a.notes].filter(Boolean),
      table: a.features.length ? { cols: [{ title: 'Feature', w: 2 }, { title: 'Result', w: 4.5 }, { title: 'Notes', w: 3 }], rows: a.features.map((f) => [f.label, f.ok ? 'OK - no work required' : f.defects.map(defectText).join('\n'), f.notes]) } : null,
      photos: [...photoCaps(a.photos, a.name), ...a.features.flatMap((f) => photoCaps(f.photos, `${a.name} - ${f.label}`))],
    };
  };
  if (c.security) sections.push(areaSection(c.security));
  if (c.rooms.length) { sections.push({ heading: 'Rooms' }); c.rooms.forEach((a) => sections.push(areaSection(a))); }
  if (c.externals.length) { sections.push({ heading: 'Externals' }); c.externals.forEach((a) => sections.push(areaSection(a))); }

  // gifted, voucher, appliances
  if (c.rtl && job.rtl.voucher?.required) {
    const v = job.rtl.voucher;
    sections.push({ heading: 'Decorating voucher', kv: [['Required', v.required === 'yes' ? 'Yes' : 'No'], ['Value', v.required === 'yes' && v.value ? `£${v.value}` : '']], photos: v.required === 'yes' ? photoCaps(v.photos, 'Decorating card') : [] });
  }
  if (c.gifts.length) sections.push({ heading: 'Gifted items', paras: ['Items left for the incoming tenant.'], kv: c.gifts.map(([item, r]) => [item, r.join(', ')]) });

  // schedule of works and materials
  if (c.schedule.length || c.serviceWorks.length || c.secWorks.length) {
    const rows = c.schedule.map((r) => {
      const total = Math.round(r.total * 10) / 10;
      return [r.part, `${r.label}${r.code ? `  [${r.code}]` : ''}`, qtyText(total, r.unit), [...r.rooms].join(', ')];
    });
    sections.push({
      heading: 'Schedule of works', paras: ['All works recorded in this survey, totalled by feature.'],
      bullets: [...c.secWorks.map(([l, d]) => `Security & access: ${l}${d ? `: ${d}` : ''}`), ...c.serviceWorks.map((t) => `Services: ${t}`)],
      table: rows.length ? { cols: [{ title: 'Feature', w: 2 }, { title: 'Work', w: 4.5 }, { title: 'Quantity', w: 1.4 }, { title: 'Rooms', w: 3 }], rows } : null,
    });
  }
  if (!c.rtl && c.groups.length) {
    sections.push({ heading: 'Materials list', paras: ['Rough list of materials, grouped by room. Standard items are changed in every void.'] });
    for (const g of c.groups) sections.push({ heading: g.name, level: 2, table: { cols: [{ title: 'Item', w: 5 }, { title: 'Quantity', w: 1.5 }], rows: g.items.map((it) => [it.name, matQty(it.q, it.unit)]) } });
    sections.push({ heading: 'Totals to order', level: 2, table: { cols: [{ title: 'Item', w: 5 }, { title: 'Quantity', w: 1.5 }], rows: c.materialTotals.map((t) => [t.name, matQty(t.q, t.unit)]) } });
  }

  // sign off
  const ap = c.rtl ? job.rtl.appliances : null;
  const sg = job.signature || {};
  if ((ap && (ap.any || ap.notes || ap.photos.length)) || sg.image || sg.name) {
    const images = [];
    if (sg.image) {
      const b64 = String(sg.image).split(',')[1];
      if (b64) images.push({ bytes: Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)), w: 3, h: 1.2, type: 'image/png', widthCm: 6, caption: 'Signature' });
    }
    sections.push({
      heading: 'Sign off',
      kv: [...(ap ? [['Appliances to be maintained', ap.any === 'yes' ? 'Yes' : ap.any === 'no' ? 'No' : ''], ['Appliances', ap.any === 'yes' ? ap.list.join(', ') : ''], ['Notes', ap.notes]] : []), ['Name', sg.name], ['Signed', sg.name || sg.image ? (sg.date ? fmtDateTime(sg.date) : 'Not signed') : '']],
      images, photos: ap ? photoCaps(ap.photos, 'Appliances') : [],
    });
  }

  return {
    title: c.form.pdfTitle, subtitle: addr.join(', ') || 'Address not recorded', footer: addr[0] || c.form.title,
    meta: [['Surveyor', job.surveyor], ['Survey started', fmtDateTime(job.created)], ['Report generated', fmtDateTime(new Date().toISOString())], ['Location', job.address.lat != null ? `${job.address.lat}, ${job.address.lng}` : '']],
    sections: sections.filter((s) => s.heading || s.paras?.length),
  };
}

/** The Excel workbook: tables you can filter and total (room areas are live formulas). */
export function inspectionWorkbook(job, c) {
  const addr = addressLines(job.address).join(', ');
  const head = (labels) => labels.map((v) => ({ v, s: 'head' }));
  const cell = (v, s = 'cell') => ({ v: v ?? '', s });
  const sheets = [];

  const S = [[{ v: c.form.pdfTitle, s: 'title' }], [{ v: addr, s: 'note' }], []];
  for (const [l, v] of [['Surveyor', job.surveyor], ['Survey started', fmtDateTime(job.created)], ['Report generated', fmtDateTime(new Date().toISOString())], ['Location', job.address.lat != null ? `${job.address.lat}, ${job.address.lng}` : ''], ['Property type', job.property.type], ['Heating', job.heating.join(', ')],
    ['Rooms', c.rtl ? '' : statusLine(c.rooms)], ['Outside areas', c.rtl ? '' : statusLine(c.externals)]]) if (v) S.push([{ v: l, s: 'bold' }, cell(v)]);
  c.alerts.forEach((t) => S.push([{ v: t, s: 'bold' }]));
  sheets.push({ name: 'Summary', cols: [{ w: 22 }, { w: 80 }], rows: S, landscape: false });

  if (!c.rtl) {
    const areas = [...(c.security ? [c.security] : []), ...c.rooms, ...c.externals];
    const D = [head(['Area', 'Type', 'Feature', 'Result', 'Work / defect', 'Qty', 'SOR code', 'Notes'])];
    for (const a of areas) {
      const type = a.kind === 'rooms' ? 'Room' : a.kind === 'externals' ? 'Outside' : 'Security';
      for (const f of a.features) {
        if (f.ok) D.push([cell(a.name), cell(type), cell(f.label), cell('OK'), cell('No work required'), cell(''), cell(''), cell(f.notes)]);
        else for (const d of f.defects) D.push([cell(a.name), cell(type), cell(f.label), cell('Work needed'), cell(d.label), cell(d.qty), cell(d.code), cell(f.notes)]);
      }
    }
    sheets.push({ name: 'Defects', cols: [{ w: 22 }, { w: 10 }, { w: 20 }, { w: 13 }, { w: 48 }, { w: 10 }, { w: 10 }, { w: 40 }], rows: D, freeze: { row: 1 }, autoFilter: `A1:H${Math.max(2, D.length)}` });

    const Rm = [head(['Area', 'Type', 'Status', 'Length (m)', 'Width (m)', 'Height (m)', 'Ceiling / floor (m²)', 'Walls (m²)', 'Skirting (m)', 'Notes'])];
    [...c.rooms, ...c.externals].forEach((a) => {
      const r = Rm.length + 1;
      const hasSize = a.kind === 'rooms' && (numOf(a.size.length) || numOf(a.size.width));
      Rm.push([cell(a.name), cell(a.kind === 'rooms' ? 'Room' : 'Outside'), cell(a.status),
        { v: numOf(a.size.length), s: 'inNum' }, { v: numOf(a.size.width), s: 'inNum' }, { v: numOf(a.size.height), s: 'inNum' },
        hasSize ? { v: a.areas?.ceiling ?? 0, f: `ROUND(D${r}*E${r},1)`, s: 'num' } : cell(''), hasSize ? { v: a.areas?.walls ?? 0, f: `ROUND(2*(D${r}+E${r})*F${r},1)`, s: 'num' } : cell(''), hasSize ? { v: a.areas?.perimeter ?? 0, f: `ROUND(2*(D${r}+E${r}),1)`, s: 'num' } : cell(''),
        cell(a.notes)]);
    });
    sheets.push({ name: 'Rooms', cols: [{ w: 24 }, { w: 10 }, { w: 14 }, { w: 11 }, { w: 11 }, { w: 11 }, { w: 18 }, { w: 12 }, { w: 12 }, { w: 40 }], rows: Rm, freeze: { row: 1 } });

    if (c.schedule.length) {
      const Sc = [head(['Feature', 'Work', 'Total quantity', 'SOR code', 'Rooms'])];
      c.schedule.forEach((r) => Sc.push([cell(r.part), cell(r.label), cell(qtyText(Math.round(r.total * 10) / 10, r.unit)), cell(r.code), cell([...r.rooms].join(', '))]));
      sheets.push({ name: 'Schedule of works', cols: [{ w: 22 }, { w: 50 }, { w: 16 }, { w: 10 }, { w: 40 }], rows: Sc, freeze: { row: 1 } });
    }
  } else {
    const R = [head(['Area', 'Type', 'Works complete'])];
    [...c.rooms, ...c.externals].forEach((a) => R.push([cell(a.name), cell(a.kind === 'rooms' ? 'Room' : 'Outside'), cell(a.done ? 'Yes' : 'Not complete')]));
    sheets.push({ name: 'Rooms', cols: [{ w: 28 }, { w: 12 }, { w: 18 }], rows: R, freeze: { row: 1 } });
  }

  const Sv = [head(['Service', 'Location', 'Type', 'Supply', 'Prepay balance', 'Serial number', 'Reading', 'Date read', 'Meter box door', 'Notes'])];
  c.meters.forEach((m) => Sv.push([cell(m.title), cell(m.location), cell(m.type), cell(m.supply), cell(m.prepay), cell(m.serial), cell(m.reading), cell(m.date), cell(m.door), cell(m.notes)]));
  Sv.push([cell('Legionella flush'), cell(''), cell(''), cell(''), cell(''), cell(''), cell(''), cell(''), cell(''), cell(`${c.legionella.done ? 'Completed – form left on site' : 'Not recorded'}${c.legionella.notes ? ` - ${c.legionella.notes}` : ''}`)]);
  sheets.push({ name: 'Services', cols: [{ w: 18 }, { w: 24 }, { w: 12 }, { w: 10 }, { w: 14 }, { w: 16 }, { w: 12 }, { w: 12 }, { w: 14 }, { w: 40 }], rows: Sv, freeze: { row: 1 } });

  if (job.keys.length) {
    const K = [head(['Key set', 'Qty', 'Received from', 'Issued to', 'Date'])];
    job.keys.forEach((k) => K.push([cell(k.keySet), { v: numOf(k.quantity) ?? k.quantity, s: 'num' }, cell(k.receivedFrom), cell(k.issuedTo), cell(fmtDate(k.date))]));
    sheets.push({ name: 'Keys', cols: [{ w: 28 }, { w: 8 }, { w: 22 }, { w: 22 }, { w: 14 }], rows: K, freeze: { row: 1 } });
  }
  if (!c.rtl && c.groups.length) {
    const M = [head(['Room / area', 'Item', 'Quantity'])];
    c.groups.forEach((g) => g.items.forEach((it) => M.push([cell(g.name), cell(it.name), cell(matQty(it.q, it.unit))])));
    M.push([]);
    M.push([{ v: 'Totals to order', s: 'bold' }]);
    c.materialTotals.forEach((t) => M.push([cell(''), cell(t.name), cell(matQty(t.q, t.unit))]));
    sheets.push({ name: 'Materials', cols: [{ w: 26 }, { w: 40 }, { w: 14 }], rows: M, freeze: { row: 1 } });
  }
  return { sheets };
}

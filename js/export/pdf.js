// PDF report (jsPDF, loaded on demand from /vendor).
import { addressLines, jobTitle, fmtDate, fmtDateTime, slug, todayLocal, allPhotoIds, worksSummary, roomStatus, roomAreas, serviceTitle, hasMeterDoor, isRtl, isPrice, isPlan, formOf } from '../model.js';
import { fileBase } from '../properties.js';
import { ITEMS, roomFigures, floorArea, planArea, metres, sqm, openingGeometry, bounds, legend, cornerPoints, cabinetNumbers, cabinetText, frontEdge, cornerLabelPoint, blindGeometry, endPanels, panelLines, refreshPosts, refreshDepths, settingsLine, cabinetShapes, badgePoint, featureTags, describeFeature, serviceInfo } from '../plan.js';
import { sheetTotals, lineTotals, isBlankLine, gbp, money, LABOUR_BASIS } from '../pricing.js';
import { UNITS, defectInfo, isSorCode, qtyText as unitQty } from '../data/parts.js';
import { FEATURES, featuresOf } from '../data/features.js';
import { loadPhotos, resizeImage } from '../photos.js';
import { getLibrary } from '../sor.js';
import { materialGroups, materialTotals, matQty } from '../materials.js';

// Photos are re-encoded for the PDF so reports stay emailable. Each photo is stored once
// and drawn twice: small in its section and large (about A5) on the Photos pages at the end.
const PDF_PHOTO_MAX = 1400;
const PDF_PHOTO_QUALITY = 0.7;

let jsPdfPromise = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  jsPdfPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf);
    s.onerror = () => {
      jsPdfPromise = null;
      reject(new Error('Could not load the PDF library'));
    };
    document.head.append(s);
  });
  return jsPdfPromise;
}

export function pdfFilename(job) {
  return `${fileBase(job)} - ${todayLocal()}.pdf`;
}

// The built-in PDF fonts only cover Latin-1, so normalise common "smart" characters.
const clean = (v) => String(v ?? '')
  .replace(/[‘’‛]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/…/g, '...')
  .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');

const COND_RGB = {
  Good: [30, 125, 58], Fair: [168, 107, 0], Poor: [179, 38, 30], 'N/A': [107, 116, 128],
  'No work': [30, 125, 58], 'Work needed': [198, 40, 40], 'Not finished': [200, 130, 0],
  'Works complete': [30, 125, 58], 'Not complete': [200, 130, 0],
};
const BRAND = [31, 95, 139];

/** Build the report. Returns a PDF Blob. */
export async function buildPdf(job, { includeCode = false, onProgress = () => {} } = {}) {
  const { jsPDF } = await loadJsPDF();
  // SOR codes are printed only while an SOR library is loaded on this device.
  const showCodes = Boolean(await getLibrary());
  const land = isPlan(job); // floor plans print landscape: key on the left, plan on the right
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: land ? 'landscape' : 'portrait', compress: true });
  const rtl = isRtl(job); // Ready to let form

  const W = land ? 297 : 210, H = land ? 210 : 297, M = 15, CW = W - 2 * M, BOTTOM = H - M - 6;
  let y = M;

  // ---------- primitives ----------
  const lineH = (size) => size * 0.3528 * 1.3;
  const ensure = (need) => {
    if (y + need > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const font = (size, style = 'normal', rgb = [0, 0, 0]) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...rgb);
  };
  const para = (text, { size = 10, style = 'normal', x = M, width = CW, rgb } = {}) => {
    if (!text) return;
    font(size, style, rgb);
    const lh = lineH(size);
    for (const line of doc.splitTextToSize(clean(text), width)) {
      ensure(lh);
      doc.text(line, x, y + lh * 0.75);
      y += lh;
    }
  };
  const heading = (text) => {
    ensure(22); // keep heading with some content
    y += 3;
    font(14, 'bold', BRAND);
    doc.text(text, M, y + 5);
    y += 7.5;
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 4;
  };
  const subheading = (text, condition) => {
    ensure(16);
    font(11.5, 'bold');
    doc.text(clean(text), M, y + 4.5);
    if (condition) {
      font(8.5, 'bold', [255, 255, 255]);
      const tw = doc.getTextWidth(condition) + 5;
      doc.setFillColor(...(COND_RGB[condition] || COND_RGB['N/A']));
      doc.roundedRect(W - M - tw, y + 0.5, tw, 5.5, 1.5, 1.5, 'F');
      doc.text(condition, W - M - tw + 2.5, y + 4.4);
    }
    y += 7.5;
  };
  /** Label/value rows. Empty values are skipped unless keepEmpty. */
  const kv = (rows, { labelW = 42 } = {}) => {
    for (const [label, value] of rows) {
      if (value == null || value === '') continue;
      font(10, 'normal');
      const lines = doc.splitTextToSize(clean(value), CW - labelW);
      const lh = lineH(10);
      ensure(lh * Math.min(lines.length, 3));
      font(10, 'bold', [80, 88, 96]);
      doc.text(label, M, y + lh * 0.75);
      font(10, 'normal');
      for (const line of lines) {
        ensure(lh);
        doc.text(line, M + labelW, y + lh * 0.75);
        y += lh;
      }
      y += 0.8;
    }
  };

  // ---------- photos ----------
  let photoCount = 0;
  const totalPhotos = allPhotoIds(job).length;
  const imgCache = new Map(); // photo id -> { bytes, w, h }
  /** The photo, resized once for this report. */
  const pdfImage = async (rec) => {
    if (!imgCache.has(rec.id)) {
      onProgress(`Adding photo ${++photoCount} of ${totalPhotos}…`);
      const small = await resizeImage(rec.blob, PDF_PHOTO_MAX, PDF_PHOTO_QUALITY);
      imgCache.set(rec.id, { bytes: new Uint8Array(await small.blob.arrayBuffer()), w: small.w, h: small.h });
    }
    return imgCache.get(rec.id);
  };
  const photoGrid = async (ids) => {
    if (!ids?.length) return;
    const recs = await loadPhotos(ids);
    const cols = 3, gap = 4;
    const cellW = (CW - gap * (cols - 1)) / cols;
    const maxH = 52;
    y += 1.5;
    for (let i = 0; i < recs.length; i += cols) {
      const row = [];
      for (const rec of recs.slice(i, i + cols)) {
        const img = await pdfImage(rec);
        const s = Math.min(cellW / img.w, maxH / img.h);
        row.push({ bytes: img.bytes, id: rec.id, w: img.w * s, h: img.h * s });
      }
      const rowH = Math.max(...row.map((r) => r.h));
      ensure(rowH + gap);
      row.forEach((r, j) => {
        const x = M + j * (cellW + gap) + (cellW - r.w) / 2;
        doc.addImage(r.bytes, 'JPEG', x, y, r.w, r.h, `photo-${r.id}`, 'NONE');
      });
      y += rowH + gap;
    }
  };

  const itemSection = async (title, items) => {
    if (!items.length) return;
    heading(title);
    for (const it of items) {
      subheading(it.name || 'Untitled', it.condition);
      para(it.notes, { size: 10 });
      await photoGrid(it.photos);
      y += 3;
    }
  };

  // ---------- rooms: parts & defects, plus schedule of works ----------
  const schedule = new Map(); // key -> { part, label, unit, id, total, rooms: Set }
  // PDF fonts are Latin-1: the multiply sign and superscript 2 are both covered.
  const qtyText = (qty, unit) => unitQty(qty, unit);

  /** Each checked feature of a room / area / Security: OK, or its defects (added to the schedule). */
  const featureBlocks = async (room, kind) => {
    for (const part of featuresOf(room, kind)) {
      const p = room.parts?.[part.key];
      if (!p?.state) continue;
      if (p.state === 'ok') {
        para(`${part.label}: OK - no work required`, { size: 10 });
        continue;
      }
      ensure(lineH(10) * 3); // keep the feature heading with its first defect
      para(`${part.label}:`, { size: 10, style: 'bold' });
      for (const d of p.defects) {
        const def = defectInfo(FEATURES[part.key] ? part : null, d);
        para(`-  ${def.label}${d.qty ? `  ${qtyText(d.qty, def.unit)}` : ''}${showCodes && isSorCode(d.id) ? `   [${d.id}]` : ''}`, { size: 10, x: M + 4, width: CW - 4 });
        const key = `${part.label}|${d.id}`;
        const row = schedule.get(key) || { part: part.label, label: def.label, unit: def.unit, id: d.id, total: 0, rooms: new Set() };
        row.total += parseFloat(String(d.qty).replace(',', '.')) || (UNITS[def.unit]?.count ? 1 : 0);
        row.rooms.add(room.name);
        schedule.set(key, row);
      }
      if (p.notes) para(`Notes: ${p.notes}`, { size: 9.5, x: M + 4, width: CW - 4, rgb: [70, 78, 86] });
      await photoGrid(p.photos);
    }
  };

  const areaBadge = (room, kind) => {
    const s = roomStatus(room, featuresOf(room, kind));
    if (s.state === 'todo' && room.condition) return room.condition; // older survey
    return s.state === 'ok' ? 'No work' : s.works ? 'Work needed' : s.checked < s.total ? 'Not finished' : '';
  };

  /** Room / area title: shaded bar with a bigger, bolder name, and its status badge. */
  const roomTitle = (text, condition) => {
    ensure(30);
    const hgt = 9;
    doc.setFillColor(228, 236, 244);
    doc.rect(M, y, CW, hgt, 'F');
    doc.setFillColor(...BRAND);
    doc.rect(M, y, 1.6, hgt, 'F');
    font(13.5, 'bold', BRAND);
    doc.text(clean(text), M + 4, y + 6.3);
    if (condition) {
      font(8.5, 'bold', [255, 255, 255]);
      const tw = doc.getTextWidth(condition) + 5;
      doc.setFillColor(...(COND_RGB[condition] || COND_RGB['N/A']));
      doc.roundedRect(W - M - tw - 2, y + 1.75, tw, 5.5, 1.5, 1.5, 'F');
      doc.text(condition, W - M - tw + 0.5, y + 5.65);
    }
    y += hgt + 3;
  };
  /** Line dividing one room / area from the next. */
  const divider = () => {
    y += 2;
    ensure(4);
    doc.setDrawColor(150, 160, 170);
    doc.setLineWidth(0.4);
    doc.line(M, y, W - M, y);
    y += 5;
  };

  /** Rooms or outside areas. */
  const roomsSection = async (title, areas, kind) => {
    if (!areas.length) return;
    heading(title);
    for (const [i, room] of areas.entries()) {
      if (i) divider();
      if (rtl) {
        roomTitle(room.name || 'Untitled', room.done ? 'Works complete' : 'Not complete');
        await photoGrid(room.photos);
        y += 2;
        continue;
      }
      roomTitle(room.name || 'Untitled', areaBadge(room, kind));
      const a = roomAreas(room.size);
      if (kind === 'rooms' && a.ceiling) para(`Size ${room.size.length} x ${room.size.width} x ${room.size.height} m  -  ceiling/floor ${a.ceiling} m², walls ${a.walls} m², skirting ${a.perimeter} m`, { size: 9, rgb: [90, 98, 106] });
      await featureBlocks(room, kind);
      para(room.notes, { size: 10 });
      await photoGrid(room.photos);
      y += 2;
    }
  };

  // ----- Must-action alerts: communal key (red), communal fob (amber) -----
  const alerts = [];
  const locks = job.works.cylinders || [];
  const fobDefect = [...job.rooms, ...job.externals, job.security].filter(Boolean)
    .some((r) => Object.values(r.parts || {}).some((p) => (p.defects || []).some((d) => d.id === 'CDR-13' || /fob/i.test(d.d || ''))));
  if (!rtl && locks.includes('Communal key')) {
    alerts.push({ level: 'red', text: 'Communal keys required – Operative must arrange keys to be cut or communal lock change with manager before works are complete.' });
  }
  if (!rtl && (locks.includes('Communal fob') || fobDefect)) {
    alerts.push({ level: 'amber', text: 'COMMUNAL FOB REQUIRED - arrange with the fob team before the property is handed over.' });
  }
  const ALERT_COLOURS = {
    red: { fill: [253, 227, 225], line: [198, 40, 40], title: [198, 40, 40], text: [140, 29, 22] },
    amber: { fill: [255, 241, 214], line: [224, 155, 26], title: [176, 106, 0], text: [122, 72, 0] },
  };
  const alertBox = ({ level, text }) => {
    const c = ALERT_COLOURS[level];
    font(10.5, 'bold');
    const lines = doc.splitTextToSize(clean(text), CW - 12);
    const hgt = lines.length * lineH(10.5) + 10;
    ensure(hgt + 4);
    doc.setFillColor(...c.fill);
    doc.setDrawColor(...c.line);
    doc.setLineWidth(1);
    doc.roundedRect(M, y, CW, hgt, 2, 2, 'FD');
    font(9, 'bold', c.title);
    doc.text('ACTION REQUIRED', M + 6, y + 5.5);
    font(10.5, 'bold', c.text);
    lines.forEach((l, i) => doc.text(l, M + 6, y + 10 + i * lineH(10.5)));
    y += hgt + 4;
  };

  const scheduleSection = () => {
    const secWorksList = worksSummary(job.works, 'security');
    // Damaged gas / electric meter box doors.
    const serviceWorks = job.meters.filter((m) => hasMeterDoor(m.utility) && m.doorDamaged === 'yes')
      .map((m) => `${serviceTitle(m.utility)} box door damaged${m.notes ? ` - ${m.notes}` : ''}${m.location ? `   (${m.location})` : ''}`);
    if (!schedule.size && !alerts.length && !secWorksList.length && !serviceWorks.length) return;
    heading('Schedule of works');
    alerts.forEach(alertBox);
    para('All works recorded in this survey, totalled by feature.', { size: 9, rgb: [90, 98, 106] });
    y += 1;
    if (secWorksList.length) {
      ensure(14);
      para('Security & access', { size: 10.5, style: 'bold' });
      for (const [label, detail] of secWorksList) {
        para(`-  ${label}${detail ? `: ${detail}` : ''}`, { size: 10, x: M + 4, width: CW - 4 });
      }
      y += 1.5;
    }
    if (serviceWorks.length) {
      ensure(14);
      para('Services', { size: 10.5, style: 'bold' });
      for (const t of serviceWorks) para(`-  ${t}`, { size: 10, x: M + 4, width: CW - 4 });
      y += 1.5;
    }
    const groups = [...new Set([...schedule.values()].map((r) => r.part))];
    for (const label of groups) {
      ensure(14);
      para(label, { size: 10.5, style: 'bold' });
      for (const r of [...schedule.values()].filter((x) => x.part === label)) {
        const total = Math.round(r.total * 10) / 10;
        const q = qtyText(total, r.unit);
        para(`-  ${r.label}${q ? `:  ${q}` : ''}${showCodes && isSorCode(r.id) ? `   [${r.id}]` : ''}   (${[...r.rooms].join(', ')})`, { size: 10, x: M + 4, width: CW - 4 });
      }
      y += 1.5;
    }
  };

  /** Materials list (under the schedule of works): by room, then totals to order. */
  const materialsSection = () => {
    const groups = materialGroups(job)
      .map((g) => ({ ...g, items: g.items.filter((it) => it.on) }))
      .filter((g) => g.items.length);
    if (!groups.length) return;
    heading('Materials list');
    para('Rough list of materials, grouped by room. Standard items are changed in every void.', { size: 9, rgb: [90, 98, 106] });
    y += 1;
    for (const g of groups) {
      ensure(14);
      para(g.name, { size: 10.5, style: 'bold' });
      for (const it of g.items) {
        const q = matQty(it.q, it.unit);
        para(`-  ${it.name}${q ? `  ${q}` : ''}`, { size: 10, x: M + 4, width: CW - 4 });
      }
      y += 1.5;
    }
    const totals = materialTotals(groups);
    ensure(20);
    y += 1;
    subheading('Totals to order');
    for (const t of totals) {
      const q = matQty(t.q, t.unit);
      para(`-  ${t.name}${q ? `  ${q}` : ''}`, { size: 10, x: M + 4, width: CW - 4 });
    }
  };

  // ---------- cover ----------
  onProgress('Building report…');
  font(20, 'bold', BRAND);
  doc.text(formOf(job).pdfTitle, M, y + 7);
  font(9, 'bold', [120, 128, 136]);
  doc.text('PropertyPad', W - M, y + 6, { align: 'right' });
  y += 13;

  // Materials & labour costing has its own, table-based report.
  if (isPrice(job)) {
    priceReport();
    return finish();
  }
  // Designer floor plans: the plan drawn to scale and a room schedule.
  if (isPlan(job)) {
    planReport();
    return finish();
  }

  // Property photo (first one taken on the Property type screen) at the top.
  const [coverId, ...otherPropertyPhotos] = job.property.photos;
  if (coverId) {
    const [rec] = await loadPhotos([coverId]);
    if (rec) {
      onProgress('Adding property photo…');
      const big = await resizeImage(rec.blob, 1400, 0.78);
      const s = Math.min(CW / big.w, 95 / big.h);
      const w = big.w * s, hgt = big.h * s;
      doc.addImage(new Uint8Array(await big.blob.arrayBuffer()), 'JPEG', M + (CW - w) / 2, y, w, hgt, undefined, 'NONE');
      y += hgt + 6;
    }
  }

  const addr = addressLines(job.address);
  para(addr.length ? addr.join('\n') : 'Address not recorded', { size: 12, style: 'bold' });
  y += 3;
  kv([
    ['Surveyor', job.surveyor],
    ['Survey started', fmtDateTime(job.created)],
    ['Report generated', fmtDateTime(new Date().toISOString())],
    ['Location', job.address.lat != null ? `${job.address.lat}, ${job.address.lng}` : ''],
  ]);

  // Summary: rooms and outside areas needing work.
  const summarise = (label, areas, kind) => {
    if (!areas.length) return;
    const st = areas.map((r) => roomStatus(r, featuresOf(r, kind)));
    const n = (f) => st.filter(f).length;
    y += 2;
    kv([[label, `${areas.length} surveyed - ${n((s) => s.works)} need work, ${n((s) => s.state === 'ok')} all OK` +
      (n((s) => s.checked < s.total) ? `, ${n((s) => s.checked < s.total)} not finished` : '')]]);
    const need = areas.filter((r, i) => st[i].works).map((r) => r.name);
    if (need.length) kv([['Work needed in', need.join(', ')]]);
  };
  const summariseRtl = (label, areas) => {
    if (!areas.length) return;
    const open = areas.filter((r) => !r.done).map((r) => r.name);
    y += 2;
    kv([[label, `${areas.length} checked - ${areas.length - open.length} works complete${open.length ? `, ${open.length} not complete` : ''}`]]);
    if (open.length) kv([['Not complete', open.join(', ')]]);
  };
  if (rtl) {
    summariseRtl('Rooms', job.rooms);
    summariseRtl('Outside areas', job.externals);
  } else {
    summarise('Rooms', job.rooms, 'rooms');
    summarise('Outside areas', job.externals, 'externals');
  }
  if (alerts.length) {
    y += 3;
    alerts.forEach(alertBox);
  }

  // ---------- sections ----------
  // Same order as the app's tabs: property, security, services, rooms, externals.
  const prop = job.property;
  const works = rtl ? [] : worksSummary(job.works, 'property');
  const rtlChecks = rtl ? [['Clearance', job.rtl.clearance], ['Cleaning', job.rtl.cleaning]] : [];
  if (rtlChecks.some(([, c]) => c.done || c.notes) || prop.type || prop.style || prop.bedrooms || prop.storeys || prop.floor || prop.notes || works.length || otherPropertyPhotos.length) {
    heading('Property');
    kv([
      ['Type', prop.type],
      ['Style', prop.style],
      ['Bedrooms', prop.bedrooms],
      ['Storeys', prop.storeys],
      ['Floor level', prop.floor],
    ]);
    para(prop.notes); // older jobs only
    if (works.length) {
      y += 2;
      subheading('Works required');
      for (const [label, detail] of works) {
        para(`-  ${label}${detail ? `: ${detail}` : ''}`, { size: 10.5 });
        y += 0.8;
      }
    }
    for (const [label, c] of rtlChecks) {
      y += 2;
      subheading(label);
      kv([['Completed', c.done ? 'Yes' : 'Not ticked'], ['Notes', c.notes]]);
    }
    await photoGrid(otherPropertyPhotos);
    y += 2;
  }

  if (job.keys.length) {
    heading(rtl ? 'Keys' : 'Key register');
    keyTable(job.keys, rtl);
    for (const k of job.keys) {
      if (!k.photos.length) continue;
      subheading(`Photos - ${k.keySet || 'key set'}`);
      await photoGrid(k.photos);
    }
  }

  // ----- Security: key safe & access works, then doors and windows -----
  const ks = job.keySafe;
  const secWorks = worksSummary(job.works, 'security');
  const hasKeySafe = ks.location || ks.code || ks.lat != null || ks.photos.length;
  const secChecked = job.security && featuresOf(job.security, 'security').some((f) => job.security.parts?.[f.key]?.state);
  if (rtl && hasKeySafe) {
    heading('Key safe');
    kv([
      ['Location', ks.location],
      ['Code', ks.code ? (includeCode ? ks.code : 'Withheld from this report') : 'Not recorded'],
      ['GPS', ks.lat != null ? `${ks.lat}, ${ks.lng}${ks.accuracy != null ? ` (±${ks.accuracy} m)` : ''}` : ''],
    ]);
    await photoGrid(ks.photos);
    y += 2;
  }
  if (!rtl && (secWorks.length || hasKeySafe || secChecked)) {
    heading('Security');
    for (const [label, detail] of secWorks) {
      para(`-  ${label}${detail ? `: ${detail}` : ''}`, { size: 10.5 });
      y += 0.8;
    }
    if (hasKeySafe) {
      y += 2;
      subheading('Key safe');
      kv([
        ['Location', ks.location],
        ['Code', ks.code ? (includeCode ? ks.code : 'Withheld from this report') : 'Not recorded'],
        ['GPS', ks.lat != null ? `${ks.lat}, ${ks.lng}${ks.accuracy != null ? ` (±${ks.accuracy} m)` : ''}` : ''],
      ]);
      await photoGrid(ks.photos);
    }
    if (secChecked) {
      y += 2;
      subheading('Doors & windows', areaBadge(job.security, 'security'));
      await featureBlocks(job.security, 'security');
    }
    y += 2;
  }

  const meters = job.meters.filter((m) => m.location || m.photos.length || m.serial || m.reading || m.type || m.supply || m.doorDamaged || m.notes);
  const leg = job.legionella || { done: false, notes: '', photos: [] };
  {
    heading('Services');
    kv([['Heating type', job.heating.join(', ')]]);
    for (const m of meters) {
      ensure(45); // keep a meter's heading with its details
      subheading(serviceTitle(m.utility));
      kv([
        ['Location', m.location],
        // Older surveys recorded these too – print them if present.
        ['Type', m.type],
        ['Supply', m.supply],
        ['Prepay balance', m.type === 'Prepayment' && m.balance !== '' ? `${m.balanceType} £${m.balance}` : ''],
        ['Serial number', m.serial],
        ['Reading', m.reading],
        ['Date read', m.reading ? fmtDate(m.date) : ''],
        ['Meter box door', hasMeterDoor(m.utility) && m.doorDamaged ? (m.doorDamaged === 'yes' ? 'Damaged' : 'Not damaged') : ''],
        ['Notes', m.notes],
      ]);
      await photoGrid(m.photos);
      y += 3;
    }
    ensure(30);
    subheading('Legionella flush');
    kv([
      ['Flush', leg.done ? 'Completed – form left on site' : 'Not recorded'],
      ['Notes', leg.notes],
    ]);
    await photoGrid(leg.photos);
    y += 3;
  }

  await roomsSection('Rooms', job.rooms, 'rooms');
  await roomsSection('Externals', job.externals, 'externals');

  // ----- Gifted items (left for the incoming tenant) -----
  const gifts = Object.entries(job.gifted?.selected || {}).filter(([, rooms]) => rooms.length);
  const voucher = rtl ? job.rtl.voucher : null;
  if (voucher?.required) {
    heading('Decorating voucher');
    kv([
      ['Required', voucher.required === 'yes' ? 'Yes' : 'No'],
      ['Value', voucher.required === 'yes' && voucher.value ? `£${voucher.value}` : ''],
    ]);
    if (voucher.required === 'yes') await photoGrid(voucher.photos);
    y += 2;
  }
  if (gifts.length) {
    heading('Gifted items');
    para('Items left for the incoming tenant.', { size: 9, rgb: [90, 98, 106] });
    y += 1;
    kv(gifts.map(([item, rooms]) => [item, rooms.join(', ')]), { labelW: 48 });
  }
  // ----- Sign off: appliances (Ready to let) and signature (both forms) -----
  const sg = job.signature || {};
  if (!rtl) {
    scheduleSection();
    materialsSection();
  }
  const ap = rtl ? job.rtl.appliances : { any: '', notes: '', photos: [], list: [] };
  {
    if (ap.any || ap.notes || ap.photos.length || sg.image || sg.name) {
      heading('Sign off');
      kv([
        ['Appliances to be maintained', ap.any === 'yes' ? 'Yes' : ap.any === 'no' ? 'No' : ''],
        ['Appliances', ap.any === 'yes' ? ap.list.join(', ') : ''],
        ['Notes', ap.notes],
      ], { labelW: 60 });
      await photoGrid(ap.photos);
      if (sg.image || sg.name) {
        y += 3;
        ensure(50);
        subheading('Signature');
        if (sg.image) {
          const p = doc.getImageProperties(sg.image);
          const w = 75, hgt = Math.min(35, (w * p.height) / p.width);
          doc.addImage(sg.image, 'PNG', M, y, (hgt * p.width) / p.height, hgt);
          y += hgt + 2;
          doc.setDrawColor(150, 160, 170);
          doc.setLineWidth(0.3);
          doc.line(M, y, M + w, y);
          y += 4;
        }
        kv([['Name', sg.name], ['Signed', sg.date ? fmtDateTime(sg.date) : 'Not signed']]);
      }
    }
  }

  await photoPages();
  return finish();

  // ---------- Photos: every photo, large and labelled, two to a page (hoisted) ----------
  function photoList() {
    const items = [];
    const add = (ids, label) => (ids || []).forEach((id) => items.push({ id, label }));
    const area = (room, kind, name) => {
      add(room.photos, name);
      for (const part of featuresOf(room, kind)) {
        const p = room.parts?.[part.key];
        if (!p?.photos?.length) continue;
        const defects = (p.defects || []).map((d) => defectInfo(FEATURES[part.key] ? part : null, d).label);
        add(p.photos, [name, part.label, defects.join(', ')].filter(Boolean).join(' - '));
      }
    };
    // First the ones that get read closely: decorating card and the legionella form.
    if (rtl && job.rtl.voucher.required === 'yes') add(job.rtl.voucher.photos, 'Decorating card');
    add(job.legionella?.photos, 'Legionella flush form');
    add(job.property.photos, 'Property');
    for (const k of job.keys) add(k.photos, `Keys - ${k.keySet || 'key set'}`);
    add(job.keySafe.photos, 'Key safe');
    if (job.security) area(job.security, 'security', 'Security - doors & windows');
    for (const m of job.meters) add(m.photos, serviceTitle(m.utility));
    for (const r of job.rooms) area(r, 'rooms', r.name || 'Room');
    for (const r of job.externals) area(r, 'externals', r.name || 'Outside');
    if (rtl) add(job.rtl.appliances.photos, 'Appliances');
    const seen = new Set();
    return items.filter((it) => !seen.has(it.id) && seen.add(it.id));
  }

  async function photoPages() {
    const items = photoList();
    if (!items.length) return;
    const recs = new Map((await loadPhotos(items.map((it) => it.id))).map((r) => [r.id, r]));
    const list = items.filter((it) => recs.has(it.id));
    if (!list.length) return;
    doc.addPage();
    y = M;
    heading('Photos');
    let slotH = (BOTTOM - y) / 2;
    let slot = 0;
    for (const [i, it] of list.entries()) {
      if (slot === 2) {
        doc.addPage();
        y = M;
        slotH = (BOTTOM - y) / 2;
        slot = 0;
      }
      const top = y;
      font(10.5, 'bold', BRAND);
      doc.text(doc.splitTextToSize(clean(`${i + 1}.  ${it.label}`), CW)[0], M, top + 4.5);
      const img = await pdfImage(recs.get(it.id));
      const boxH = slotH - 12;
      const s = Math.min(CW / img.w, boxH / img.h);
      const w = img.w * s, hgt = img.h * s;
      doc.addImage(img.bytes, 'JPEG', M + (CW - w) / 2, top + 7, w, hgt, `photo-${it.id}`, 'NONE');
      y = top + slotH;
      slot++;
    }
  }

  // ---------- footers, then the finished file (hoisted) ----------
  function finish() {
    const pages = doc.getNumberOfPages();
    const footer = jobTitle(job);
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      font(8, 'normal', [110, 118, 126]);
      doc.text(doc.splitTextToSize(clean(footer), CW - 30)[0] || '', M, H - 8);
      doc.text(`Page ${p} of ${pages}`, W - M, H - 8, { align: 'right' });
    }
    return doc.output('blob');
  }

  // ---------- Materials & labour costing (hoisted) ----------
  /** cols: [label, width mm, 'right'?]; rows: arrays of cell text; foot: rows drawn bold and shaded. */
  function gridTable(cols, rows, foot = []) {
    const pad = 1.5, size = 8.5, lh = lineH(size);
    const drawRow = (cells, { header = false, total = false } = {}) => {
      font(size, header || total ? 'bold' : 'normal');
      const wrapped = cells.map((c, i) => doc.splitTextToSize(clean(c && typeof c === 'object' ? c.t : c), cols[i][1] - pad * 2));
      const rowH = Math.max(...wrapped.map((l) => l.length)) * lh + pad * 2;
      if (y + rowH > BOTTOM) {
        doc.addPage();
        y = M;
        if (!header) drawRow(cols.map((c) => c[0]), { header: true });
        font(size, header || total ? 'bold' : 'normal');
      }
      if (header || total) {
        doc.setFillColor(...(header ? [232, 237, 242] : [244, 246, 248]));
        doc.rect(M, y, CW, rowH, 'F');
      }
      doc.setDrawColor(200, 206, 212);
      doc.setLineWidth(0.2);
      doc.line(M, y + rowH, M + CW, y + rowH);
      let x = M;
      wrapped.forEach((lines, i) => {
        const right = cols[i][2] === 'right';
        const url = cells[i] && typeof cells[i] === 'object' && /^https?:\/\//i.test(cells[i].url || '') ? cells[i].url : null;
        if (url) {
          doc.setTextColor(5, 99, 193); // a product link: blue, and tapping the cell opens the page
          doc.link(x, y, cols[i][1], rowH, { url });
        }
        lines.forEach((line, k) => doc.text(line, right ? x + cols[i][1] - pad : x + pad, y + pad + lh * (k + 0.75), right ? { align: 'right' } : undefined));
        if (url) doc.setTextColor(0, 0, 0);
        x += cols[i][1];
      });
      y += rowH;
    };
    drawRow(cols.map((c) => c[0]), { header: true });
    for (const r of rows) drawRow(r);
    for (const r of foot) drawRow(r, { total: true });
    y += 5;
  }

  // ---------- Designer floor plan (hoisted) ----------
  // Landscape. For each floor: a room information page (the room drawn with its doors, windows and services,
  // and a list of sizes and where everything is), then a cabinet layout page (units, panels and appliances,
  // with the numbered key on the left; services are left off so they don't get in the way).
  function planReport() {
    const plan = job.plan;
    refreshDepths(plan); // sizes follow the thickness settings
    let started = false;
    let last = null;

    const newPage = (title) => {
      if (started) {
        doc.addPage();
        y = M;
      }
      started = true;
      font(13, 'bold', BRAND);
      doc.text(clean(title), M, y + 5);
      y += 9;
    };
    /** A column of text down the left of the page; carries on to a new page if it runs out of room. */
    const makeCol = (keyW, top) => {
      const c = { ly: top };
      c.ensure = (need) => {
        if (c.ly + need > BOTTOM) {
          doc.addPage();
          c.ly = M;
        }
      };
      c.text = (text, { size = 8.5, style = 'normal', rgb = [0, 0, 0], indent = 0, gap = 0.5 } = {}) => {
        font(size, style, rgb);
        const lh = lineH(size);
        for (const line of doc.splitTextToSize(clean(text), keyW - indent)) {
          c.ensure(lh);
          doc.text(line, M + indent, c.ly + lh * 0.75);
          c.ly += lh;
        }
        c.ly += gap;
      };
      c.heading = (text) => {
        c.ensure(12);
        c.ly += 1.2;
        font(10, 'bold', BRAND);
        doc.text(text, M, c.ly + 3.6);
        c.ly += 4.6;
        doc.setDrawColor(...BRAND);
        doc.setLineWidth(0.35);
        doc.line(M, c.ly, M + keyW, c.ly);
        c.ly += 1.8;
      };
      c.row = (label, value) => {
        const lh = lineH(9);
        font(9, 'bold', [80, 88, 96]);
        c.ensure(lh);
        doc.text(label, M, c.ly + lh * 0.75);
        font(9, 'normal');
        for (const line of doc.splitTextToSize(clean(value), keyW - 26)) {
          doc.text(line, M + 26, c.ly + lh * 0.75);
          c.ly += lh;
        }
        c.ly += 0.6;
      };
      return c;
    };
    const area = (keyW, top) => ({ x: M + keyW + 8, y: top, w: W - M - (M + keyW + 8), h: BOTTOM - top - 8 });
    const grey = [70, 78, 86];

    const floors = plan.floors.filter((f) => f.rooms.length);
    if (!floors.length) {
      newPage('Room information');
      last = makeCol(120, y);
      last.text('No rooms have been drawn yet.');
    }
    floors.forEach((f, fi) => {
      const tags = featureTags(f);
      const roomOf = (id) => f.rooms.find((r) => r.id === id);
      const placed = f.items.filter((it) => roomOf(it.roomId));

      // ----- page 1: room information -----
      newPage(plan.kind === 'property' ? `Room information - ${f.name}` : 'Room information');
      const KEYA = 100, topA = y;
      const c = makeCol(KEYA, topA);
      drawFloor(f, area(KEYA, topA), 'room');
      if (fi === 0) {
        const addr = addressLines(job.address);
        if (addr.length) c.text(addr.join('\n'), { size: 11, style: 'bold', gap: 1.5 });
        c.row('Drawn by', job.surveyor || '');
        c.row('Generated', fmtDateTime(new Date().toISOString()));
        c.row('Floor area', sqm(planArea(plan)));
      }
      c.heading('Rooms');
      for (const r of f.rooms) {
        const fg = roomFigures(r);
        c.text(`${r.name}: ${metres(r.w)} x ${metres(r.h)}, ${sqm(fg.floor)}${fg.height ? `, ceiling ${fg.height.toFixed(2)} m, walls ${sqm(fg.walls)}` : ''}`, { gap: 0.8 });
      }
      if (f.rooms.length > 1) c.text(`${plan.kind === 'property' ? f.name : 'Total'}: ${sqm(floorArea(f))}`, { style: 'bold' });
      for (const [title, type] of [['Doors', 'door'], ['Windows', 'window'], ['Radiators', 'radiator']]) {
        const list = placed.filter((it) => it.type === type);
        if (!list.length) continue;
        c.heading(title);
        for (const it of list) {
          const [head, ...rest] = describeFeature(roomOf(it.roomId), it, tags.get(it.id));
          c.text(head, { style: 'bold', gap: 0 });
          rest.forEach((t, i) => c.text(t, { size: 8, rgb: grey, indent: 3, gap: i === rest.length - 1 ? 0.9 : 0 }));
        }
      }
      const services = placed.filter((it) => ITEMS[it.type].kind === 'point');
      if (services.length) {
        c.heading('Services');
        for (const it of services) {
          c.text(`${ITEMS[it.type].code}  ${ITEMS[it.type].label}`, { style: 'bold', gap: 0 });
          c.text(serviceInfo(roomOf(it.roomId), it).text, { size: 8, rgb: grey, indent: 3, gap: 0.9 });
        }
      }
      last = c;

      // ----- page 2: cabinet layout (only when something has been laid out) -----
      const units = placed.filter((it) => ITEMS[it.type].kind === 'fixture' && it.type !== 'radiator');
      if (!units.length) return;
      newPage(plan.kind === 'property' ? `Cabinet layout - ${f.name}` : 'Cabinet layout');
      const KEYB = 76, topB = y;
      const c2 = makeCol(KEYB, topB);
      drawFloor(f, area(KEYB, topB), 'layout');
      const nums = cabinetNumbers(f);
      const cabs = units.filter((it) => nums.has(it.id));
      if (cabs.length) {
        c2.heading('Key to units');
        for (const it of cabs) {
          const lh = lineH(9);
          font(9, 'normal');
          const lines = doc.splitTextToSize(clean(cabinetText(it)), KEYB - 8);
          const rowH = Math.max(5.2, lines.length * lh) + 0.5;
          c2.ensure(rowH);
          doc.setFillColor(...BRAND);
          doc.circle(M + 2.6, c2.ly + 2.7, 2.6, 'F');
          font(7, 'bold', [255, 255, 255]);
          doc.text(String(nums.get(it.id)), M + 2.6, c2.ly + 3.6, { align: 'center' });
          font(9, 'normal');
          lines.forEach((line, n) => doc.text(line, M + 8, c2.ly + lh * 0.75 + n * lh + 0.3));
          c2.ly += rowH;
        }
      }
      const extras = panelLines(f, plan.settings);
      if (extras.length) {
        c2.heading('Panels and fillers');
        for (const t of extras) c2.text(t, { gap: 0.3 });
      }
      if (cabs.length || extras.length) c2.text(settingsLine(plan.settings), { size: 8, rgb: [110, 118, 126], gap: 1 });
      // appliances come after the cabinets and their parts
      const appliances = units.filter((it) => ITEMS[it.type].facing && !ITEMS[it.type].cab && !ITEMS[it.type].filler);
      if (appliances.length) {
        c2.heading('Appliances');
        for (const it of appliances) c2.text(`${ITEMS[it.type].label}, ${Math.round(it.uw * 10)} x ${Math.round(it.ud * 10)} mm`, { gap: 0.3 });
      }
      last = c2;
    });
    if (last) {
      last.text('Drawn to scale from the measurements entered on site (see the 1 m scale bar). Check measurements before ordering or building.', { size: 8, rgb: [110, 118, 126], gap: 1.5 });
      if (plan.notes) {
        last.heading('Notes');
        last.text(plan.notes);
      }
      y = last.ly;
    }
  }

  /** Drawing size for a floor: scaled to fit the area (at most 1:25). */
  function floorSize(f, aw, ah, withPoints = true) {
    const b = bounds(f, withPoints) || { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const pad = 30; // cm round the edge for labels
    const bw = b.maxX - b.minX + pad * 2, bh = b.maxY - b.minY + pad * 2;
    const k = Math.min(aw / bw, ah / bh, 0.4); // mm per cm (0.4 = 1:25)
    return { b, pad, bw, bh, k, hgt: bh * k };
  }

  /** One floor, drawn to scale inside area { x, y, w, h } (mm). mode 'room': structure and services; 'layout': units, no services. */
  function drawFloor(f, area, mode = 'layout') {
    const { b, pad, bw, k, hgt } = floorSize(f, area.w, area.h, mode === 'room');
    const tags = featureTags(f);
    const ox = area.x + (area.w - bw * k) / 2 - (b.minX - pad) * k;
    const oy = area.y - (b.minY - pad) * k;
    const px = (x) => ox + x * k, py = (yy) => oy + yy * k;
    const room = (id) => f.rooms.find((r) => r.id === id);
    refreshPosts(f); // corner posts fit the cabinets beside them
    const nums = cabinetNumbers(f);
    // rooms
    doc.setFillColor(250, 251, 252);
    doc.setDrawColor(40, 48, 56);
    doc.setLineWidth(0.8);
    for (const r of f.rooms) doc.rect(px(r.x), py(r.y), r.w * k, r.h * k, 'FD');
    // fixtures and cabinets (layout page); the room page only shows the radiators
    const badge = (cx, cy, n) => {
      doc.setFillColor(...BRAND);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.2);
      doc.circle(cx, cy, 2.2, 'FD');
      font(6.5, 'bold', [255, 255, 255]);
      doc.text(String(n), cx, cy + 0.9, { align: 'center' });
    };
    for (const it of f.items) {
      const r = room(it.roomId), d = ITEMS[it.type];
      if (!r || d.kind !== 'fixture') continue;
      if (mode === 'room' && it.type !== 'radiator') continue;
      doc.setLineWidth(0.25);
      doc.setDrawColor(70, 80, 90);
      if (d.dashed) doc.setLineDashPattern([1, 0.8], 0);
      doc.setFillColor(236, 241, 246);
      if (d.corner) {
        const pts = cornerPoints(it).map(([ux, uy]) => [px(r.x + it.dx + ux), py(r.y + it.dy + uy)]);
        doc.lines(pts.slice(1).concat([pts[0]]).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], d.dashed ? 'S' : 'FD', true);
        doc.setLineDashPattern([], 0);
        const [lx, ly2] = cornerLabelPoint(it);
        badge(px(r.x + it.dx + lx), py(r.y + it.dy + ly2), nums.get(it.id));
        continue;
      }
      const bx = px(r.x + it.dx), by = py(r.y + it.dy), w = it.w * k, hh = it.h * k;
      const shapes = cabinetShapes(it, job.plan.settings);
      if (shapes.length) {
        // bird's-eye view: carcass, open top with its rails and cavity, and the door in front
        for (const sh of shapes) {
          const sx = bx + sh.x * k, sy = by + sh.y * k, sw = sh.w * k, sht = sh.h * k;
          if (sh.c === 'carcass') {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(70, 80, 90);
            doc.setLineWidth(0.3);
            if (d.dashed) doc.setLineDashPattern([1, 0.8], 0); // wall units hang above: outline only, so the base units show through
            doc.rect(sx, sy, sw, sht, d.dashed ? 'S' : 'FD');
            doc.setLineDashPattern([], 0);
          } else if (sh.c === 'cavity') {
            doc.setFillColor(214, 221, 228);
            doc.rect(sx, sy, sw, sht, 'F');
          } else if (sh.c === 'rail') {
            doc.setFillColor(246, 248, 250);
            doc.setDrawColor(70, 80, 90);
            doc.setLineWidth(0.2);
            doc.rect(sx, sy, sw, sht, 'FD');
          } else if (sh.c === 'door') {
            doc.setFillColor(70, 80, 90);
            doc.setDrawColor(70, 80, 90);
            doc.setLineWidth(0.2);
            doc.rect(sx, sy, sw, sht, d.dashed ? 'S' : 'F');
          } else {
            doc.setFillColor(...BRAND);
            doc.rect(sx, sy, sw, sht, 'F');
          }
        }
      } else {
        doc.rect(bx, by, w, hh, d.dashed ? 'S' : 'FD');
        doc.setLineDashPattern([], 0);
        if (d.facing && !d.space) {
          const [x1, y1, x2, y2] = frontEdge(it);
          doc.setDrawColor(...BRAND);
          doc.setLineWidth(d.cab ? 0.7 : 0.4);
          doc.line(bx + x1 * k, by + y1 * k, bx + x2 * k, by + y2 * k);
        }
      }
      if (d.cab) {
        const [bpx, bpy] = badgePoint(it);
        badge(bx + bpx * k, by + bpy * k - (d.space && hh > 8 ? 1.5 : 0), nums.get(it.id));
        if (d.space && w > 14 && hh > 8) {
          font(6, 'normal', [60, 68, 76]);
          doc.text(clean(it.appliance || ''), bx + w / 2, by + hh / 2 + 4, { align: 'center' });
        }
      } else if (!d.filler && w > 7 && hh > 2.5) {
        font(Math.min(6.5, hh * 2), 'normal', [40, 48, 56]);
        const label = doc.splitTextToSize(clean(mode === 'room' && tags.has(it.id) ? tags.get(it.id) : d.label), w - 1)[0];
        doc.text(label, bx + w / 2, by + hh / 2 + 0.8, { align: 'center' });
      }
    }
    // end panels (layout page)
    doc.setFillColor(40, 48, 56);
    for (const p of mode === 'layout' ? endPanels(f, job.plan.settings) : []) {
      const r = room(p.roomId);
      if (r) doc.rect(px(r.x + p.x), py(r.y + p.y), Math.max(p.w * k, 0.4), Math.max(p.h * k, 0.4), 'F');
    }
    // doors and windows
    for (const it of f.items) {
      const r = room(it.roomId), d = ITEMS[it.type];
      if (!r || d.kind !== 'wall') continue;
      const g = openingGeometry(r, it);
      doc.setDrawColor(250, 251, 252);
      doc.setLineWidth(1.3);
      doc.line(px(g.a.x), py(g.a.y), px(g.b.x), py(g.b.y));
      if (it.type === 'door') {
        doc.setDrawColor(40, 48, 56);
        for (const lf of g.leaves) {
          doc.setLineWidth(0.3);
          doc.setLineDashPattern([], 0);
          doc.line(px(lf.hinge.x), py(lf.hinge.y), px(lf.leaf.x), py(lf.leaf.y));
          doc.setLineWidth(0.15);
          doc.setLineDashPattern([0.6, 0.5], 0);
          for (let i = 1; i < lf.arc.length; i++) doc.line(px(lf.arc[i - 1].x), py(lf.arc[i - 1].y), px(lf.arc[i].x), py(lf.arc[i].y));
        }
        doc.setLineDashPattern([], 0);
      } else {
        doc.setDrawColor(47, 127, 193);
        doc.setLineWidth(1.1);
        doc.line(px(g.a.x), py(g.a.y), px(g.b.x), py(g.b.y));
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.35);
        doc.line(px(g.a.x), py(g.a.y), px(g.b.x), py(g.b.y));
      }
    }
    // door and window tags (room page)
    if (mode === 'room') {
      for (const it of f.items) {
        const r = room(it.roomId);
        if (!r || ITEMS[it.type].kind !== 'wall') continue;
        const g = openingGeometry(r, it);
        font(6.5, 'bold', [90, 98, 106]);
        doc.text(tags.get(it.id) || '', px((g.a.x + g.b.x) / 2) + g.L.nx * 5.5, py((g.a.y + g.b.y) / 2) + g.L.ny * 5.5 + 0.9, { align: 'center' });
      }
    }
    // services and alarms (room page only: on the layout page they get in the way)
    for (const it of f.items) {
      const r = room(it.roomId), d = ITEMS[it.type];
      if (!r || d.kind !== 'point' || mode !== 'room') continue;
      const cx = px(r.x + it.dx), cy = py(r.y + it.dy);
      doc.setFillColor(179, 38, 30);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(cx, cy, 2.4, 'FD');
      font(5.5, 'bold', [255, 255, 255]);
      doc.text(d.code, cx, cy + 0.9, { align: 'center' });
    }
    // names, areas, measurements
    for (const r of f.rooms) {
      const x = px(r.x), yy = py(r.y), w = r.w * k, hh = r.h * k;
      font(8.5, 'bold', [23, 32, 42]);
      doc.text(doc.splitTextToSize(clean(r.name), Math.max(8, w - 2))[0], x + w / 2, yy + hh / 2 - 0.5, { align: 'center' });
      font(7, 'normal', [90, 98, 106]);
      doc.text(sqm(roomFigures(r).floor), x + w / 2, yy + hh / 2 + 3, { align: 'center' });
      font(6.5, 'bold', [90, 98, 106]);
      doc.text(metres(r.w), x + w / 2, yy + 3, { align: 'center' });
      if (hh > 10) doc.text(metres(r.h), x + 3, yy + hh / 2, { align: 'center', angle: 90 });
    }
    // 1 m scale bar
    const by = area.y + hgt + 4, bx = area.x + (area.w - bw * k) / 2 + pad * k, bar = 100 * k; // under the plan, lined up with its left edge
    doc.setDrawColor(40, 48, 56);
    doc.setLineWidth(0.4);
    doc.line(bx, by, bx + bar, by);
    doc.line(bx, by - 1, bx, by + 1);
    doc.line(bx + bar, by - 1, bx + bar, by + 1);
    font(7, 'normal', [90, 98, 106]);
    doc.text(`1 m  (scale 1:${Math.round(10 / k)})`, bx + bar + 2, by + 1);
  }

  function priceReport() {
    const p = job.pricing;
    const t = sheetTotals(p);
    const markupText = (l) => (String(l.markup ?? '').trim() === '' ? '' : l.markupType === '£' ? gbp(lineTotals(l).markup) : `${l.markup}%`);
    const qtyOf = (l) => (String(l.qty ?? '').trim() || '1');
    const vatText = { plus: `Prices entered before VAT - VAT added at ${t.rate}%`, inc: `Prices entered including VAT at ${t.rate}%`, none: 'No VAT' }[p.vat] || '';

    const addr = addressLines(job.address);
    if (addr.length) {
      font(8.5, 'bold', [110, 118, 126]);
      doc.text('PROJECT ADDRESS', M, y + 3);
      y += 4.5;
      para(addr.join('\n'), { size: 12, style: 'bold' });
    }
    y += 3;
    const custAddr = addressLines(p.customerAddress || {}).join(', ');
    kv([
      ['Customer', p.customer],
      ['Customer address', custAddr && custAddr !== addr.join(', ') ? custAddr : custAddr ? 'Same as project address' : ''],
      ['Job reference', p.ref],
      ['Prepared by', job.surveyor],
      ['Created', fmtDateTime(job.created)],
      ['Report generated', fmtDateTime(new Date().toISOString())],
      ['Prices', vatText],
    ]);

    const mats = p.materials.filter((l) => !isBlankLine(l));
    if (mats.length) {
      heading('Materials');
      gridTable(
        [['Item', 44], ['Supplier', 26], ['Code / SKU', 22], ['Qty', 12, 'right'], ['Unit', 16], ['Price', 19, 'right'], ['Markup', 18, 'right'], ['Total', 23, 'right']],
        mats.map((l) => [l.url ? { t: l.item || l.url, url: l.url } : l.item, l.supplier, l.code, qtyOf(l), l.unit, l.price === '' ? '' : gbp(lineTotals({ ...l, qty: 1, markup: '' }).cost), markupText(l), gbp(lineTotals(l).total)]),
        [['Materials total', '', '', '', '', gbp(t.materials.cost), gbp(t.materials.markup), gbp(t.materials.total)]]);
    }
    if (mats.length || p.deliveries.length) {
      if (!mats.length) heading('Materials');
      y -= 2;
      para(p.deliveries.length ? 'Material prices exclude delivery; delivery charges and lead times are listed below.' : 'Material prices exclude delivery charges and lead times.', { size: 8.5, rgb: [110, 118, 126] });
      y += 3;
    }
    if (p.deliveries.length) {
      heading('Delivery & lead times');
      gridTable(
        [['Supplier', 44], ['Lead time', 40], ['Notes', 70], ['Cost', 26, 'right']],
        p.deliveries.map((d) => [d.supplier || 'Delivery', d.leadTime || 'Not given', d.notes, money(d.cost) ? gbp(money(d.cost)) : 'Free']),
        [['Delivery total', '', '', gbp(t.delivery.total)]]);
    }
    const lab = p.labour.filter((l) => !isBlankLine(l));
    if (lab.length) {
      heading('Labour');
      const basis = Object.fromEntries(LABOUR_BASIS);
      gridTable(
        [['Labour', 66], ['Charged', 24], ['Qty', 16, 'right'], ['Rate', 24, 'right'], ['Markup', 24, 'right'], ['Total', 26, 'right']],
        lab.map((l) => [l.item, basis[l.basis] || '', qtyOf(l), l.rate === '' ? '' : gbp(lineTotals({ ...l, qty: 1, markup: '' }).cost), markupText(l), gbp(lineTotals(l).total)]),
        [['Labour total', '', '', gbp(t.labour.cost), gbp(t.labour.markup), gbp(t.labour.total)]]);
    }

    heading('Totals');
    const totalLine = (label, value, { bold = false, big = false } = {}) => {
      const size = big ? 12 : 10.5;
      ensure(lineH(size) + 2);
      font(size, bold ? 'bold' : 'normal', big ? BRAND : [0, 0, 0]);
      doc.text(label, W - M - 60, y + lineH(size) * 0.75, { align: 'right' });
      doc.text(gbp(value), W - M, y + lineH(size) * 0.75, { align: 'right' });
      y += lineH(size) + 1.2;
    };
    totalLine('Materials', t.materials.total);
    totalLine('Labour', t.labour.total);
    if (t.delivery.count) totalLine('Delivery', t.delivery.total);
    totalLine('of which markup', t.markup);
    y += 1;
    doc.setDrawColor(200, 206, 212);
    doc.setLineWidth(0.3);
    doc.line(W - M - 100, y, W - M, y);
    y += 2;
    totalLine('Total before VAT', t.net, { bold: true });
    totalLine(p.vat === 'none' ? 'VAT (none)' : `VAT @ ${t.rate}%`, t.vat);
    totalLine(p.vat === 'none' ? 'Total' : 'Total inc VAT', t.gross, { bold: true, big: true });

    if (p.notes) {
      heading('Notes');
      para(p.notes);
    }
  }

  // ---------- key table (hoisted) ----------
  function keyTable(keys, simple = false) {
    const cols = simple
      ? [['Key type', 120], ['Quantity', 60]]
      : [['Key set', 52], ['Qty', 12], ['Received from', 40], ['Issued to', 40], ['Date', 36]];
    const pad = 1.5, size = 9, lh = lineH(size);
    const drawRow = (cells, { header = false } = {}) => {
      font(size, header ? 'bold' : 'normal');
      const wrapped = cells.map((c, i) => doc.splitTextToSize(clean(c), cols[i][1] - pad * 2));
      const rowH = Math.max(...wrapped.map((l) => l.length)) * lh + pad * 2;
      if (y + rowH > BOTTOM) {
        doc.addPage();
        y = M;
        if (!header) drawRow(cols.map((c) => c[0]), { header: true });
        font(size, header ? 'bold' : 'normal');
      }
      if (header) {
        doc.setFillColor(232, 237, 242);
        doc.rect(M, y, CW, rowH, 'F');
      }
      doc.setDrawColor(200, 206, 212);
      doc.setLineWidth(0.2);
      doc.line(M, y + rowH, M + CW, y + rowH);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, k) => doc.text(line, x + pad, y + pad + lh * (k + 0.75)));
        x += cols[i][1];
      });
      y += rowH;
    };
    drawRow(cols.map((c) => c[0]), { header: true });
    for (const k of keys) drawRow(simple ? [k.keySet, k.quantity] : [k.keySet, k.quantity, k.receivedFrom, k.issuedTo, fmtDate(k.date)]);
    y += 4;
  }
}

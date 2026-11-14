// PDF report (jsPDF, loaded on demand from /vendor).
import { addressLines, jobTitle, fmtDate, fmtDateTime, slug, todayLocal, allPhotoIds, worksSummary, roomStatus, roomAreas, serviceTitle, hasMeterDoor } from '../model.js';
import { UNITS, defectInfo, isSorCode, qtyText as unitQty } from '../data/parts.js';
import { FEATURES, featuresOf } from '../data/features.js';
import { loadPhotos, resizeImage } from '../photos.js';
import { getLibrary } from '../sor.js';
import { materialGroups, materialTotals, matQty } from '../materials.js';

// Photos are re-encoded smaller for the PDF so reports stay emailable.
const PDF_PHOTO_MAX = 1024;
const PDF_PHOTO_QUALITY = 0.72;

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
  return `Void survey - ${slug(jobTitle(job))} - ${todayLocal()}.pdf`;
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
};
const BRAND = [31, 95, 139];

/** Build the report. Returns a PDF Blob. */
export async function buildPdf(job, { includeCode = false, onProgress = () => {} } = {}) {
  const { jsPDF } = await loadJsPDF();
  // SOR codes are printed only while an SOR library is loaded on this device.
  const showCodes = Boolean(await getLibrary());
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

  const W = 210, H = 297, M = 15, CW = W - 2 * M, BOTTOM = H - M - 6;
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
        onProgress(`Adding photo ${++photoCount} of ${totalPhotos}…`);
        const small = await resizeImage(rec.blob, PDF_PHOTO_MAX, PDF_PHOTO_QUALITY);
        const bytes = new Uint8Array(await small.blob.arrayBuffer());
        const s = Math.min(cellW / small.w, maxH / small.h);
        row.push({ bytes, w: small.w * s, h: small.h * s });
      }
      const rowH = Math.max(...row.map((r) => r.h));
      ensure(rowH + gap);
      row.forEach((r, j) => {
        const x = M + j * (cellW + gap) + (cellW - r.w) / 2;
        doc.addImage(r.bytes, 'JPEG', x, y, r.w, r.h, undefined, 'NONE');
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
  if (locks.includes('Communal key')) {
    alerts.push({ level: 'red', text: 'Communal keys required – Operative must arrange keys to be cut or communal lock change with manager before works are complete.' });
  }
  if (locks.includes('Communal fob') || fobDefect) {
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
  doc.text('Void Property Survey', M, y + 7);
  font(9, 'bold', [120, 128, 136]);
  doc.text('PropertyPad', W - M, y + 6, { align: 'right' });
  y += 13;

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
  summarise('Rooms', job.rooms, 'rooms');
  summarise('Outside areas', job.externals, 'externals');
  if (alerts.length) {
    y += 3;
    alerts.forEach(alertBox);
  }

  // ---------- sections ----------
  // Same order as the app's tabs: property, security, services, rooms, externals.
  const prop = job.property;
  const works = worksSummary(job.works, 'property');
  if (prop.type || prop.style || prop.bedrooms || prop.storeys || prop.floor || prop.notes || works.length || otherPropertyPhotos.length) {
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
    await photoGrid(otherPropertyPhotos);
    y += 2;
  }

  if (job.keys.length) {
    heading('Key register');
    keyTable(job.keys);
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
  if (secWorks.length || hasKeySafe || secChecked) {
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
  if (meters.length || job.heating.length) {
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
  }

  await roomsSection('Rooms', job.rooms, 'rooms');
  await roomsSection('Externals', job.externals, 'externals');

  // ----- Gifted items (left for the incoming tenant) -----
  const gifts = Object.entries(job.gifted?.selected || {}).filter(([, rooms]) => rooms.length);
  if (gifts.length) {
    heading('Gifted items');
    para('Items left for the incoming tenant.', { size: 9, rgb: [90, 98, 106] });
    y += 1;
    kv(gifts.map(([item, rooms]) => [item, rooms.join(', ')]), { labelW: 48 });
  }
  scheduleSection();
  materialsSection();

  // ---------- footers ----------
  const pages = doc.getNumberOfPages();
  const footer = jobTitle(job);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(8, 'normal', [110, 118, 126]);
    doc.text(doc.splitTextToSize(clean(footer), CW - 30)[0] || '', M, H - 8);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 8, { align: 'right' });
  }

  return doc.output('blob');

  // ---------- key table (hoisted) ----------
  function keyTable(keys) {
    const cols = [
      ['Key set', 52], ['Qty', 12], ['Received from', 40], ['Issued to', 40], ['Date', 36],
    ];
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
    for (const k of keys) drawRow([k.keySet, k.quantity, k.receivedFrom, k.issuedTo, fmtDate(k.date)]);
    y += 4;
  }
}

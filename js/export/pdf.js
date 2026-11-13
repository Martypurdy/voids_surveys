// PDF report (jsPDF, loaded on demand from /vendor).
import { addressLines, jobTitle, fmtDate, fmtDateTime, slug, todayLocal, allPhotoIds, worksSummary } from '../model.js';
import { loadPhotos, resizeImage } from '../photos.js';

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

const COND_RGB = { Good: [30, 125, 58], Fair: [168, 107, 0], Poor: [179, 38, 30], 'N/A': [107, 116, 128] };
const BRAND = [31, 95, 139];

/** Build the report. Returns a PDF Blob. */
export async function buildPdf(job, { includeCode = false, onProgress = () => {} } = {}) {
  const { jsPDF } = await loadJsPDF();
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

  // ---------- cover ----------
  onProgress('Building report…');
  font(20, 'bold', BRAND);
  doc.text('Void Property Survey', M, y + 7);
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

  // Summary of condition ratings.
  const all = [...job.rooms, ...job.externals];
  if (all.length) {
    const count = (c) => all.filter((i) => i.condition === c).length;
    y += 2;
    kv([['Condition summary', ['Good', 'Fair', 'Poor', 'N/A'].map((c) => `${c}: ${count(c)}`).join('   ') +
      (all.some((i) => !i.condition) ? `   Not rated: ${all.filter((i) => !i.condition).length}` : '')]]);
    const poor = all.filter((i) => i.condition === 'Poor').map((i) => i.name);
    if (poor.length) kv([['Rated poor', poor.join(', ')]]);
  }

  // ---------- sections ----------
  // Same order as the app's tabs: property, keys & key safe, meters, rooms, externals.
  const prop = job.property;
  const works = worksSummary(job.works);
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

  const ks = job.keySafe;
  if (ks.location || ks.code || ks.lat != null || ks.photos.length) {
    heading('Key safe');
    kv([
      ['Location', ks.location],
      ['Code', ks.code ? (includeCode ? ks.code : 'Withheld from this report') : 'Not recorded'],
      ['GPS', ks.lat != null ? `${ks.lat}, ${ks.lng}${ks.accuracy != null ? ` (±${ks.accuracy} m)` : ''}` : ''],
    ]);
    await photoGrid(ks.photos);
  }

  const meters = job.meters.filter((m) => m.serial || m.reading || m.type || m.supply || m.location || m.photos.length);
  if (meters.length) {
    heading('Meters');
    for (const m of meters) {
      ensure(45); // keep a meter's heading with its details
      subheading(`${m.utility} meter`);
      kv([
        ['Type', m.type],
        ['Supply', m.supply],
        ['Prepay balance', m.type === 'Prepayment' && m.balance !== '' ? `${m.balanceType} £${m.balance}` : ''],
        ['Serial number', m.serial],
        ['Reading', m.reading],
        ['Date read', fmtDate(m.date)],
        ['Location', m.location],
      ]);
      await photoGrid(m.photos);
      y += 3;
    }
  }

  await itemSection('Rooms', job.rooms);
  await itemSection('Externals', job.externals);

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

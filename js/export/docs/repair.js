// Property repair survey as Word and Excel. Follows the paper template: project details, purpose of visit,
// schedule of repairs (No., location, condition, causation, rectification, images), materials, notes and sign-off.
// Small numbered pictures sit in the schedule; the large versions follow at the end with the same numbers.
import { textLines, addressLines, fmtDate, formOf } from '../../model.js';
import { usedRows, usedMaterials, rowNumbers, materialSource, repairPhotos, rowPhotoNumbers } from '../../repair.js';

const ACCENT = '1F4E5C';
const REASON = { defect: 'Defect', upgrade: 'Upgrade' };
const OCC = { void: 'Void', occupied: 'Occupied' };

/** The facts both formats print. */
function collect(job) {
  const rep = job.repair;
  const sg = job.signature || {};
  const cust = [rep.customer, addressLines(rep.customerAddress || {}).join(', ')].filter(Boolean).join(' - ');
  return {
    rep,
    where: textLines(job.address).join(', '),
    details: [
      ['Property address', textLines(job.address).join(', '), 'Job / work order no.', rep.ref],
      ['Postcode', job.address.postcode, 'Date of inspection', rep.date ? fmtDate(rep.date) : ''],
      ['Property type', rep.propertyType, 'Surveyor', job.surveyor],
      ['Occupancy (void / occupied)', OCC[rep.occupancy] || '', 'Tenant / contact', cust],
      ['Weather conditions', rep.weather, 'Access arrangements', rep.access],
    ],
    purpose: [['Reason for visit', REASON[rep.reason] || ''], ['Brief of the issue (as reported)', rep.brief]],
    rows: usedRows(rep),
    nums: rowNumbers(rep),
    mats: usedMaterials(rep),
    photos: repairPhotos(rep),
    signoff: [['Additional notes', rep.notes], ['Surveyor name', sg.name || job.surveyor, 'Date', sg.date ? fmtDate(sg.date.slice(0, 10)) : '']],
    sg,
  };
}

/** The Word document. */
export function repairModel(job) {
  const c = collect(job);
  const { rep } = c;
  const sections = [];
  sections.push({ band: 'PROJECT DETAILS', grid: c.details });
  sections.push({ band: 'PURPOSE OF VISIT & BRIEF', grid: c.purpose });
  sections.push({
    band: 'SCHEDULE OF REPAIRS',
    ...(c.rows.length ? {
      table: {
        headFill: ACCENT, headColor: 'FFFFFF',
        cols: [{ title: 'No.', w: 0.6 }, { title: 'Location / element', w: 2.4 }, { title: 'Current condition', w: 3.3 }, { title: 'Suggested causation', w: 3 }, { title: 'Recommended rectification', w: 3.3 }, { title: 'Images (photo no.)', w: 3 }],
        rows: c.rows.map((r) => [String(c.nums.get(r.id)), r.location, r.condition, r.causation, r.fix, { thumbs: rowPhotoNumbers(rep, r) }]),
      },
    } : { paras: ['No repairs recorded.'] }),
  });
  if (c.mats.length) {
    sections.push({
      band: 'MATERIALS REQUIRED',
      table: {
        headFill: ACCENT, headColor: 'FFFFFF',
        cols: [{ title: 'Repair', w: 3 }, { title: 'Material', w: 5 }, { title: 'Qty', w: 1, align: 'right' }, { title: 'Unit', w: 1 }],
        rows: c.mats.map((m) => [materialSource(rep, m.rowId, c.nums) || 'Added by surveyor', m.item, m.qty, m.unit]),
      },
    });
  }
  const images = [];
  if (c.sg.image) {
    const b64 = String(c.sg.image).split(',')[1];
    if (b64) images.push({ bytes: Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)), w: 3, h: 1.2, type: 'image/png', widthCm: 6, caption: 'Signature' });
  }
  sections.push({ band: 'ADDITIONAL NOTES & SIGN-OFF', grid: c.signoff, images });
  if (c.photos.length) {
    sections.push({ heading: 'Photos', pageBreak: true, photoMaxH: 12, photos: c.photos.map((p) => ({ id: p.id, caption: `Photo ${p.n}  -  ${p.caption}` })) });
  }
  return {
    title: formOf(job).pdfTitle.toUpperCase(), subtitle: 'Condition, causation & recommended rectification', landscape: true, accent: ACCENT,
    footer: c.where || formOf(job).title, sections,
  };
}

/**
 * The workbook. loadImage(id) -> { bytes, w, h, type } puts the pictures in: small ones beside each repair, large ones
 * on the Photos sheet.
 */
export async function repairWorkbook(job, { loadImage = async () => null } = {}) {
  const c = collect(job);
  const { rep } = c;
  const head = (labels) => labels.map((v) => ({ v, s: 'headTeal' }));
  const label = { font: 1, fill: 3, border: 1, wrap: 1, v: 'top' };
  const sheets = [];

  // ----- details -----
  const dRows = [[{ v: formOf(job).pdfTitle.toUpperCase(), s: 'title' }], [{ v: 'Condition, causation & recommended rectification', s: 'note' }], []];
  dRows.push(head(['PROJECT DETAILS', '', '', '']));
  for (const r of c.details) dRows.push([{ v: r[0], s: label }, { v: r[1], s: 'cell' }, { v: r[2], s: label }, { v: r[3], s: 'cell' }]);
  dRows.push([], head(['PURPOSE OF VISIT & BRIEF', '', '', '']));
  for (const r of c.purpose) dRows.push([{ v: r[0], s: label }, { v: r[1], s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }]);
  const base = dRows.length;
  dRows.push([], head(['ADDITIONAL NOTES & SIGN-OFF', '', '', '']));
  for (const r of c.signoff) dRows.push(r.length === 2 ? [{ v: r[0], s: label }, { v: r[1], s: 'cell' }, { v: '', s: 'cell' }, { v: '', s: 'cell' }] : [{ v: r[0], s: label }, { v: r[1], s: 'cell' }, { v: r[2], s: label }, { v: r[3], s: 'cell' }]);
  const merges = [];
  dRows.forEach((r, i) => { if (r.length === 4 && r[2]?.v === '' && r[3]?.v === '' && r[0]?.s === label) merges.push(`B${i + 1}:D${i + 1}`); });
  sheets.push({ name: 'Repair survey', cols: [{ w: 28 }, { w: 40 }, { w: 24 }, { w: 40 }], rows: dRows, merges, hideGrid: true, landscape: true });
  void base;

  // ----- schedule of repairs -----
  const THUMB = 56, GAP = 4, perLine = 4;
  const sRows = [head(['No.', 'Location / element', 'Current condition', 'Suggested causation', 'Recommended rectification', 'Photo no.', 'Images'])];
  const sImages = [];
  let rowIdx = 1;
  for (const r of c.rows) {
    const phs = rowPhotoNumbers(rep, r);
    const text = [r.location, r.condition, r.causation, r.fix];
    const widths = [26, 36, 32, 38];
    const lines = Math.max(1, ...text.map((t, i) => String(t || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / widths[i])), 0)));
    const thumbLines = Math.ceil(phs.length / perLine);
    const h = Math.max(lines * 15 + 4, thumbLines ? thumbLines * (THUMB + GAP) * 0.75 + 4 : 0);
    sRows.push({ h, cells: [{ v: c.nums.get(r.id), s: 'cell' }, ...text.map((t) => ({ v: t || '', s: 'cell' })), { v: phs.map((p) => p.n).join(', '), s: 'cell' }, { v: '', s: 'cell' }] });
    for (const [k, p] of phs.entries()) {
      const img = await loadImage(p.id);
      if (!img) continue;
      const s = Math.min(THUMB / img.w, THUMB / img.h);
      sImages.push({ row: rowIdx, col: 6, dx: 3 + (k % perLine) * (THUMB + GAP), dy: 2 + Math.floor(k / perLine) * (THUMB + GAP), wPx: img.w * s, hPx: img.h * s, bytes: img.bytes, type: img.type, key: p.id, descr: `Photo ${p.n}` });
    }
    rowIdx++;
  }
  if (!c.rows.length) sRows.push([{ v: 'No repairs recorded.', s: 'note' }]);
  sheets.push({
    name: 'Schedule of repairs', cols: [{ w: 6 }, { w: 26 }, { w: 36 }, { w: 32 }, { w: 38 }, { w: 10 }, { w: 36 }],
    rows: sRows, freeze: { row: 1 }, landscape: true, images: sImages,
  });

  // ----- materials -----
  if (c.mats.length) {
    const mRows = [head(['Repair', 'Material', 'Qty', 'Unit'])];
    for (const m of c.mats) mRows.push([{ v: materialSource(rep, m.rowId, c.nums) || 'Added by surveyor', s: 'cell' }, { v: m.item, s: 'cell' }, { v: m.qty, s: 'cell' }, { v: m.unit, s: 'cell' }]);
    sheets.push({ name: 'Materials', cols: [{ w: 36 }, { w: 44 }, { w: 10 }, { w: 12 }], rows: mRows, freeze: { row: 1 }, landscape: true });
  }

  // ----- large photos -----
  if (c.photos.length) {
    const pRows = [];
    const pImages = [];
    const ROW_PX = 20;
    let r = 0;
    for (const p of c.photos) {
      const img = await loadImage(p.id);
      if (!img) continue;
      const s = Math.min(560 / img.w, 420 / img.h);
      const wPx = img.w * s, hPx = img.h * s;
      pRows.push([{ v: `Photo ${p.n}  -  ${p.caption}`, s: 'bold' }]);
      pImages.push({ row: r + 1, col: 0, dx: 2, dy: 2, wPx, hPx, bytes: img.bytes, type: img.type, key: p.id, descr: `Photo ${p.n}` });
      const gap = Math.ceil(hPx / ROW_PX) + 1;
      for (let i = 0; i < gap; i++) pRows.push([]);
      pRows.push([]);
      r += 1 + gap + 1;
    }
    sheets.push({ name: 'Photos', cols: [{ w: 80 }], rows: pRows, images: pImages, hideGrid: true, landscape: true });
  }
  return { sheets };
}

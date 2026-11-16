// Export engine: every document can be exported as PDF, Word (.docx) or Excel (.xlsx), and the most suitable
// format is offered first. PDF is built by pdf.js as before; Word and Excel are written from each document's own
// description (js/export/docs/*): costings, inspection reports and floor plans today.
//
// To add a document type (repair survey, quote, invoice, RAMS…): write docs/<name>.js with a model builder (for
// Word) and a workbook builder (for Excel), then add it to modelFor / workbookFor and formatChoices below.
import { isPrice, isPlan, isInspection, todayLocal } from '../model.js';
import { fileBase } from '../properties.js';
import { buildXlsx } from './xlsx.js';
import { buildDocx } from './docx.js';
import { loadPhotos, resizeImage } from '../photos.js';

export const FORMATS = {
  pdf: { label: 'PDF', ext: 'pdf', emoji: '📄', mime: 'application/pdf' },
  docx: { label: 'Word', ext: 'docx', emoji: '📝', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { label: 'Excel', ext: 'xlsx', emoji: '📊', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

/** The formats for a document, most suitable first, each with a one-line reason. */
export function formatChoices(job) {
  const pick = (list) => list.map(([format, why]) => ({ format, why, ...FORMATS[format] }));
  if (isPrice(job)) {
    return pick([
      ['xlsx', 'Live formulas: change a quantity, price, markup or the VAT and every total updates. Product links stay clickable.'],
      ['pdf', 'To send to the customer – looks the same on every device.'],
      ['docx', 'To edit the wording or add your own letter around it.'],
    ]);
  }
  if (isPlan(job)) {
    return pick([
      ['pdf', 'The plan drawn to scale with its key – ready to print or send.'],
      ['xlsx', 'Room, door, window and cabinet schedules to sort, check and order from.'],
      ['docx', 'The drawings and schedules in a document you can edit.'],
    ]);
  }
  return pick([
    ['pdf', 'The full report with every photo – best to send and keep as the record.'],
    ['docx', 'An editable report: change the wording or add to it.'],
    ['xlsx', 'Defects, rooms, services and materials as tables you can filter and total.'],
  ]);
}

/** The editable format that suits a document best (added to its pack next to the PDF). */
export const bestEditable = (job) => (isInspection(job) ? 'docx' : 'xlsx');

export const exportFilename = (job, format) => `${fileBase(job)} - ${todayLocal()}.${FORMATS[format].ext}`;

/** A photo ready for Word: a moderate size, so the file stays emailable. */
function photoLoader(onProgress) {
  const cache = new Map();
  let n = 0;
  return async (id) => {
    if (cache.has(id)) return cache.get(id);
    const [rec] = await loadPhotos([id]);
    if (!rec) return null;
    onProgress(`Adding photo ${++n}…`);
    const small = await resizeImage(rec.blob, 1200, 0.75);
    const out = { bytes: new Uint8Array(await small.blob.arrayBuffer()), w: small.w, h: small.h, type: 'image/jpeg' };
    cache.set(id, out);
    return out;
  };
}

/** The pages of a PDF as PNG pictures (used for the drawings in a Word floor plan). */
async function pdfPagesAsImages(blob, scale = 1.6) {
  const { loadPdfJs } = await import('./preview.js');
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const png = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    out.push({ bytes: new Uint8Array(await png.arrayBuffer()), w: canvas.width, h: canvas.height, type: 'image/png' });
  }
  doc.destroy();
  return out;
}

/** The workbook description for a document (Excel). */
export async function workbookFor(job, { includeCode = false } = {}) {
  if (isPrice(job)) return (await import('./docs/costing.js')).costingWorkbook(job);
  if (isPlan(job)) return (await import('./docs/plan.js')).planWorkbook(job);
  const m = await import('./docs/inspection.js');
  return m.inspectionWorkbook(job, await m.collectInspection(job, { includeCode }));
}

/** The document description for a document (Word). */
export async function modelFor(job, { includeCode = false, onProgress = () => {} } = {}) {
  if (isPrice(job)) return (await import('./docs/costing.js')).costingModel(job);
  if (isPlan(job)) {
    const { buildPdf } = await import('./pdf.js');
    onProgress('Drawing the plan…');
    const pages = await pdfPagesAsImages(await buildPdf(job));
    return (await import('./docs/plan.js')).planModel(job, pages);
  }
  const m = await import('./docs/inspection.js');
  return m.inspectionModel(job, await m.collectInspection(job, { includeCode }));
}

/** Export a document in a format. Returns { blob, filename }. */
export async function exportDocument(job, format, { includeCode = false, onProgress = () => {} } = {}) {
  let blob;
  if (format === 'pdf') {
    const { buildPdf } = await import('./pdf.js');
    blob = await buildPdf(job, { includeCode, onProgress });
  } else if (format === 'xlsx') {
    onProgress('Building the spreadsheet…');
    blob = await buildXlsx(await workbookFor(job, { includeCode }));
  } else if (format === 'docx') {
    onProgress('Building the document…');
    blob = await buildDocx(await modelFor(job, { includeCode, onProgress }), { loadImage: photoLoader(onProgress) });
  } else {
    throw new Error(`Unknown format: ${format}`);
  }
  return { blob, filename: exportFilename(job, format) };
}

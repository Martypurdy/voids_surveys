// In-app PDF preview (PDF.js, loaded on demand from /vendor). Works the same on
// iPhone, Android and desktop – phones can't reliably show PDFs inside a page.
import { h, toast, trackOverlay } from '../ui.js';
import { deliverFile } from './deliver.js';

let libPromise = null;
export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => {
      libPromise = null;
      reject(new Error('Could not load the PDF viewer'));
    };
    document.head.append(s);
  });
  return libPromise;
}

/** Full-screen preview with Share/Save. Resolves when closed. */
export function previewPdf(blob, filename, { title = 'Report preview' } = {}) {
  return new Promise(async (resolve) => {
    const pages = h('div', { class: 'preview-pages' }, h('p', { class: 'preview-status' }, 'Loading preview…'));
    let doc = null;
    let untrack = () => {};
    const close = () => {
      if (!overlay.isConnected) return;
      untrack();
      overlay.remove();
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
      doc?.destroy();
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'preview', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'PDF preview' },
      h('header', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', {
          type: 'button',
          class: 'btn-small preview-share',
          // deliverFile runs inside this tap, which share sheets require.
          onclick: () => deliverFile(blob, filename),
        }, 'Share / Save'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close preview', onclick: close }, '✕')),
      pages);
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', onKey);
    untrack = trackOverlay(() => { untrack = () => {}; close(); }); // phone back button

    try {
      const pdfjs = await loadPdfJs();
      doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      pages.replaceChildren();
      const width = Math.min(pages.clientWidth - 16, 900);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= doc.numPages; n++) {
        if (!overlay.isConnected) break;
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        const canvas = h('canvas', { class: 'preview-page', 'aria-label': `Page ${n}` });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        pages.append(canvas, h('div', { class: 'preview-pageno' }, `Page ${n} of ${doc.numPages}`));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
    } catch (e) {
      if (!overlay.isConnected) return; // closed while still drawing – nothing to report
      console.error(e);
      pages.replaceChildren(h('p', { class: 'preview-status' }, 'The preview couldn’t be shown on this device – use Share / Save to open the PDF.'));
      toast(e.message);
    }
  });
}

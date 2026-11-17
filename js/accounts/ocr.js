// Accountancy: read the text on a receipt picture, on this device (Tesseract.js, WebAssembly). Nothing is uploaded.
// The scanner files (about 7 MB) are in vendor/tesseract/. The first scan fetches them and the service worker keeps them,
// so scanning works offline afterwards.
const DIR = 'vendor/tesseract/';
const abs = (p) => new URL(p, document.baseURI).href;

let scriptPromise = null;
let workerPromise = null;
let onProgress = () => {};

function loadScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  scriptPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${DIR}tesseract.min.js`;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { scriptPromise = null; reject(new Error('The receipt scanner could not be loaded. Connect to the internet once, then try again.')); };
    document.head.append(s);
  });
  return scriptPromise;
}

async function getWorker() {
  workerPromise ||= (async () => {
    const T = await loadScript();
    const worker = await T.createWorker('eng', 1, {
      workerPath: abs(`${DIR}worker.min.js`),
      corePath: abs(DIR),
      langPath: abs(DIR),
      gzip: true,
      cacheMethod: 'none', // the service worker already keeps the files
      logger: (m) => { if (m.status) onProgress(m); },
    });
    await worker.setParameters({ preserve_interword_spaces: '1' });
    return worker;
  })().catch((e) => { workerPromise = null; throw e; });
  return workerPromise;
}

/** Free the scanner's memory (call when a batch is finished). */
export async function closeScanner() {
  const p = workerPromise;
  workerPromise = null;
  if (p) { try { await (await p).terminate(); } catch { /* already gone */ } }
}

/** Greyscale, stretched contrast and big enough to read: receipts are small, faint print. Returns a canvas. */
export async function prepare(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.max(1, Math.min(2.5, 1400 / bmp.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Read a receipt picture. progress({ status, progress }) is called as it goes (0 to 1).
 * Till receipts have a name on the left and a price far to the right, and the scanner sometimes splits those into two
 * columns, so the picture is read as one block first and, when that does not give a confident answer, as a column of text
 * too. score(text) says how good a reading is (higher is better); the first one that reaches goodScore wins, else the best.
 * Resolves with the text, or throws an Error with a message fit to show.
 */
export async function readReceipt(blob, progress = () => {}, score = () => 0, goodScore = Infinity) {
  onProgress = progress;
  try {
    const worker = await getWorker();
    const canvas = await prepare(blob);
    let best = '', bestScore = -1;
    for (const mode of ['6', '4']) { // 6 = one uniform block, 4 = one column of text of varying sizes
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      const { data } = await worker.recognize(canvas);
      const text = data.text || '';
      const s = score(text);
      if (s > bestScore) { best = text; bestScore = s; }
      if (bestScore >= goodScore) break;
    }
    canvas.width = canvas.height = 0;
    return best;
  } catch (e) {
    console.error(e);
    if (/shorter|loaded/.test(e.message)) throw e;
    throw new Error('This device could not read the receipt. You can type the details in instead.');
  }
}

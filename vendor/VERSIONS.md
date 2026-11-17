# Vendored libraries

Committed so the app works offline with no CDN requests at runtime.

| File | Package | Version | Source | Licence |
|------|---------|---------|--------|---------|
| `idb-keyval.js` | idb-keyval | 6.2.1 | https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/dist/index.js | Apache-2.0 |
| `jspdf.umd.min.js` | jsPDF | 2.5.2 | https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js | MIT |
| `pdf.min.js`, `pdf.worker.min.js` | pdfjs-dist (PDF.js) | 3.11.174 | https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/ | Apache-2.0 |
| `tesseract/tesseract.min.js`, `tesseract/worker.min.js` | tesseract.js | 7.0.0 | https://www.npmjs.com/package/tesseract.js/v/7.0.0 (`dist/`) | Apache-2.0 |
| `tesseract/tesseract-core-relaxedsimd-lstm.wasm.js`, `tesseract/tesseract-core-simd-lstm.wasm.js` | tesseract.js-core | 7.0.0 | https://www.npmjs.com/package/tesseract.js-core/v/7.0.0 | Apache-2.0 |
| `tesseract/eng.traineddata.gz` | @tesseract.js-data/eng (`4.0.0_best_int`) | 1.0.0 | https://www.npmjs.com/package/@tesseract.js-data/eng/v/1.0.0 | Apache-2.0 (data) |

The `tesseract/` files read receipts on the device (Accountancy). They are about 7 MB, so they are NOT in the service worker's
install list: they are fetched and cached the first time a receipt is scanned (see `sw.js`, cache `ocr-files-v1`). Two builds of the engine are
included (relaxed SIMD for newer browsers, SIMD for 2021 onwards); a device only downloads the one it uses (about 4 MB).

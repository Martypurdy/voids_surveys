# Accountancy (Phase 6)

The Accountancy button on the home screen opens `#/accounts`: receipts by UK tax year, read on the device.

## Where things are

- `js/accounts/hmrc.js`: the 14 expense headings (from the HMRC Self Assessment form) and tax year helpers.
- `js/accounts/parse.js`: picks the date, supplier, total and VAT out of the scanned text, and says how sure it is of each.
- `js/accounts/ocr.js`: loads the scanner (Tesseract.js, from `vendor/tesseract/`), prepares the picture and reads it.
- `js/accounts/store.js`: receipts (own IndexedDB store `voids-receipts`), pictures (the photo store, jobId `receipts`), supplier rules and settings.
- `js/accounts/totals.js`: totals per category and month (pure, in pence). `js/accounts/export.js`: Excel with SUMIFS formulas.
- `js/views/accounts.js` (the screen) and `js/views/receiptReview.js` (check-and-correct).

## Things to know

- **Scanner size:** about 7 MB per device (engine about 4 MB, English data about 3 MB), fetched the first time a receipt is scanned and kept by
  the service worker in its own cache (`ocr-files-v1`), so app updates do not re-download it.
- **Two readings:** till receipts put a name on the left and a price far right, and the scanner can split these into two columns. The picture is read
  as one block first and, if it is not confident, as a column of text as well; the better reading is used.
- **VAT:** when VAT registered, a receipt's VAT is separated out (cost = total less VAT). Otherwise the full amount is the cost.
- **Back button:** overlays use `trackOverlay`; open the next one a moment after closing the last (see `scanBatch`).
- **Backups:** receipts are not part of the job backups yet. The accountant pack (Phase 8) will hold everything for a tax year, pictures included.

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

## Categories

`CATEGORIES` in `hmrc.js` starts with **Cost of sales (materials, hardware and small tools)**, then the 14 HMRC headings. Users can add their own (a box under the category list on the receipt screen, and **My categories** on the Accountancy screen). Custom categories are stored in the receipts store (`__categories`), loaded into `hmrc.js` by `loadCustomCategories()` when the screen opens, and appear in the lists, the filter, the totals and the Excel export. Removing one sends its receipts back to *Not sorted yet*.

## Companies and projects (businesses)

Every receipt has a `businessId`; there is always at least one business (`My business` is made on first use). A business is
`{ id, name, color, vatRegistered }`, stored in the receipts store (`__businesses`), loaded by `loadBusinesses()`. The Accountancy screen has a
Company / project bar like the tax year one, and the top bar (and the receipt screen's "For" bar) takes the business's colour (`inkFor` picks black
or white text). Totals, the receipts list, supplier rules (`businessId|supplier`) and the VAT setting are all per business. Receipts and rules from
before businesses existed belong to the first business. Anything finance-related added later (invoices, quotes, mileage) should carry a
`businessId` the same way.

## Receipt screen: checking what was read

A field the scanner was unsure about is highlighted pale orange with dark text and an "I have checked this" tick. Ticking it, or correcting it,
turns the box green-outlined and marked checked; unticking brings the warning back.

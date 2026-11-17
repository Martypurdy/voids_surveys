# Quotes and invoices (Phase 7)

Pricing on the home screen offers **Quote** and **Invoice** (`job.form` is `quote` or `invoice`; `job.doc` holds the document). Tabs: Address, Items, Terms.

## Where things are

- `js/docs/money.js`: the sums in pence (`docTotals`), statuses (`docStatus`, overdue), date helper.
- `js/docs/create.js`: `initDoc` (company, number, dates, VAT, terms), `changeBusiness` (the number follows unless typed over), `quoteFromCosting`, `invoiceFromQuote`.
- `js/docs/ui.js`: the coloured company bar shared by the screens. `js/views/businessDialog.js`: add / edit / remove companies, including the details printed on documents.
- `js/views/docItems.js`, `js/views/docTerms.js`: the Items and Terms tabs. The Address tab is `jobAddress.js` (client box, site address).
- `js/export/docs/document.js`: the Word model and the Excel workbook (live formulas). The PDF is `docReport()` in `js/export/pdf.js`.
- `js/accounts/store.js`: business details and numbering, and `syncIncome` (a paid invoice becomes an income record `inv-<job id>`).

## Rules

- Line amount = qty (blank counts as 1) x price, rounded to the penny. Discount is a £ amount or a % of the subtotal (never more than it). VAT is added once on the net. Paid (a deposit) never exceeds the total.
- A costing becomes customer lines at cost plus markup per unit (up to 4 decimals), VAT brought back to before-VAT when the costing's prices included it. The quote's totals agree with the costing within a penny.
- Numbers come from the company's own counter (`Q-0001`, `INV-0001`…). Changing a document's company hands the old number back when it was the latest and takes the new company's next number, unless the number was typed over.
- Income follows the invoice: Paid with a date creates it, changing the invoice updates it, un-paying or deleting removes it (`pruneIncome` also tidies up when Accountancy opens).
- Not included: credit notes, recurring invoices, a logo image, emailing.

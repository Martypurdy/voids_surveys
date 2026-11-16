# Export engine (Phase 2)

Every document can be exported as **PDF**, **Word (.docx)** or **Excel (.xlsx)**. Exporting opens a chooser that lists
the formats with the one that suits the document best first, and a one-line reason for each.

| Document | First | Then |
|----------|-------|------|
| Costing (Materials & labour) | Excel (live formulas) | PDF, Word |
| Inspection report (Empty home, Ready to let) | PDF (photos, the record) | Word, Excel |
| Floor plan (Designer) | PDF (drawn to scale) | Excel (schedules), Word |

A pack (zip) holds the PDF plus the best editable copy: Excel for costings and plans, Word for inspections.

## Where things are

- `js/export/engine.js`: `formatChoices(job)`, `exportDocument(job, format)`, `bestEditable(job)`.
- `js/export/xlsx.js`, `js/export/docx.js`: the two file writers. No library: both formats are zipped XML, written with
  `zip.js`. Their cell / block formats are documented at the top of each file.
- `js/export/docs/costing.js`, `inspection.js`, `plan.js`: what each document says, for Word (`…Model`) and Excel
  (`…Workbook`).
- `js/export/pdf.js`: the PDF builder (unchanged apart from clickable product links in a costing).
- `js/views/exportChooser.js`: the Export… dialog.

## Excel costing: live formulas

The workbook reproduces `pricing.js` exactly (and is checked against it by recalculating 200 random costings with an
independent formula engine):

- line cost = quantity (blank counts as 1) x price
- line markup = a flat £ amount for the line, or cost x markup %
- total as entered = materials + labour + delivery
- "+ VAT": VAT = total x rate; "Inc VAT": net = total / (1 + rate); "No VAT": rate 0

Yellow cells are inputs. The VAT mode (a drop-down) and the VAT rate are on the Summary sheet; each table has spare
formula rows so lines can be added. Product links are clickable in Excel, Word and the PDF.

## Adding a document type

1. Write `js/export/docs/<name>.js` with a Word model (title, details, sections with paragraphs, tables, photos, images)
   and an Excel workbook (sheets of cells; use `{ v, f }` for a formula and `{ v, link }` for a link).
2. Add it to `modelFor`, `workbookFor` and `formatChoices` in `engine.js`, and say which format suits it best.
3. Add the new files to `ASSETS` in `sw.js`.
4. Test the Excel output by recalculating it independently and comparing with the app; test Word output with a reader.

## Checking

The tests (kept outside the repo) read the files with independent tools (an Excel reader, a Word reader and a
formula engine) and validate every part is well-formed with consistent relationships. They cannot prove Microsoft
Office itself accepts a file, so open one sample of each in real Word and Excel after changing a writer.

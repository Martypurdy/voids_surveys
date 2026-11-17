Principles throughout: offline-first, all data on the device, no backend, no accounts.
Quick work never needs an address: forms and tools start from buttons on the home screen. Properties
and history sit behind the "Properties and history" button, and a quick job joins an address when it is given one.

How to use this roadmap: when "do phase N" is requested, build only that phase, tick its items
below, bump the service worker VERSION, commit and push, then stop and summarise.
Before each phase, show a short plan and wait for an OK.

# Void Surveys – Roadmap

## Phase 0 – Responsive layout (desktop, tablet, mobile)
- [x] Desktop: use the full screen width, not a narrow phone column. Multi-column layouts
  where it helps (e.g. property list + selected property side by side), wide
  spreadsheet-style tables for surveys and materials.
- [x] Tablet: landscape and portrait use the extra room (Designer full screen with a movable, resizable panel; forms in
  two columns; properties list beside the selected property). Phone landscape: no special treatment (scope reduced).
- [x] Portrait still works on phones for quick data entry.
- [ ] Wide screens (repair survey, materials list, calculators) suggest rotating to
  landscape on phones, but never force it. (Dropped for now: phone landscape is not a priority.)
- [x] manifest.webmanifest: set "orientation": "any" so the installed app rotates freely.
- [x] Test at phone portrait, tablet portrait, tablet landscape and desktop (and 1920 wide). Phone portrait is checked pixel-for-pixel against the previous screenshots.
- [x] All later phases must follow these layout rules: see docs/layout.md.

## Phase 1 – Property-based structure
- [x] Front screen lists PROPERTIES, not jobs. Search bar: postcode, address or reference.
- [x] Each property has a newest-first timeline of everything done there.
- [x] Each entry (void inspection, repair survey, kitchen plan, etc.) is its own folder
  inside the property, holding the entry plus everything linked to it
  (photos, materials list, quote, invoice, RAMS).
- [x] Must scale to thousands of properties.
- [x] Migrate existing void inspection jobs into this structure without data loss.
- [x] Export a whole entry folder as one pack (zip). Also built: the whole property file as one zip (a folder per entry, oldest first), and Import for packs.
- [x] Entries are named "first line of address, postcode – nature of file" (e.g. 12 Demo Street, AB1 2CD – Empty home works); the nature can be renamed. Used for pack, PDF and backup file names.
- [ ] Later: archive old entries to a pack and remove them from the device, to free storage (photos are the bulk).

## Phase 2 – Export engine (shared by everything)
- [x] Every document exports to PDF, Word (.docx) and Excel (.xlsx). Built for the documents that exist today (costing, inspection reports, floor plans); later phases plug into the same engine (see docs/exports.md).
- [x] Offer the most suitable format first for each document type.
- [x] Excel exports contain LIVE formulas (line totals, subtotal, VAT, grand total),
  and product links stay clickable.

## Phase 3 – Repair survey
- [x] Lives under **Property inspection** on the home screen (the form is called Property repair survey). Tabs: Address, Visit, Repairs, Materials, Sign off. Built from the paper template the user supplied (project details, purpose of visit, schedule of repairs, additional notes and sign-off).
- [x] Landscape, spreadsheet-style layout: the Repairs tab is a table on tablets and desktops and a stack of cards on a phone; PDF and Word print landscape.
- [x] Property details and tenant / contact details, both with postcode look-up (api.postcodes.io). Plus job / work order no., date, surveyor, property type, occupancy, weather and access arrangements.
- [x] Reason for visit (defect or upgrade) and the brief of the issue as reported.
- [x] Open sheet of rows: Location / element | Current condition | Suggested causation | Recommended rectification | Images. Rows are numbered; there is always an empty row at the bottom.
- [x] Each row can drop across into a Materials section ("→ Materials"); materials build a running list that says which repair each line came from.
- [x] Small numbered thumbnails in the schedule, with large, numbered photos at the end of the PDF, Word and Excel exports. Follow-up box left out (not wanted).
- [x] Exports through the Phase 2 engine: PDF, Word, Excel (Excel and Word writers now place pictures); packs hold the PDF plus the Word copy.

## Phase 4 – Materials & costing
- Paste a supplier URL to auto-fill description and price.
  REUSE the existing supplier lookup work: search for the supplier lookup notes,
  roughly `void surveys\void surveys.md` in the project folder (names may differ slightly).
  Works for Toolstation, Wickes, Selco and others; Screwfix is not supported.
- Keep every product link saved so users can revisit the page.
- Drop in a spreadsheet (xlsx/csv) to import items and prices. First time, ask which
  columns are description, quantity and price; remember that layout per supplier.
- Materials + labour costs total automatically.

## Phase 5 – RAMS & CDM
- [x] "Health and safety" button on the home screen, opening the **RAMS pack**: one pack per job, filed in the property folder. Tabs: Address, Plan, Risks, Methods, Briefing, Sign off.
- [x] Pre-filled from the repair survey ("Start from a repair survey": address, tenant or contact, job number, the brief and the repairs; each repair can start a method statement in one tap).
- [x] Plan (CDM 2015): a short construction phase plan for small jobs (people, dates, site rules, welfare, emergency, asbestos and services information, main dangers with controls, supervision), with a notifiable-job warning (over 30 working days with over 20 people, or over 500 person-days).
- [x] Common hazards pick list (original wording, editable) with who is harmed and starting controls.
- [x] Risk assessments in the simple HSE layout (hazard, who might be harmed and how, controls in place, further action, who, by when, done), plus a library you build up on the device ("Add hazards", "Save to library").
- [x] Blank dynamic risk assessment: a short "stop and check" card with an outcome, whose hazards can be saved to the library.
- [x] Method statements: description, linked risk assessments, people and competence, emergency arrangements, PPE, dust and fumes, hazardous materials, permits, step-by-step method with photos, tools and equipment.
- [x] Briefing record with attendee signatures; sign-off with the surveyor's signature.
- [x] Exports through the Phase 2 engine: one landscape document as PDF, Word and Excel (Word and PDF share one description), with a "starting point, not legal advice" line.
- Note: the hazard and control lists are starting points written for repairs and refurbishment work. The CITB, HSE and similar forms were used only as a guide to structure; none of their wording is copied.

## Phase 6 – Accountancy: receipt tracker
- [x] "Accountancy" button on the home screen, opening its own screen (not a form).
- [x] Choose a UK tax year (6 April to 5 April); receipts are assigned to it automatically from their date.
- [x] Add receipts by camera (several in a row), by multi-select from the gallery, or by hand.
- [x] On-device OCR (Tesseract.js, vendored, offline after the first scan) reads date, supplier, total and VAT. A VAT registered switch, plus a per-receipt "has VAT" tick.
- [x] Check-and-correct screen for every scan: the picture, the fields, and anything uncertain highlighted.
- [x] Receipts sorted by date, stored on the device only (own IndexedDB store; pictures in the photo store).
- [x] Categories are the HMRC Self Assessment expense headings (14), plus "Not sorted yet".
- [x] Supplier rules: file a supplier once and later receipts from them are filed there automatically (viewable and removable).
- [x] Spending totals per category per month and per year (VAT-aware); Excel export of a year with live SUMIFS totals.
- [x] The data model carries kind: 'expense' | 'income', so invoices (Phase 7) can slot in later.
- Notes: the scanner files (about 7 MB per device) are in `vendor/tesseract/` and cached on first use, not at install (see `docs/accounts.md`).

## Phase 7 – Quotes & invoices
- [x] Quote and Invoice forms under Pricing on the home screen. Each sits in a property folder (or "No address yet") with tabs Address, Items, Terms.
- [x] Each document is from one of your companies (the same coloured Company / project bar as Accountancy, and the top bar takes its colour). Businesses now hold the details printed on documents: address, contact, VAT and company number, bank details, standard terms, number prefixes and next numbers, payment days.
- [x] Make a quote from a Materials & labour costing (the customer sees cost plus markup, never the cost or markup); make an invoice from a quote (linked both ways, quote marked Accepted).
- [x] Items with quantity, unit and price; VAT (none or added at a rate), discount (£ or %), and an amount already paid / deposit; totals worked out as you type.
- [x] Statuses (quote: Draft, Sent, Accepted, Declined; invoice: Draft, Sent, Paid, and Overdue automatically past the due date). Numbers are per company and can be typed over.
- [x] Marking an invoice Paid (with the date) adds it to Accountancy as income for its company (new Income tab, income and income-less-spending in the summary); it follows the invoice if the amount changes, and goes if the invoice is un-paid or deleted.
- [x] Exports through the Phase 2 engine: PDF (the company's colour and details, items, totals, how to pay, terms), Word, and Excel with live formulas. Packs hold the PDF plus the Excel copy.
- Notes: credit notes, recurring invoices, a logo image and sending by email are not included (share sheet as for the other reports). See `docs/documents.md`.

## Phase 8 – Accountant pack
- One download per tax year: spreadsheet of all receipts and invoices,
  totals by HMRC category, profit summary, and all receipt images.

## Phase 9 – Calculators
- [x] "Calculators" button on the home screen: pick a calculator and it opens as a **calculation** (a small entry filed in a property folder, or "No address yet"). Tabs: Address (optional client and location with postcode look-up), Calculate, Materials.
- [x] Every calculator has a wastage option (a percentage added to everything, or a fixed extra on the main item). Anything bought in packs rounds up to whole packs afterwards.
- [x] "Add to materials list" puts the results on the calculation's Materials tab, ready for links and prices in Phase 4; "Send to…" copies the list into a repair survey or costing at the same property.
- [x] The last-used sizes, assumptions and wastage are remembered per calculator (on the device).
- [x] Formulas and assumptions are shown on screen ("How this is worked out", editable assumptions), and in the exports.
- [x] Exports through the Phase 2 engine: PDF, Word, Excel (values and formula text, not live formulas).

Calculators built (13): Concrete; Bricks and blocks; Laminate and flooring; Screw converter; Unit converter; Tiles; Paint; Plasterboard and plaster; Stud wall; Insulation; Aggregates; Roof tiles; Fall and gradient. Defaults are typical figures, shown and editable; results are estimates. Each was tested against figures worked out separately (`docs/calculators.md`).
- [ ] Later: more calculators by trade (list to be expanded); live-formula Excel; copy a result between two calculations.

## Inspection to Ready to let
- [x] A 👍 Ready to let button on the property timeline bar of every finished Empty home inspection starts a Ready to let at the same property.
- [x] Copied: address, key safe location, pin and photos (never the code), fuse board and mains stop tap in full, the gas, electric and water meters' locations only (readings are photographed each visit), and the room and outside area lists with sizes. Nothing else (no defects, readings, signature, gifted items, tenant details).
- [x] Linked both ways ("Moved on to Ready to let" / "Started from an inspection"); pressing the button again warns and offers to open the one already started.
- [x] Ready to let Address tab: "Start from an inspection" lists the inspections at the property and fills only the blanks.
- Notes: code in `js/startRtl.js` and `js/views/rtlStart.js`; photos are copied as the new form's own records.

## Select and clear out (batch export and delete)
- [x] Properties and history › "Select, export or clear out many" opens a list of every entry on the device (search, type, status and age filters, Select all, tick boxes).
- [x] Export the ticked entries as one zip (or several parts when there are many photos): entry data and photos for each, optional PDF reports and key safe codes; importable again with Import.
- [x] Export, then remove: asks to check the file saved, then deletes the entries, their photos and any address left empty. Or Delete on its own, always with a confirmation.
- Later idea: a rule that checks an entry is backed up to a storage location and removes it from the device after a set period (needs the automatic storage push first).

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
- Landscape, spreadsheet-style layout.
- Property details and client details, both with postcode lookup (api.postcodes.io).
- Reason for visit (defect or upgrade).
- Open sheet of rows: Defect/Upgrade | Causation | Recommended fix | Photos.
- Each row can drop across into a Materials section; materials build a running list.

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
- Risk assessment and method statement (RAMS), pre-filled from the repair survey
  (address, job description).
- Common hazards pick list (working at height, dust, asbestos, etc.).
- Generic risk assessment library the user builds over time; pulls in property and
  project details automatically.
- Blank dynamic risk assessments for task-, time- and environment-specific conditions;
  can be saved back into the library as a new generic one.
- CDM paperwork for every job: responsible duty holders, task risks,
  simple Construction Phase Plan for small jobs.

## Phase 6 – Accountancy: receipt tracker
- "Accountancy" button on the front screen.
- Choose UK tax year (6 April to 5 April); receipts auto-assign by date.
- Add receipts by camera or multi-select from gallery.
- On-device OCR (Tesseract.js) reads date, supplier, amount, VAT; VAT on/off switch.
- Check-and-correct screen after each scan.
- Receipts sorted by date, stored locally.
- Categories based on HMRC Self Assessment expense headings.
- Supplier rules: once a supplier is categorised, future receipts auto-file there.
- Spending totals per category per month and per year.
- Data model must allow invoices (income) to slot in later.

## Phase 7 – Quotes & invoices
- Quote and invoice templates, exportable as PDF, Word and Excel.
- Can sit inside an entry folder and feed income into the accountancy data.

## Phase 8 – Accountant pack
- One download per tax year: spreadsheet of all receipts and invoices,
  totals by HMRC category, profit summary, and all receipt images.

## Phase 9 – Calculators
- "Calculators" button on the home screen: a separate feature set.
- Each calculation can carry client and project location details (same postcode
  lookup as elsewhere), linked to a property/entry folder.
- Every calculator has a wastage option (% or extra quantity) and an
  "Add to materials list" button that pushes results into that folder's materials list,
  ready for links and prices to be added later.
- Remember the user's last-used sizes and settings per calculator.
- Show all formulas and assumptions on screen so users can check them.

Calculators (starter set - full list by trade to be expanded later):
- Concrete: length x width x depth -> m3, plus bags of pre-mix or cement/sand/aggregate
  by chosen mix ratio.
- Bricks & blocks: wall length x height, user enters brick/block size and mortar joint
  thickness -> units, mortar volume, bags of cement and sand by mix ratio
  (e.g. 1:4, 1:5, 1:6). Optional openings to deduct.
- Laminate / flooring: room size + plank size -> planks; planks per pack -> packs;
  optional underlay rolls and beading/scotia lengths.
- Screw converter: imperial gauge and inch length (e.g. 3/4" x 6) <-> metric
  diameter x length in mm, both directions.
- Unit converter: length, area, volume, weight.
- Tiles: area + tile size + joint -> tiles, boxes, adhesive and grout.
- Paint: area, coats, coverage -> litres and tins.
- Plasterboard & plaster: area -> boards, screws, skim plaster bags.
- Stud wall: length x height, stud centres -> studs, noggins, head/sole plates.
- Insulation: area + depth -> rolls or boards.
- Aggregates: area x depth -> tonnes / bulk bags.
- Roof tiles: roof area + gauge/cover -> tiles, battens.
- Fall / gradient: length and fall -> ratio and %, or the reverse.

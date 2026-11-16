# Calculators (Phase 9)

The Calculators button on the home screen opens a list of calculators. Picking one starts a **calculation**: an entry like any
other form (`job.form === 'calc'`, `job.calc.kind` says which calculator), with tabs Address, Calculate and Materials.

## Where things are

- `js/calc/calculators.js`: every calculator, as plain data plus a `compute` function. No DOM. Also the unit tables, the
  screw gauge formula, `runCalc`, `defaultsFor` (the last-used values, from localStorage) and the wastage helper.
- `js/views/calcView.js`: the Calculate tab. `js/views/calcMaterials.js`: the Materials tab and "Send to…".
- `js/export/docs/calc.js`: the Word / PDF description (`calcModel`) and the Excel workbook.

## Adding a calculator

Add an object to `CALCS` with `inputs`, `assumptions`, a default `waste` and `compute(v, a, w)`. `v` holds the inputs as numbers,
`a` the assumptions, and `w(qty, main)` adds wastage to a quantity (pass `true` for the main item: a fixed extra goes on it only).
Round anything bought in packs up AFTER calling `w`. Return `results` (shown), `lines` (for the materials list) and `steps`
(the formulas with the numbers filled in). Then add a test with an answer worked out separately.

## Assumptions

Bag yields, coverage, densities and mixes are typical figures, shown on screen and editable per calculation. They are estimates: the
product label and the real job win.

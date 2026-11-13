// Room parts and their defect lists.
//
// DRAFT lists – to be replaced by items filtered/summarised from the SOR
// spreadsheet. Keep this shape so the screens don't need to change:
//   { key, label, fill, defects: [{ id, label, unit }] }
//   id   – stable code (will become the SOR code)
//   unit – 'm2' (square metres), 'nr' (quantity) or 'm' (linear metres)
//   fill – which room-size figure pre-fills m²/m items for this part
// No prices/rates here: this file is published on the public website.

export const UNITS = {
  m2: { label: 'm²', input: 'm²', count: false },
  m: { label: 'm', input: 'm', count: false },
  nr: { label: 'nr', input: 'Qty', count: true },
  item: { label: 'item', input: 'Qty', count: true },
  pair: { label: 'pair', input: 'Pairs', count: true },
  m3: { label: 'm³', input: 'm³', count: false },
  hr: { label: 'hr', input: 'Hours', count: false },
  wk: { label: 'wk', input: 'Weeks', count: false },
  kg: { label: 'kg', input: 'kg', count: false },
};

/** "×2", "6 m²", "14 m" … */
export function qtyText(qty, unit) {
  if (!qty) return '';
  const u = UNITS[unit] || UNITS.nr;
  return u.count ? `×${qty}` : `${qty} ${u.label}`;
}

/** Label and unit for a saved defect – stored on the defect, else from the draft list. */
export function defectInfo(part, d) {
  const draft = part ? defectById(part, d.id) : null;
  return { label: d.d || draft?.label || d.id, unit: d.u || draft?.unit || 'nr' };
}

export const PARTS = [
  {
    key: 'ceiling',
    label: 'Ceiling',
    fill: 'ceiling',
    defects: [
      { id: 'CEI-01', label: 'Cracked plaster', unit: 'm2' },
      { id: 'CEI-02', label: 'Loose / sagging plaster', unit: 'm2' },
      { id: 'CEI-03', label: 'Holes to make good', unit: 'nr' },
      { id: 'CEI-04', label: 'Damp / water stain', unit: 'm2' },
      { id: 'CEI-05', label: 'Mould treatment', unit: 'm2' },
      { id: 'CEI-06', label: 'Artex – asbestos test', unit: 'nr' },
      { id: 'CEI-07', label: 'Remove polystyrene tiles', unit: 'm2' },
      { id: 'CEI-08', label: 'Redecorate (emulsion)', unit: 'm2' },
    ],
  },
  {
    key: 'walls',
    label: 'Walls',
    fill: 'walls',
    defects: [
      { id: 'WAL-01', label: 'Cracked plaster', unit: 'm2' },
      { id: 'WAL-02', label: 'Blown / hollow plaster', unit: 'm2' },
      { id: 'WAL-03', label: 'Holes to make good', unit: 'nr' },
      { id: 'WAL-04', label: 'Damp', unit: 'm2' },
      { id: 'WAL-05', label: 'Mould treatment', unit: 'm2' },
      { id: 'WAL-06', label: 'Remove graffiti', unit: 'm2' },
      { id: 'WAL-07', label: 'Strip wallpaper', unit: 'm2' },
      { id: 'WAL-08', label: 'Remove fixings / shelves', unit: 'nr' },
      { id: 'WAL-09', label: 'Redecorate (emulsion)', unit: 'm2' },
    ],
  },
  {
    key: 'floor',
    label: 'Floor',
    fill: 'floor',
    defects: [
      { id: 'FLR-01', label: 'Damaged / missing boards', unit: 'm2' },
      { id: 'FLR-02', label: 'Uneven floor', unit: 'm2' },
      { id: 'FLR-03', label: 'Trip hazard', unit: 'nr' },
      { id: 'FLR-04', label: 'Remove floor covering', unit: 'm2' },
      { id: 'FLR-05', label: 'Renew vinyl', unit: 'm2' },
      { id: 'FLR-06', label: 'Damp', unit: 'm2' },
      { id: 'FLR-07', label: 'Clean floor', unit: 'm2' },
    ],
  },
  {
    key: 'woodwork',
    label: 'Woodwork',
    fill: 'perimeter',
    defects: [
      { id: 'WDW-01', label: 'Renew skirting', unit: 'm' },
      { id: 'WDW-02', label: 'Renew architrave', unit: 'm' },
      { id: 'WDW-03', label: 'Rot treatment', unit: 'm' },
      { id: 'WDW-04', label: 'Paint woodwork', unit: 'm' },
    ],
  },
  {
    key: 'door',
    label: 'Door',
    fill: null,
    defects: [
      { id: 'DOR-01', label: 'Damaged / holed door', unit: 'nr' },
      { id: 'DOR-02', label: 'Won’t close / latch', unit: 'nr' },
      { id: 'DOR-03', label: 'Ease and adjust', unit: 'nr' },
      { id: 'DOR-04', label: 'Handle / furniture missing', unit: 'nr' },
      { id: 'DOR-05', label: 'Hinges loose', unit: 'nr' },
      { id: 'DOR-06', label: 'Fire door defect (closer / seals)', unit: 'nr' },
      { id: 'DOR-07', label: 'Door missing', unit: 'nr' },
      { id: 'DOR-08', label: 'Paint door', unit: 'nr' },
    ],
  },
  {
    key: 'window',
    label: 'Window',
    fill: null,
    defects: [
      { id: 'WIN-01', label: 'Broken / cracked glass', unit: 'nr' },
      { id: 'WIN-02', label: 'Blown double glazing', unit: 'nr' },
      { id: 'WIN-03', label: 'Won’t open / close', unit: 'nr' },
      { id: 'WIN-04', label: 'Handle missing / broken', unit: 'nr' },
      { id: 'WIN-05', label: 'Restrictor missing / broken', unit: 'nr' },
      { id: 'WIN-06', label: 'Seals / mastic failed', unit: 'm' },
      { id: 'WIN-07', label: 'Trickle vent damaged', unit: 'nr' },
      { id: 'WIN-08', label: 'Mould / condensation', unit: 'm2' },
    ],
  },
];

export const partByKey = (key) => PARTS.find((p) => p.key === key);
export const defectById = (part, id) => part.defects.find((d) => d.id === id);

// Property repair survey: small shared helpers (no DOM). A schedule row counts once anything is typed or a photo
// is taken; counted rows are numbered 1, 2, 3 … in order, on screen, in the exports and in the materials list.

const blank = (v) => String(v ?? '').trim() === '';

export const isBlankRow = (r) => blank(r.location) && blank(r.condition) && blank(r.causation) && blank(r.fix) && !(r.photos || []).length;
export const isBlankMaterial = (m) => blank(m.item) && blank(m.qty) && blank(m.unit);

/** The rows that have something in them. */
export const usedRows = (repair) => repair.rows.filter((r) => !isBlankRow(r));

/** Map of row id -> its number (1, 2, 3 …) for rows that have something in them. */
export function rowNumbers(repair) {
  const m = new Map();
  usedRows(repair).forEach((r, i) => m.set(r.id, i + 1));
  return m;
}

/** "Repair 2 - Kitchen, under sink" for a materials line, or "Added by you". */
export function materialSource(repair, rowId, numbers = rowNumbers(repair)) {
  const row = repair.rows.find((r) => r.id === rowId);
  if (!row || !numbers.has(row.id)) return '';
  const where = String(row.location || '').split('\n')[0].trim();
  return `Repair ${numbers.get(row.id)}${where ? ` - ${where}` : ''}`;
}

/** Materials that have something in them, in schedule order (hand-added ones last). */
export function usedMaterials(repair) {
  const order = new Map(repair.rows.map((r, i) => [r.id, i]));
  return repair.materials
    .filter((m) => !isBlankMaterial(m))
    .map((m, i) => ({ m, i, o: order.has(m.rowId) ? order.get(m.rowId) : Infinity }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.m);
}

/**
 * Every photo of a repair survey in report order, numbered from 1: [{ id, n, row, caption }].
 * row: the schedule row number it belongs to. The small pictures in the schedule and the large ones at the end
 * use the same numbers, so a reader can find the big version.
 */
export function repairPhotos(repair) {
  const numbers = rowNumbers(repair);
  const out = [];
  const seen = new Set();
  for (const r of usedRows(repair)) {
    for (const id of r.photos) {
      if (seen.has(id)) continue;
      seen.add(id);
      const where = String(r.location || '').split('\n')[0].trim();
      out.push({ id, n: out.length + 1, row: numbers.get(r.id), caption: `Repair ${numbers.get(r.id)}${where ? ` - ${where}` : ''}` });
    }
  }
  return out;
}

/** Photo ids of one row mapped to their report numbers: [{ id, n }]. */
export function rowPhotoNumbers(repair, row) {
  const byId = new Map(repairPhotos(repair).map((p) => [p.id, p.n]));
  return row.photos.filter((id) => byId.has(id)).map((id) => ({ id, n: byId.get(id) }));
}

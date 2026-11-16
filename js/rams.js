// RAMS pack: small shared helpers (no DOM).

const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const has = (v) => String(v ?? '').trim() !== '';

/** Is the job big enough to have to be told to the HSE? (over 30 working days with more than 20 people on site at once, or over 500 person-days) */
export const notifiable = (cpp) => (num(cpp.days) > 30 && num(cpp.workers) > 20) || num(cpp.personDays) > 500;

export const isBlankRisk = (r) => ![r.hazard, r.who, r.controls, r.action].some(has);
export const usedRisks = (rows) => rows.filter((r) => !isBlankRisk(r));

/** Photos taken on method statement steps, in document order, numbered from 1: [{ id, n, caption }]. */
export function ramsPhotos(rams) {
  const out = [];
  const seen = new Set();
  for (const m of rams.methods) {
    let step = 0;
    for (const s of m.steps) {
      if (!has(s.text) && !s.photos.length) continue;
      step++;
      for (const id of s.photos) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, n: out.length + 1, caption: `${m.title || 'Method statement'} - step ${step}` });
      }
    }
  }
  return out;
}

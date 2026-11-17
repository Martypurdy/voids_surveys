// Property-first structure (pure helpers). A property is the permanent file for an address; every
// inspection, repair, plan or costing done there is an entry in it. The property record holds a small
// summary of each entry, so the front screen and the timeline never have to load whole jobs.
import { docTotals, fmtMoney, docStatus, STATUS_LABEL } from './docs/money.js';
import { formOf, sectionsOf, completedCount, textLines, squash, isPlan, isPrice, isRepair, isRams, isCalc, isDoc, fmtDate, uid, nowISO } from './model.js';
import { planArea, sqm } from './plan.js';
import { sheetTotals, gbp, isBlankLine } from './pricing.js';

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const firstLine = (a) => textLines(a || {})[0] || '';
/** Has anything been entered for the address yet? (Quick jobs start without one.) */
export const hasAddress = (a) => Boolean(firstLine(a) || (a?.postcode || '').trim());

/** Two entries belong together when postcode and first address line (number + street) both match. */
export function propKey(a) {
  const pc = squash(a?.postcode);
  const line = norm(firstLine(a));
  if (!pc || !line) return null;
  if (line.split(' ').join('').toUpperCase() === pc) return null; // the first line is only the postcode
  return `${pc}|${line}`;
}

export const sameAddress = (a, b) => (a?.postcode || '') === (b?.postcode || '') && (a?.text || '') === (b?.text || '') && (a?.lat ?? null) === (b?.lat ?? null) && (a?.lng ?? null) === (b?.lng ?? null);

/** "12 Demo Street, AB1 2CD" – first line of the address with the postcode. */
export function addressTitle(a) {
  const first = firstLine(a);
  const pc = (a?.postcode || '').trim();
  return [first, pc && !squash(first).includes(squash(pc)) ? pc : ''].filter(Boolean).join(', ') || 'No address yet';
}

/** What the file is about: the user's own label, else the form's name. */
export const natureOf = (job) => (job.nature || '').trim() || formOf(job).title;
/** The form an entry summary belongs to (for its emoji and title). */
export const entryForm = (e) => {
  const f = formOf({ form: e.form, plan: { kind: e.kind }, calc: { kind: e.kind } });
  return { ...f, emoji: f.emoji || { rtl: '🔑', price: '🧮', repair: '🛠️', rams: '🦺', quote: '📝', invoice: '🧾' }[e.form] || '🏠' }; // only plan forms carry an emoji of their own
};

/** File name for an entry: "first line of address, postcode – nature of file". */
export const entryName = (job) => `${addressTitle(job.address)} – ${natureOf(job)}`;
export const fileBase = (job) => `${addressTitle(job.address)} - ${natureOf(job)}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

/** The one-line detail shown on an entry card. */
export function entryMeta(job) {
  if (isPlan(job)) {
    const rooms = job.plan.floors.reduce((n, f) => n + f.rooms.length, 0);
    return `📐 ${rooms} room${rooms === 1 ? '' : 's'} · ${sqm(planArea(job.plan))}`;
  }
  if (isPrice(job)) {
    const p = job.pricing;
    const n = [...p.materials, ...p.labour].filter((l) => !isBlankLine(l)).length;
    return `📄 ${n} line${n === 1 ? '' : 's'} · 💷 ${gbp(sheetTotals(p).gross)}${p.vat === 'none' ? '' : ' inc VAT'}`;
  }
  if (isDoc(job)) {
    const d = job.doc;
    const t = docTotals(d);
    return `${d.kind === 'invoice' ? '🧾' : '📝'} ${d.number || 'No number'} · ${fmtMoney(t.total)} · ${STATUS_LABEL[docStatus(d)]}`;
  }
  if (isCalc(job)) {
    const n = job.calc.materials.filter((m) => (m.item || '').trim()).length;
    return `🔢 ${n} material line${n === 1 ? '' : 's'}`;
  }
  if (isRams(job)) {
    const r = job.rams;
    const n = (list, one) => `${list.length} ${one}${list.length === 1 ? '' : 's'}`;
    return `🦺 ${n(r.risks, 'risk assessment')} · ${n(r.methods, 'method statement')}`;
  }
  if (isRepair(job)) {
    const rows = job.repair.rows.filter((r) => r.location || r.condition || r.causation || r.fix || r.photos.length);
    const photos = rows.reduce((n, r) => n + r.photos.length, 0);
    return `🛠️ ${rows.length} repair${rows.length === 1 ? '' : 's'}${photos ? ` · 📷 ${photos}` : ''}`;
  }
  const photos = job.property?.photos?.length ?? 0;
  return `🚪 ${job.rooms.length} room${job.rooms.length === 1 ? '' : 's'}${photos ? ` · 📷 ${photos}` : ''}`;
}

export function entrySummary(job) {
  return {
    id: job.id,
    form: job.form || 'void',
    kind: isPlan(job) ? job.plan?.kind || 'property' : isCalc(job) ? job.calc?.kind || '' : '',
    nature: (job.nature || '').trim(),
    created: job.created,
    updated: job.updated,
    done: completedCount(job),
    total: sectionsOf(job).length,
    started: Object.keys(job.progress || {}).length > 0,
    lastExported: job.lastExported || null,
    meta: entryMeta(job),
    ref: isPrice(job) ? [job.pricing?.ref, job.pricing?.customer].filter((s) => s && s.trim()).join(' ') : isRepair(job) ? [job.repair?.ref, job.repair?.customer].filter((s) => s && s.trim()).join(' ') : isRams(job) ? [job.rams?.ref, job.rams?.customer].filter((s) => s && s.trim()).join(' ') : isCalc(job) ? [job.calc?.ref, job.calc?.customer].filter((s) => s && s.trim()).join(' ') : isDoc(job) ? [job.doc?.number, job.doc?.ref, job.doc?.customer].filter((s) => s && s.trim()).join(' ') : '',
  };
}

export function newProperty(address) {
  const t = nowISO();
  return {
    id: uid(),
    address: { postcode: '', text: '', lat: null, lng: null, ...structuredClone(address || {}) },
    ref: '',
    created: t,
    updated: t,
    last: t, // latest activity (newest entry update)
    entries: [],
    search: '',
    sq: '',
  };
}

/** Lower-case text the front-screen search looks through (and a squashed copy for postcodes). */
export function indexProperty(p) {
  const parts = [p.address?.text, p.address?.postcode, p.ref, ...p.entries.flatMap((e) => [e.ref, e.nature, entryForm(e).title])];
  p.search = parts.filter(Boolean).join(' ').toLowerCase();
  p.sq = p.search.replace(/[^a-z0-9]/g, '');
  return p;
}

export function refreshActivity(p) {
  p.last = p.entries.reduce((m, e) => ((e.updated || '') > m ? e.updated : m), p.created || '');
  p.updated = nowISO();
  return p;
}

/** Search: every word must appear (any order); a postcode also matches without its space. */
export function matches(p, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (q.split(/\s+/).every((t) => p.search.includes(t))) return true;
  const sq = q.replace(/[^a-z0-9]/g, '');
  return sq.length > 1 && p.sq.includes(sq);
}

export { fmtDate };

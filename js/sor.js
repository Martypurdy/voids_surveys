// SOR library: loaded by the user from a private file, stored on this device only
// (IndexedDB). The website itself contains no SOR data.
//
// File format (built by private/build-sor-library.js):
//   { format: 'voids-sor-library', version: 1, name, created,
//     items: [{ c: code, d: label, s: NHF short desc, u: unit, e: element, sec: section, l: long desc }],
//     parts: { ceiling: [code | { d: label, band: [[maxCeilingM2|null, code], ...] }], ... } }
import { createStore, get, set, del } from '../vendor/idb-keyval.js';

const store = createStore('voids-sor', 'sor');
let cache; // undefined = not read yet, null = none loaded

export async function getLibrary() {
  if (cache === undefined) {
    try { cache = (await get('library', store)) || null; } catch { cache = null; }
  }
  return cache;
}

export function validateLibrary(data) {
  if (!data || data.format !== 'voids-sor-library' || !Array.isArray(data.items) || typeof data.parts !== 'object') {
    throw new Error('That isn’t an SOR library file');
  }
  if (data.version > 1) throw new Error('This SOR library needs a newer version of the app');
  return data;
}

export async function saveLibrary(data) {
  validateLibrary(data);
  data.loaded = new Date().toISOString();
  await set('library', data, store);
  cache = data;
  return data;
}

export async function removeLibrary() {
  await del('library', store);
  cache = null;
}

function index(lib) {
  if (!lib._map) {
    lib._map = new Map(lib.items.map((i) => [i.c, i]));
    lib._text = lib.items.map((i) => `${i.c} ${i.d} ${i.s} ${i.sec} ${i.l}`.toLowerCase());
  }
  return lib;
}

export const libraryItem = (lib, code) => index(lib)._map.get(code);

/**
 * All words must match (code, label, NHF short/long description, section).
 * partKey ranks SORs from that part's trades (e.g. plaster & decoration for walls) first.
 */
export function searchLibrary(lib, query, limit = 40, partKey = null) {
  index(lib);
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const preferred = new Set(partKey ? lib.sections?.[partKey] || [] : []);
  const out = [];
  for (let i = 0; i < lib.items.length; i++) {
    const t = lib._text[i];
    if (!words.every((w) => t.includes(w))) continue;
    const it = lib.items[i];
    const inLabel = words.every((w) => it.d.toLowerCase().includes(w));
    const inPart = preferred.has(it.sec);
    // Rank: exact code, code prefix, then this part's trades, then label matches.
    const score = it.c === q ? 0 : it.c.startsWith(q) ? 1
      : inPart && inLabel ? 2 : inPart ? 3 : inLabel ? 4 : 5;
    out.push([score, it]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1].c.localeCompare(b[1].c));
  return out.slice(0, limit).map(([, it]) => it);
}

const bandText = (bands, i) => {
  const max = bands[i][0];
  const prev = i > 0 ? bands[i - 1][0] : null;
  if (max == null) return `over ${prev} m²`;
  return prev == null ? `up to ${max} m²` : `${prev}–${max} m²`;
};

/**
 * Preloaded SORs for a part, with size bands resolved from the room's ceiling area.
 * Returns [{ c, d, u, note }].
 */
export function preloadFor(lib, partKey, ceilingArea) {
  index(lib);
  return (lib.parts[partKey] || []).map((entry) => {
    if (typeof entry === 'string') {
      const it = lib._map.get(entry);
      return it && { c: it.c, d: it.d, u: it.u };
    }
    const bands = entry.band;
    let i = bands.findIndex(([max]) => max == null || (ceilingArea || 0) <= max);
    if (i < 0) i = bands.length - 1;
    const it = lib._map.get(bands[i][1]);
    return it && {
      c: it.c,
      d: `${entry.d} (${bandText(bands, i)})`,
      u: it.u,
      note: ceilingArea ? `Band picked from ceiling area ${ceilingArea} m²` : 'Room size not entered – smallest band assumed',
    };
  }).filter(Boolean);
}

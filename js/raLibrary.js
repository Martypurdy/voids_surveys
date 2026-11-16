// Risk assessment library, on this device only. Two kinds of starting point:
//   - the built-in hazard list (js/data/hazards.js), one row per hazard, and
//   - sets the user saves from their own assessments (a title and its hazard rows).
import { HAZARDS, hazardByTitle } from './data/hazards.js';
import { uid } from './model.js';

const KEY = 'voids.raLibrary';

const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } };

/** The sets saved so far: [{ id, title, rows: [{ hazard, who, controls, action }] }]. */
export const savedSets = () => read();

export function saveSet(title, rows) {
  const clean = rows
    .filter((r) => [r.hazard, r.who, r.controls].some((t) => String(t || '').trim()))
    .map((r) => ({ hazard: r.hazard || '', who: r.who || '', controls: r.controls || '', action: r.action || '' }));
  if (!clean.length) return null;
  const all = read();
  const name = String(title || '').trim() || 'Saved assessment';
  const existing = all.find((s) => s.title.toLowerCase() === name.toLowerCase());
  const set = existing || { id: uid(), title: name, rows: [] };
  set.rows = clean;
  if (!existing) all.push(set);
  return write(all) ? set : null;
}

export function removeSet(id) {
  write(read().filter((s) => s.id !== id));
}

/** Rows (hazard, who, controls) for the hazard titles chosen from the built-in list. */
export const rowsFromHazards = (titles) => titles.map(hazardByTitle).filter(Boolean).map((h) => ({ hazard: h.hazard, who: h.who, controls: h.controls, action: '' }));

/** Rows for the saved sets chosen by title. */
export const rowsFromSets = (titles) => savedSets().filter((s) => titles.includes(s.title)).flatMap((s) => s.rows);

export const hazardTitles = () => HAZARDS.map((h) => h.hazard);

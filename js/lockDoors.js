// Security tab: the doors chosen under "Renew locks" decide which doors are in the Doors & windows defect list.
// Pure functions, no DOM.
import { FEATURES, SUGGESTIONS, featuresOf } from './data/features.js';

/** Renew-locks option -> the Doors & windows feature it belongs to. Other options (shed, gate, post box…) have no door feature. */
export const LOCK_DOOR = {
  'Front door': 'frontdoor',
  'Back door': 'reardoor',
  'Patio door': 'sidedoor',
  'French doors': 'sidedoor',
  Garage: 'garagedoor',
  'Communal key': 'communaldoor',
  'Communal fob': 'communaldoor',
};
const DOOR_KEYS = new Set(Object.values(LOCK_DOOR));

const untouched = (room, key) => {
  const p = room.parts?.[key];
  return !p || (!p.state && !p.defects?.length && !p.photos?.length && !String(p.notes || '').trim());
};

/**
 * Make the Security doors match the chosen locks: a door for every chosen lock is added; a door that is no longer
 * chosen is taken out only if nothing has been recorded on it (so no defects or photos are ever lost).
 * Returns the labels { added, removed }. The caller saves and redraws.
 */
export function syncDoorsToLocks(room, cylinders = []) {
  const wanted = new Set(cylinders.map((c) => LOCK_DOOR[c]).filter(Boolean));
  const current = featuresOf(room, 'security').map((f) => f.key);
  const keep = current.filter((k) => !DOOR_KEYS.has(k) || wanted.has(k) || !untouched(room, k));
  const added = [...wanted].filter((k) => !keep.includes(k));
  const next = [...keep, ...added];
  // standard order (front, rear, side, garage, communal, windows); your own features stay where they are, after the standard ones
  const rank = (k) => { const i = SUGGESTIONS.security.indexOf(k); return i < 0 ? 99 : i; };
  next.sort((a, b) => rank(a) - rank(b));
  room.features = next;
  room.featureLabels ??= {};
  return {
    added: added.map((k) => FEATURES[k].label),
    removed: current.filter((k) => !next.includes(k)).map((k) => FEATURES[k]?.label || k),
  };
}

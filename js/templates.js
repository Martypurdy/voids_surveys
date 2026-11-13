// Per-device templates: SORs the surveyor has removed from a part's preloaded
// list for a type of room (e.g. Kitchen › Ceiling). Saved in this browser so the
// lists stay trimmed for every future survey on this device.
const KEY = 'voids.sorTemplate';

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked/full */ }
}

/** "Bedroom 2" -> "bedroom": numbered rooms share one template. */
export function roomType(name) {
  return String(name || 'room').trim().replace(/\s+\d+$/, '').toLowerCase() || 'room';
}

/** Display name for a template, e.g. "Bedroom". */
export function roomTypeLabel(name) {
  const t = String(name || 'Room').trim().replace(/\s+\d+$/, '');
  return t || 'Room';
}

const slot = (roomName, partKey) => `${roomType(roomName)}|${partKey}`;

/** Set of option keys hidden for this room type + part. */
export function hiddenFor(roomName, partKey) {
  return new Set(readAll()[slot(roomName, partKey)] || []);
}

export function setHidden(roomName, partKey, key, hidden) {
  const all = readAll();
  const s = new Set(all[slot(roomName, partKey)] || []);
  if (hidden) s.add(key); else s.delete(key);
  if (s.size) all[slot(roomName, partKey)] = [...s];
  else delete all[slot(roomName, partKey)];
  writeAll(all);
}

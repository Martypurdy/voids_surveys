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

// ----- SORs the surveyor has pinned (📌) into a room type's list -----
const ADD_KEY = 'voids.sorTemplateAdd';

function readAdds() {
  try {
    const v = JSON.parse(localStorage.getItem(ADD_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Pinned items for this room type + part: [{ c, d, u }]. */
export function addedFor(roomName, partKey) {
  const list = readAdds()[slot(roomName, partKey)];
  return Array.isArray(list) ? list : [];
}

function writeAdds(all) {
  try { localStorage.setItem(ADD_KEY, JSON.stringify(all)); } catch { /* storage blocked/full */ }
}

/** Pin (on=true) or unpin an item. Your own defects are { c: 'my-…', d, u, custom: true }. */
export function setAdded(roomName, partKey, item, on) {
  const all = readAdds();
  const k = slot(roomName, partKey);
  const list = (all[k] || []).filter((x) => x.c !== item.c);
  if (on) list.push({ c: item.c, d: item.d, u: item.u, ...(item.custom ? { custom: true } : {}) });
  if (list.length) all[k] = list;
  else delete all[k];
  writeAdds(all);
}

/** Change the wording or unit of one of your own defects. */
export function updateAdded(roomName, partKey, code, patch) {
  const all = readAdds();
  const list = all[slot(roomName, partKey)] || [];
  const it = list.find((x) => x.c === code);
  if (!it) return;
  Object.assign(it, patch);
  writeAdds(all);
}

/** Room types that have a saved template on this device (lower-case keys). */
export function templateRoomTypes() {
  const keys = [...Object.keys(readAll()), ...Object.keys(readAdds()), ...Object.keys(readWording()), ...Object.keys(readOrders())];
  return [...new Set(keys.map((k) => k.split('|')[0]))];
}

export function setHidden(roomName, partKey, key, hidden) {
  const all = readAll();
  const s = new Set(all[slot(roomName, partKey)] || []);
  if (hidden) s.add(key); else s.delete(key);
  if (s.size) all[slot(roomName, partKey)] = [...s];
  else delete all[slot(roomName, partKey)];
  writeAll(all);
}

// ----- Wording the surveyor has changed (press and hold a defect) -----
// Saved per room type + feature on this device and used on every survey after.
const WORD_KEY = 'voids.sorWording';

function readWording() {
  try {
    const v = JSON.parse(localStorage.getItem(WORD_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** { [code]: wording } for this room type + feature. */
export function wordingFor(roomName, partKey) {
  return readWording()[slot(roomName, partKey)] || {};
}

/** Save new wording for a standard defect (text = null resets it). */
export function setWording(roomName, partKey, code, text) {
  const all = readWording();
  const k = slot(roomName, partKey);
  const m = all[k] || {};
  if (text) m[code] = text; else delete m[code];
  if (Object.keys(m).length) all[k] = m; else delete all[k];
  try { localStorage.setItem(WORD_KEY, JSON.stringify(all)); } catch { /* storage blocked/full */ }
}

// ----- Custom order (drag and drop) -----
// Saved per room type + feature on this device: the list's codes, most used first.
const ORDER_KEY = 'voids.sorOrder';

function readOrders() {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Codes in the order the surveyor chose (may be empty). */
export function orderFor(roomName, partKey) {
  const list = readOrders()[slot(roomName, partKey)];
  return Array.isArray(list) ? list : [];
}

export function setOrder(roomName, partKey, codes) {
  const all = readOrders();
  if (codes.length) all[slot(roomName, partKey)] = codes;
  else delete all[slot(roomName, partKey)];
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(all)); } catch { /* storage blocked/full */ }
}

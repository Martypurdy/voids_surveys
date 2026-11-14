// The defect list for one feature (Ceiling, Walls, …) in one type of room:
//   built-in list (SOR preload if a library is loaded, else the draft list plus
//   any room-type defaults)  −  items removed on this device  +  items pinned or
//   written by the user on this device.
// Shared by the room screen's defects sheet and Settings › Defect lists.
import { ROOM_DEFAULTS } from './data/parts.js';
import { preloadFor } from './sor.js';
import { hiddenFor, addedFor, wordingFor, roomType } from './templates.js';

/** Built-in options before the user's own template is applied. */
export function baseOptions({ library, roomName, part, ceilingArea = 0 }) {
  // SOR preloads exist for the six room features; everything else (Electrics, Roof,
  // Fence…) keeps its built-in list – SOR search still works on them.
  if (library?.parts?.[part.key]) return preloadFor(library, part.key, ceilingArea);
  const extra = ROOM_DEFAULTS[roomType(roomName)]?.[part.key] || {};
  const skip = new Set(extra.skip || []);
  return [...(extra.add || []), ...part.defects.filter((d) => !skip.has(d.id))]
    .map((d) => ({ k: d.id, c: d.id, d: d.label, u: d.unit }));
}

/** { base, visible, removed, hidden } for this room type + feature on this device. */
export function templateOptions(args) {
  // Wording changed by the surveyor (press and hold) replaces the standard wording.
  const words = wordingFor(args.roomName, args.part.key);
  const base = baseOptions(args).map((o) => (words[o.c] ? { ...o, std: o.d, d: words[o.c] } : o));
  const hidden = hiddenFor(args.roomName, args.part.key);
  const baseCodes = new Set(base.map((o) => o.c));
  const added = addedFor(args.roomName, args.part.key)
    .filter((x) => !baseCodes.has(x.c))
    .map((x) => ({ k: `pin:${x.c}`, c: x.c, d: x.d, u: x.u, pinned: true, custom: Boolean(x.custom) }));
  return {
    base,
    hidden,
    visible: [...base.filter((o) => !hidden.has(o.k)), ...added],
    removed: base.filter((o) => hidden.has(o.k)),
  };
}

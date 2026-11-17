// Feature catalogue: every feature a room, outside area or the Security screen can
// have, its built-in (draft) defect list, and the features each type starts with.
// Defect: { id, label, unit } – unit 'm2' | 'm' | 'nr'. Draft ids are not SOR codes.
// No prices or SOR content here: this file is published on the public website.
import { PARTS } from './parts.js';
import { roomType } from '../templates.js';

const d = (id, label, unit = 'nr') => ({ id, label, unit });

const EXT_DOOR = (p) => [
  d(`${p}-01`, 'Door damaged / holed'),
  d(`${p}-02`, 'Won’t lock / latch'),
  d(`${p}-03`, 'Lock / cylinder faulty'),
  d(`${p}-04`, 'Ease and adjust'),
  d(`${p}-05`, 'Frame damaged / rotten'),
  d(`${p}-06`, 'Glazing broken / cracked'),
  d(`${p}-07`, 'Draught strips / seals failed', 'm'),
  d(`${p}-08`, 'Threshold / weather bar damaged'),
  d(`${p}-09`, 'Letterbox damaged / missing'),
  d(`${p}-10`, 'Door closer faulty'),
  d(`${p}-11`, 'Door viewer missing / damaged'),
  d(`${p}-14`, 'Door chain missing / damaged'), // -13 is taken by the communal door's entry system
  d(`${p}-12`, 'Boarded – remove boarding'),
];

const MORE = [
  // ----- Inside -----
  { key: 'electrics', label: 'Electrics', defects: [
    d('ELE-01', 'Socket damaged / missing'), d('ELE-02', 'Switch damaged / missing'),
    d('ELE-03', 'Light fitting damaged / missing'), d('ELE-04', 'Exposed / loose wiring'),
    d('ELE-05', 'Smoke alarm missing / faulty'), d('ELE-06', 'Heat alarm missing / faulty'),
    d('ELE-07', 'Extractor fan faulty / missing'), d('ELE-08', 'Electrical test required'),
  ] },
  { key: 'heating', label: 'Heating', defects: [
    d('HEA-01', 'Radiator damaged / leaking'), d('HEA-02', 'Radiator not heating'),
    d('HEA-03', 'TRV / valve missing or faulty'), d('HEA-04', 'Radiator loose on wall'),
    d('HEA-05', 'Pipework leaking'), d('HEA-06', 'Pipe boxing damaged', 'm'),
    d('HEA-07', 'Storage / panel heater faulty'),
  ] },
  { key: 'kitchen', label: 'Kitchen fittings', defects: [
    d('KIT-01', 'Base unit damaged'), d('KIT-02', 'Wall unit damaged'),
    d('KIT-03', 'Unit door / drawer front damaged or missing'), d('KIT-04', 'Hinges / handles faulty'),
    d('KIT-05', 'Worktop damaged', 'm'), d('KIT-06', 'Worktop sealant failed', 'm'),
    d('KIT-07', 'Sink / drainer damaged'), d('KIT-08', 'Taps faulty / dripping'),
    d('KIT-09', 'Waste / trap leaking or blocked'), d('KIT-10', 'Splashback tiles damaged', 'm2'),
    d('KIT-11', 'Cooker space / point issue'), d('KIT-12', 'Deep clean kitchen'),
  ] },
  { key: 'sanitary', label: 'Sanitaryware', defects: [
    d('SAN-01', 'Bath damaged / stained'), d('SAN-02', 'Bath panel damaged / missing'),
    d('SAN-03', 'Basin cracked / loose'), d('SAN-04', 'WC pan cracked / loose'),
    d('SAN-05', 'Cistern faulty / leaking'), d('SAN-06', 'WC seat missing / damaged'),
    d('SAN-07', 'Taps faulty / dripping'), d('SAN-08', 'Shower not working'),
    d('SAN-09', 'Shower screen / curtain rail damaged'), d('SAN-10', 'Sealant failed', 'm'),
    d('SAN-11', 'Waste blocked / leaking'), d('SAN-12', 'Wall tiles damaged', 'm2'),
    d('SAN-13', 'Deep clean bathroom'),
  ] },
  { key: 'stairs', label: 'Stairs & balustrade', defects: [
    d('STA-01', 'Tread loose / damaged'), d('STA-02', 'Nosing damaged'),
    d('STA-03', 'Spindles loose / missing'), d('STA-04', 'Handrail loose / missing', 'm'),
    d('STA-05', 'Newel post loose'), d('STA-06', 'Stair covering to remove', 'm2'),
    d('STA-07', 'Stair gate / fixings to remove'),
  ] },
  { key: 'loft', label: 'Loft', defects: [
    d('LOF-01', 'Loft hatch damaged / missing'), d('LOF-02', 'Loft ladder faulty'),
    d('LOF-03', 'Insulation missing / low', 'm2'), d('LOF-04', 'Items left in loft – clear'),
    d('LOF-05', 'Boarding damaged', 'm2'), d('LOF-06', 'Signs of roof leak'),
  ] },
  { key: 'cupboards', label: 'Cupboards & storage', defects: [
    d('CUP-01', 'Cupboard door damaged'), d('CUP-02', 'Shelving damaged / missing', 'm'),
    d('CUP-03', 'Items left – clear'),
  ] },

  // ----- Security -----
  { key: 'frontdoor', label: 'Front door', defects: EXT_DOOR('FDR') },
  { key: 'reardoor', label: 'Rear door', defects: EXT_DOOR('RDR') },
  { key: 'sidedoor', label: 'Patio / side door', defects: EXT_DOOR('SDR') },
  { key: 'garagedoor', label: 'Garage door', defects: EXT_DOOR('GDR') },
  { key: 'communaldoor', label: 'Communal entrance door', defects: [
    ...EXT_DOOR('CDR'), d('CDR-13', 'Door entry / fob system faulty'),
  ] },
  { key: 'winsec', label: 'Windows – security', defects: [
    d('WSE-01', 'Restrictor missing / broken'), d('WSE-02', 'Ground-floor window won’t lock'),
    d('WSE-03', 'Glass broken'), d('WSE-04', 'Window won’t close / secure'),
    d('WSE-05', 'Boarded – remove boarding'), d('WSE-06', 'Keys missing for window locks'),
  ] },

  // ----- Building exterior -----
  { key: 'roof', label: 'Roof', defects: [
    d('ROO-01', 'Slipped / missing tiles or slates'), d('ROO-02', 'Ridge tiles loose', 'm'),
    d('ROO-03', 'Flashing defective', 'm'), d('ROO-04', 'Verge / bargeboard defective', 'm'),
    d('ROO-05', 'Moss / vegetation', 'm2'), d('ROO-06', 'Flat roof covering failed', 'm2'),
    d('ROO-07', 'Signs of leak'),
  ] },
  { key: 'chimney', label: 'Chimney', defects: [
    d('CHI-01', 'Pointing defective', 'm2'), d('CHI-02', 'Pot / cowl damaged'),
    d('CHI-03', 'Flaunching cracked'), d('CHI-04', 'Flashing defective', 'm'),
    d('CHI-05', 'Leaning / unstable – inspect'),
  ] },
  { key: 'gutters', label: 'Gutters', defects: [
    d('GUT-01', 'Blocked – clear out', 'm'), d('GUT-02', 'Leaking joints'),
    d('GUT-03', 'Sagging / misaligned', 'm'), d('GUT-04', 'Section missing / broken', 'm'),
    d('GUT-05', 'Bracket missing'),
  ] },
  { key: 'downpipes', label: 'Downpipes', defects: [
    d('DPI-01', 'Cracked / broken', 'm'), d('DPI-02', 'Disconnected / section missing', 'm'),
    d('DPI-03', 'Bracket missing'), d('DPI-04', 'Shoe / gully blocked'),
  ] },
  { key: 'fascias', label: 'Fascias & soffits', defects: [
    d('FAS-01', 'Fascia rotten / damaged', 'm'), d('FAS-02', 'Soffit damaged', 'm'),
    d('FAS-03', 'Needs painting', 'm'),
  ] },
  { key: 'extwalls', label: 'Walls & pointing', defects: [
    d('EXW-01', 'Cracking', 'm'), d('EXW-02', 'Render blown / cracked', 'm2'),
    d('EXW-03', 'Repointing needed', 'm2'), d('EXW-04', 'Damp / staining', 'm2'),
    d('EXW-05', 'Graffiti', 'm2'), d('EXW-06', 'Airbrick missing / blocked'),
  ] },
  { key: 'drainage', label: 'Drainage', defects: [
    d('DRA-01', 'Gully blocked / damaged'), d('DRA-02', 'Manhole cover broken'),
    d('DRA-03', 'Drain blocked – clear'), d('DRA-04', 'Smells / leak – investigate'),
  ] },

  // ----- Gardens, boundaries, outbuildings -----
  { key: 'paths', label: 'Paths', defects: [
    d('PAT-01', 'Slabs cracked / uneven', 'm2'), d('PAT-02', 'Trip hazard'),
    d('PAT-03', 'Overgrown / weeds', 'm2'),
  ] },
  { key: 'patio', label: 'Patio', defects: [
    d('PTO-01', 'Slabs cracked / loose', 'm2'), d('PTO-02', 'Uneven / trip hazard'),
    d('PTO-03', 'Weeds / moss', 'm2'), d('PTO-04', 'Clean down', 'm2'),
  ] },
  { key: 'lawn', label: 'Lawn', defects: [
    d('LAW-01', 'Overgrown – cut', 'm2'), d('LAW-02', 'Rubbish to clear'),
    d('LAW-03', 'Re-turf / reseed', 'm2'),
  ] },
  { key: 'bushes', label: 'Bushes & hedges', defects: [
    d('BUS-01', 'Overgrown – cut back', 'm'), d('BUS-02', 'Remove bush / hedge'),
  ] },
  { key: 'trees', label: 'Trees', defects: [
    d('TRE-01', 'Overhanging – prune'), d('TRE-02', 'Dead / dangerous – inspect'),
    d('TRE-03', 'Remove tree'),
  ] },
  { key: 'fence', label: 'Fence', defects: [
    d('FEN-01', 'Panels damaged / missing'), d('FEN-02', 'Posts broken / leaning'),
    d('FEN-03', 'Fence down', 'm'), d('FEN-04', 'Gravel boards damaged'),
    d('FEN-05', 'Treat / paint', 'm'),
  ] },
  { key: 'gate', label: 'Gate', defects: [
    d('GAT-01', 'Gate damaged'), d('GAT-02', 'Hinges / latch faulty'),
    d('GAT-03', 'Gate missing'), d('GAT-04', 'Gate post broken'),
    d('GAT-05', 'Ease and adjust'),
  ] },
  { key: 'gardenwall', label: 'Garden wall', defects: [
    d('GWA-01', 'Cracked / leaning', 'm'), d('GWA-02', 'Coping stones loose / missing', 'm'),
    d('GWA-03', 'Repointing needed', 'm2'),
  ] },
  { key: 'steps', label: 'Steps', defects: [
    d('STE-01', 'Step damaged / loose'), d('STE-02', 'Handrail missing / loose', 'm'),
  ] },
  { key: 'driveway', label: 'Driveway', defects: [
    d('DRI-01', 'Surface broken / potholes', 'm2'), d('DRI-02', 'Weeds', 'm2'),
  ] },
  { key: 'binstore', label: 'Bin store', defects: [
    d('BIN-01', 'Bin store damaged'), d('BIN-02', 'Bins missing'),
  ] },
  { key: 'washingline', label: 'Washing line', defects: [
    d('WAS-01', 'Rotary line damaged / missing'), d('WAS-02', 'Posts damaged'),
  ] },
  { key: 'structure', label: 'Structure', defects: [
    d('STR-01', 'Panels / walls rotten or damaged', 'm2'), d('STR-02', 'Base damaged'),
    d('STR-03', 'Unsafe – demolish and remove'),
  ] },
  { key: 'obroof', label: 'Outbuilding roof', defects: [
    d('OBR-01', 'Felt / covering failed', 'm2'), d('OBR-02', 'Leaking'),
    d('OBR-03', 'Possible asbestos sheeting – test'),
  ] },
  { key: 'obdoor', label: 'Outbuilding door', defects: [
    d('OBD-01', 'Door damaged'), d('OBD-02', 'Hasp / lock missing'), d('OBD-03', 'Hinges faulty'),
  ] },
  { key: 'clearance', label: 'Clear contents / rubbish', defects: [
    d('CLR-01', 'Clear contents'), d('CLR-02', 'Rubbish / fly-tipping to remove'),
    d('CLR-03', 'Needles / hazardous items – specialist clear'),
  ] },
];

export const FEATURES = Object.fromEntries([...PARTS, ...MORE].map((f) => [f.key, { fill: null, ...f }]));

// ----- Types: presets and starting features -----
export const AREA_PRESETS = {
  rooms: ['Hall, stairs, landing & loft', 'Living room', 'Kitchen', 'Bathroom', 'Ensuite', 'Downstairs bathroom', 'WC', 'Bedroom', 'Porch'],
  externals: ['Building exterior', 'Front garden', 'Rear garden', 'Fencing & gates', 'Shed', 'Garage'],
};

const ROOM_BASE = ['ceiling', 'walls', 'floor', 'woodwork', 'door', 'window', 'electrics', 'heating'];

/** Features a new room / area / the Security screen starts with. */
export function defaultFeatures(name, kind) {
  const t = roomType(name);
  if (kind === 'security') return ['frontdoor', 'winsec'];
  if (kind === 'externals') {
    if (/exterior|building|outside of/.test(t)) return ['roof', 'chimney', 'gutters', 'downpipes', 'fascias', 'extwalls', 'drainage'];
    if (/garden|yard/.test(t)) return ['paths', 'lawn', 'bushes', 'trees'];
    if (/fenc|gate|boundar/.test(t)) return ['fence', 'gate'];
    if (/garage/.test(t)) return ['structure', 'obroof', 'garagedoor', 'clearance'];
    if (/shed|outbuilding|store/.test(t)) return ['structure', 'obroof', 'obdoor', 'clearance'];
    return [];
  }
  if (/kitchen/.test(t)) return [...ROOM_BASE, 'kitchen'];
  if (/bath|en-?\s?suite|wc|toilet|shower|cloak/.test(t)) return [...ROOM_BASE, 'sanitary'];
  if (/hall|stair|landing|loft/.test(t)) return [...ROOM_BASE, 'stairs', 'loft'];
  if (/porch/.test(t)) return ['ceiling', 'walls', 'floor', 'door', 'window', 'electrics'];
  return ROOM_BASE;
}

/** Suggestions offered by "+ Add feature". */
export const SUGGESTIONS = {
  rooms: ['electrics', 'heating', 'kitchen', 'sanitary', 'stairs', 'loft', 'cupboards', 'ceiling', 'walls', 'floor', 'woodwork', 'door', 'window'],
  externals: ['patio', 'paths', 'lawn', 'bushes', 'trees', 'fence', 'gate', 'gardenwall', 'steps', 'driveway', 'binstore', 'washingline', 'clearance',
    'roof', 'chimney', 'gutters', 'downpipes', 'fascias', 'extwalls', 'drainage', 'structure', 'obroof', 'obdoor', 'garagedoor'],
  security: ['frontdoor', 'reardoor', 'sidedoor', 'garagedoor', 'communaldoor', 'winsec'],
};

/** Key for a feature the user names themselves, e.g. "Conservatory" -> "x-conservatory". */
export const customFeatureKey = (label) => `x-${String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** Full definition for a feature key (custom ones have no built-in defects). */
export function featureDef(key, labels = {}) {
  return FEATURES[key] || { key, label: labels[key] || key.replace(/^x-/, '').replace(/-/g, ' '), fill: null, defects: [], custom: true };
}

/** The features of a room / area: its own list, or its type's starting list. */
export function featuresOf(room, kind) {
  const keys = room.features || defaultFeatures(room.name, kind);
  return keys.map((k) => featureDef(k, room.featureLabels));
}

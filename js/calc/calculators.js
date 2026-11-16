// Calculators for the Calculators button. Pure functions: no DOM, no storage (except the optional "last used" memory).
// Every calculator is described the same way:
//   key, title, emoji, group, text      what it is
//   inputs       [{ k, label, unit, def, kind: 'num' | 'select' | 'frac', options, opt, hint, showIf: { otherInput: value } }]
//   assumptions  [{ k, label, unit, def, hint }]    typical figures, shown on screen and editable
//   waste        { mode: 'pct' | 'extra', value }    default wastage (false = no wastage option)
//   compute(v, a, w)  ->  { results: [{ label, value, unit }], lines: [{ item, qty, unit }], steps: [text] }
// v = the inputs as numbers (select inputs stay text), a = the assumptions as numbers, w(qty, main) = a quantity with
// wastage added: "pct" adds a percentage to everything; "extra" adds a fixed amount to the main quantity only.
// Quantities bought in whole packs are rounded up AFTER wastage is added. All figures are estimates.

export const num = (v) => {
  if (typeof v === 'number') return v;
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};

/** Inches typed as 0.75, 3/4, 1 1/2 or 1-1/2: returns a number, or NaN. */
export function parseInches(v) {
  const s = String(v ?? '').trim().replace(/["”″]|in(ch(es)?)?$/gi, '').trim().replace(',', '.');
  if (!s) return NaN;
  const m = /^(?:(\d+)[\s-]+)?(\d+)\/(\d+)$/.exec(s);
  if (m) return (m[1] ? Number(m[1]) : 0) + Number(m[2]) / Number(m[3]);
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}

const EPS = 1e-9;
export const ceilN = (x) => Math.ceil(x - EPS);
export const round = (x, d = 2) => { const p = 10 ** d; return Math.round((x + Number.EPSILON) * p) / p; };
export const up = (x, d = 2) => { const p = 10 ** d; return Math.ceil(x * p - EPS) / p; };
/** A number for display: up to d decimals, no trailing zeros. */
export const fmt = (x, d = 2) => (Number.isFinite(x) ? String(round(x, d)) : '–');

const MIXES = [['1:2:4', '1 : 2 : 4 (general use)'], ['1:1.5:3', '1 : 1.5 : 3 (stronger)'], ['1:3:6', '1 : 3 : 6 (blinding, fill)']];
const MORTAR = [['1:4', '1 : 4 (strong)'], ['1:5', '1 : 5 (general)'], ['1:6', '1 : 6 (soft)']];
const parts = (s) => String(s).split(':').map(Number);
const bagsOf = (kg, bagKg) => ceilN(kg / bagKg);

// ---------- unit converter data ----------
const UNIT_GROUPS = {
  Length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.344 },
  Area: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, ha: 10000, 'in²': 0.00064516, 'ft²': 0.09290304, 'yd²': 0.83612736, acre: 4046.8564224 },
  Volume: { ml: 1e-6, l: 1e-3, 'm³': 1, 'in³': 1.6387064e-5, 'ft³': 0.028316846592, 'yd³': 0.764554857984, 'pint (UK)': 5.68261e-4, 'gallon (UK)': 4.54609e-3, 'gallon (US)': 3.785411784e-3 },
  Weight: { g: 0.001, kg: 1, tonne: 1000, oz: 0.028349523125, lb: 0.45359237, stone: 6.35029318, 'ton (UK)': 1016.0469088 },
};
export const UNIT_OPTIONS = Object.entries(UNIT_GROUPS).flatMap(([g, u]) => Object.keys(u).map((k) => [`${g}|${k}`, `${g}: ${k}`]));
export const convertUnit = (value, fromKey, toKey) => {
  const [g, from] = fromKey.split('|');
  return (value * UNIT_GROUPS[g][from]) / UNIT_GROUPS[g][toKey];
};

// ---------- screw sizes ----------
const METRIC_DIAMETERS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 8, 10];
const METRIC_LENGTHS = [10, 12, 13, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150];
const nearest = (list, x) => list.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b), list[0]);
/** Imperial wood screw gauge to its thread diameter in inches: 0.060 + 0.013 x gauge. */
export const gaugeToInches = (g) => 0.06 + 0.013 * g;
export const inchesToGauge = (d) => (d - 0.06) / 0.013;

export const CALCS = [
  // ===================================================================== concrete
  {
    key: 'concrete', title: 'Concrete', emoji: '🧱', group: 'Concrete and masonry', text: 'Volume, then bags of pre-mix or cement, sand and aggregate.',
    waste: { mode: 'pct', value: '5' }, mainUnit: 'm³',
    inputs: [
      { k: 'length', label: 'Length', unit: 'm' }, { k: 'width', label: 'Width', unit: 'm' }, { k: 'depth', label: 'Depth', unit: 'mm', def: '100' },
      { k: 'mix', label: 'Mix', kind: 'select', def: 'premix', options: [['premix', 'Ready-bagged pre-mix'], ...MIXES.map(([v, l]) => [v, `Cement, sand and aggregate ${l}`])] },
    ],
    assumptions: [
      { k: 'bagKg', label: 'Pre-mix bag weight', unit: 'kg', def: '25' },
      { k: 'dryDensity', label: 'Dry pre-mix needed per m³ of concrete', unit: 'kg', def: '2300', hint: 'Check the bag: it often states the yield.' },
      { k: 'dryFactor', label: 'Dry volume needed per m³ of wet concrete', unit: '', def: '1.54' },
      { k: 'cementDensity', label: 'Cement density', unit: 'kg/m³', def: '1440' },
      { k: 'cementBagKg', label: 'Cement bag weight', unit: 'kg', def: '25' },
      { k: 'sandDensity', label: 'Sand density', unit: 'kg/m³', def: '1600' },
      { k: 'aggDensity', label: 'Aggregate density', unit: 'kg/m³', def: '1500' },
    ],
    compute(v, a, w) {
      const vol = (v.length * v.width * v.depth) / 1000;
      const volW = w(vol, true);
      const steps = [`Volume = length × width × depth = ${fmt(v.length)} × ${fmt(v.width)} × ${fmt(v.depth / 1000, 3)} m = ${fmt(vol, 3)} m³`, `With wastage = ${fmt(volW, 3)} m³`];
      const results = [{ label: 'Concrete needed', value: fmt(volW, 2), unit: 'm³' }];
      const lines = [];
      if (v.mix === 'premix') {
        const yieldM3 = a.bagKg / a.dryDensity;
        const bags = ceilN(volW / yieldM3);
        steps.push(`One ${fmt(a.bagKg, 0)} kg bag makes ${fmt(a.bagKg, 0)} ÷ ${fmt(a.dryDensity, 0)} = ${fmt(yieldM3, 4)} m³`, `Bags = ${fmt(volW, 3)} ÷ ${fmt(yieldM3, 4)} = ${fmt(volW / yieldM3, 1)}, rounded up to ${bags}`);
        results.push({ label: `Pre-mix bags (${fmt(a.bagKg, 0)} kg)`, value: String(bags), unit: 'bags' });
        lines.push({ item: `Concrete pre-mix, ${fmt(a.bagKg, 0)} kg bag`, qty: bags, unit: 'bags' });
      } else {
        const [c, s, g] = parts(v.mix);
        const sum = c + s + g;
        const dry = volW * a.dryFactor;
        const cementM3 = (dry * c) / sum, sandM3 = (dry * s) / sum, aggM3 = (dry * g) / sum;
        const cementKg = cementM3 * a.cementDensity;
        const bags = bagsOf(cementKg, a.cementBagKg);
        const sandT = up((sandM3 * a.sandDensity) / 1000), aggT = up((aggM3 * a.aggDensity) / 1000);
        steps.push(`Dry volume = ${fmt(volW, 3)} × ${fmt(a.dryFactor)} = ${fmt(dry, 3)} m³, shared ${c} : ${s} : ${g}`,
          `Cement = ${fmt(cementM3, 3)} m³ × ${fmt(a.cementDensity, 0)} kg/m³ = ${fmt(cementKg, 0)} kg = ${bags} bags of ${fmt(a.cementBagKg, 0)} kg`,
          `Sand = ${fmt(sandM3, 3)} m³ × ${fmt(a.sandDensity, 0)} kg/m³ = ${fmt(sandT)} t`, `Aggregate = ${fmt(aggM3, 3)} m³ × ${fmt(a.aggDensity, 0)} kg/m³ = ${fmt(aggT)} t`);
        results.push({ label: `Cement (${fmt(a.cementBagKg, 0)} kg bags)`, value: String(bags), unit: 'bags' }, { label: 'Sand', value: fmt(sandT), unit: 'tonnes' }, { label: 'Coarse aggregate', value: fmt(aggT), unit: 'tonnes' });
        lines.push({ item: `Cement, ${fmt(a.cementBagKg, 0)} kg bag`, qty: bags, unit: 'bags' }, { item: 'Sharp sand', qty: sandT, unit: 'tonnes' }, { item: 'Coarse aggregate', qty: aggT, unit: 'tonnes' });
      }
      return { results, lines, steps };
    },
  },
  // ===================================================================== bricks and blocks
  {
    key: 'bricks', title: 'Bricks and blocks', emoji: '🧱', group: 'Concrete and masonry', text: 'Units, mortar, cement and sand for a wall.',
    waste: { mode: 'pct', value: '5' }, mainUnit: 'units',
    inputs: [
      { k: 'length', label: 'Wall length', unit: 'm' }, { k: 'height', label: 'Wall height', unit: 'm' },
      { k: 'openings', label: 'Openings to take off (doors, windows)', unit: 'm²', opt: true, def: '0' },
      { k: 'ul', label: 'Unit length', unit: 'mm', def: '215', hint: 'Brick 215, block 440' },
      { k: 'uh', label: 'Unit height', unit: 'mm', def: '65', hint: 'Brick 65, block 215' },
      { k: 'uw', label: 'Wall thickness (unit width)', unit: 'mm', def: '102.5' },
      { k: 'joint', label: 'Mortar joint', unit: 'mm', def: '10' },
      { k: 'mix', label: 'Mortar mix (cement : sand)', kind: 'select', def: '1:5', options: MORTAR },
    ],
    assumptions: [
      { k: 'mortarWaste', label: 'Mortar allowance for waste', unit: '%', def: '20' },
      { k: 'dryFactor', label: 'Dry volume needed per m³ of wet mortar', unit: '', def: '1.3' },
      { k: 'cementDensity', label: 'Cement density', unit: 'kg/m³', def: '1440' },
      { k: 'cementBagKg', label: 'Cement bag weight', unit: 'kg', def: '25' },
      { k: 'sandDensity', label: 'Sand density', unit: 'kg/m³', def: '1600' },
    ],
    compute(v, a, w) {
      const area = Math.max(0, v.length * v.height - v.openings);
      const perM2 = 1 / (((v.ul + v.joint) / 1000) * ((v.uh + v.joint) / 1000));
      const raw = area * perM2;
      const units = ceilN(w(raw, true));
      const wall = (area * v.uw) / 1000;
      const unitVol = raw * (v.ul / 1000) * (v.uh / 1000) * (v.uw / 1000);
      const wet = Math.max(0, wall - unitVol) * (1 + a.mortarWaste / 100);
      const wetW = w(wet);
      const s = parts(v.mix)[1];
      const dry = wetW * a.dryFactor;
      const cementM3 = dry / (1 + s), sandM3 = (dry * s) / (1 + s);
      const cementKg = cementM3 * a.cementDensity;
      const bags = bagsOf(cementKg, a.cementBagKg);
      const sandT = up((sandM3 * a.sandDensity) / 1000);
      const steps = [
        `Wall area = ${fmt(v.length)} × ${fmt(v.height)} − ${fmt(v.openings)} = ${fmt(area)} m²`,
        `Units per m² = 1 ÷ ((${fmt(v.ul)} + ${fmt(v.joint)}) × (${fmt(v.uh)} + ${fmt(v.joint)})) mm = ${fmt(perM2, 1)}`,
        `Units = ${fmt(area)} × ${fmt(perM2, 1)} = ${fmt(raw, 1)}; with wastage ${fmt(w(raw, true), 1)}, rounded up to ${units}`,
        `Mortar = wall volume ${fmt(wall, 3)} m³ − units ${fmt(unitVol, 3)} m³, plus ${fmt(a.mortarWaste, 0)}% for waste = ${fmt(wet, 3)} m³`,
        `Dry materials = ${fmt(wetW, 3)} × ${fmt(a.dryFactor)} = ${fmt(dry, 3)} m³, shared 1 : ${s}`,
        `Cement = ${fmt(cementM3, 3)} m³ × ${fmt(a.cementDensity, 0)} = ${fmt(cementKg, 0)} kg = ${bags} bags; sand = ${fmt(sandT)} t`,
      ];
      return {
        results: [{ label: 'Wall area', value: fmt(area), unit: 'm²' }, { label: 'Bricks or blocks', value: String(units), unit: 'units' }, { label: 'Mortar', value: fmt(wetW, 2), unit: 'm³' }, { label: `Cement (${fmt(a.cementBagKg, 0)} kg bags)`, value: String(bags), unit: 'bags' }, { label: 'Building sand', value: fmt(sandT), unit: 'tonnes' }],
        lines: [{ item: `Bricks or blocks ${fmt(v.ul, 0)} × ${fmt(v.uh, 0)} × ${fmt(v.uw, 1)} mm`, qty: units, unit: 'each' }, { item: `Cement, ${fmt(a.cementBagKg, 0)} kg bag`, qty: bags, unit: 'bags' }, { item: 'Building sand', qty: sandT, unit: 'tonnes' }],
        steps,
      };
    },
  },
  // ===================================================================== flooring
  {
    key: 'flooring', title: 'Laminate and flooring', emoji: '🪵', group: 'Floors, walls and paint', text: 'Planks, packs, underlay and beading for a room.',
    waste: { mode: 'pct', value: '10' }, mainUnit: 'planks',
    inputs: [
      { k: 'length', label: 'Room length', unit: 'm' }, { k: 'width', label: 'Room width', unit: 'm' },
      { k: 'pl', label: 'Plank length', unit: 'mm', def: '1200' }, { k: 'pw', label: 'Plank width', unit: 'mm', def: '190' },
      { k: 'perPack', label: 'Planks in a pack', unit: '', def: '8' },
      { k: 'roll', label: 'Underlay: area of one roll (leave 0 for none)', unit: 'm²', opt: true, def: '15' },
      { k: 'doors', label: 'Beading: doorways to leave out', unit: 'm', opt: true, def: '0' },
      { k: 'piece', label: 'Beading or scotia: length of one piece (0 for none)', unit: 'm', opt: true, def: '2.4' },
    ],
    assumptions: [],
    compute(v, a, w) {
      const area = v.length * v.width;
      const plankArea = (v.pl * v.pw) / 1e6;
      const rawPlanks = area / plankArea;
      const planks = ceilN(w(rawPlanks, true));
      const packs = ceilN(planks / v.perPack);
      const steps = [`Floor area = ${fmt(v.length)} × ${fmt(v.width)} = ${fmt(area)} m²`, `One plank = ${fmt(v.pl, 0)} × ${fmt(v.pw, 0)} mm = ${fmt(plankArea, 4)} m²`, `Planks = ${fmt(area)} ÷ ${fmt(plankArea, 4)} = ${fmt(rawPlanks, 1)}; with wastage ${fmt(w(rawPlanks, true), 1)}, rounded up to ${planks}`, `Packs = ${planks} ÷ ${fmt(v.perPack, 0)} = ${fmt(planks / v.perPack, 1)}, rounded up to ${packs}`];
      const results = [{ label: 'Floor area', value: fmt(area), unit: 'm²' }, { label: 'Planks', value: String(planks), unit: 'planks' }, { label: 'Packs', value: String(packs), unit: 'packs' }];
      const lines = [{ item: `Flooring planks ${fmt(v.pl, 0)} × ${fmt(v.pw, 0)} mm (packs of ${fmt(v.perPack, 0)})`, qty: packs, unit: 'packs' }];
      if (v.roll > 0) {
        const rolls = ceilN(w(area) / v.roll);
        steps.push(`Underlay = ${fmt(w(area))} ÷ ${fmt(v.roll)} m² per roll = ${fmt(w(area) / v.roll, 1)}, rounded up to ${rolls}`);
        results.push({ label: 'Underlay rolls', value: String(rolls), unit: 'rolls' });
        lines.push({ item: 'Flooring underlay', qty: rolls, unit: 'rolls' });
      }
      if (v.piece > 0) {
        const perim = Math.max(0, 2 * (v.length + v.width) - v.doors);
        const pieces = ceilN(w(perim) / v.piece);
        steps.push(`Beading = 2 × (${fmt(v.length)} + ${fmt(v.width)}) − ${fmt(v.doors)} = ${fmt(perim)} m; with wastage ${fmt(w(perim))} ÷ ${fmt(v.piece)} m = ${pieces} pieces`);
        results.push({ label: 'Beading length', value: fmt(perim), unit: 'm' }, { label: 'Beading or scotia pieces', value: String(pieces), unit: 'pieces' });
        lines.push({ item: `Beading or scotia, ${fmt(v.piece)} m length`, qty: pieces, unit: 'pieces' });
      }
      return { results, lines, steps };
    },
  },
  // ===================================================================== tiles
  {
    key: 'tiles', title: 'Tiles', emoji: '🔲', group: 'Floors, walls and paint', text: 'Tiles, boxes, adhesive and grout for an area.',
    waste: { mode: 'pct', value: '10' }, mainUnit: 'tiles',
    inputs: [
      { k: 'area', label: 'Area to tile', unit: 'm²' }, { k: 'tl', label: 'Tile length', unit: 'mm', def: '300' }, { k: 'tw', label: 'Tile width', unit: 'mm', def: '300' },
      { k: 'tt', label: 'Tile thickness', unit: 'mm', def: '8' }, { k: 'joint', label: 'Grout joint', unit: 'mm', def: '3' }, { k: 'perBox', label: 'Tiles in a box', unit: '', def: '11' },
    ],
    assumptions: [
      { k: 'adhesiveKg', label: 'Adhesive used per m²', unit: 'kg', def: '4', hint: 'Check the tub or bag.' }, { k: 'adhesiveBag', label: 'Adhesive bag or tub size', unit: 'kg', def: '20' },
      { k: 'groutDensity', label: 'Grout density factor', unit: '', def: '1.6' }, { k: 'groutBag', label: 'Grout bag size', unit: 'kg', def: '5' },
    ],
    compute(v, a, w) {
      const tileArea = ((v.tl + v.joint) * (v.tw + v.joint)) / 1e6;
      const raw = v.area / tileArea;
      const tiles = ceilN(w(raw, true));
      const boxes = ceilN(tiles / v.perBox);
      const adhesive = w(v.area) * a.adhesiveKg;
      const adhBags = bagsOf(adhesive, a.adhesiveBag);
      const groutPerM2 = ((v.tl + v.tw) / (v.tl * v.tw)) * v.joint * v.tt * a.groutDensity;
      const grout = w(v.area) * groutPerM2;
      const groutBags = bagsOf(grout, a.groutBag);
      return {
        results: [{ label: 'Tiles', value: String(tiles), unit: 'tiles' }, { label: 'Boxes', value: String(boxes), unit: 'boxes' }, { label: `Adhesive (${fmt(a.adhesiveBag, 0)} kg)`, value: String(adhBags), unit: 'bags' }, { label: `Grout (${fmt(a.groutBag, 0)} kg)`, value: String(groutBags), unit: 'bags' }],
        lines: [{ item: `Tiles ${fmt(v.tl, 0)} × ${fmt(v.tw, 0)} mm (boxes of ${fmt(v.perBox, 0)})`, qty: boxes, unit: 'boxes' }, { item: `Tile adhesive, ${fmt(a.adhesiveBag, 0)} kg`, qty: adhBags, unit: 'bags' }, { item: `Tile grout, ${fmt(a.groutBag, 0)} kg`, qty: groutBags, unit: 'bags' }],
        steps: [
          `One tile with its joint = (${fmt(v.tl, 0)} + ${fmt(v.joint, 0)}) × (${fmt(v.tw, 0)} + ${fmt(v.joint, 0)}) mm = ${fmt(tileArea, 4)} m²`,
          `Tiles = ${fmt(v.area)} ÷ ${fmt(tileArea, 4)} = ${fmt(raw, 1)}; with wastage ${fmt(w(raw, true), 1)}, rounded up to ${tiles}`,
          `Boxes = ${tiles} ÷ ${fmt(v.perBox, 0)} = ${fmt(tiles / v.perBox, 1)}, rounded up to ${boxes}`,
          `Adhesive = ${fmt(w(v.area))} m² × ${fmt(a.adhesiveKg)} kg = ${fmt(adhesive, 1)} kg = ${adhBags} bags`,
          `Grout per m² = ((${fmt(v.tl, 0)} + ${fmt(v.tw, 0)}) ÷ (${fmt(v.tl, 0)} × ${fmt(v.tw, 0)})) × joint ${fmt(v.joint, 0)} × thickness ${fmt(v.tt, 0)} × ${fmt(a.groutDensity)} = ${fmt(groutPerM2, 2)} kg`,
          `Grout = ${fmt(w(v.area))} × ${fmt(groutPerM2, 2)} = ${fmt(grout, 1)} kg = ${groutBags} bags`,
        ],
      };
    },
  },
  // ===================================================================== paint
  {
    key: 'paint', title: 'Paint', emoji: '🎨', group: 'Floors, walls and paint', text: 'Litres and tins for walls or ceilings.',
    waste: { mode: 'pct', value: '5' }, mainUnit: 'litres',
    inputs: [
      { k: 'area', label: 'Area to paint (or fill in the room size below)', unit: 'm²', opt: true, def: '' },
      { k: 'length', label: 'Room length', unit: 'm', opt: true }, { k: 'width', label: 'Room width', unit: 'm', opt: true }, { k: 'height', label: 'Room height', unit: 'm', opt: true, def: '2.4' },
      { k: 'openings', label: 'Openings to take off', unit: 'm²', opt: true, def: '0' },
      { k: 'ceiling', label: 'Include the ceiling?', kind: 'select', def: 'no', options: [['no', 'No – walls only'], ['yes', 'Yes – walls and ceiling']] },
      { k: 'coats', label: 'Coats', unit: '', def: '2' }, { k: 'tin', label: 'Tin size', unit: 'litres', def: '5' },
    ],
    assumptions: [{ k: 'coverage', label: 'Coverage per litre per coat', unit: 'm²', def: '12', hint: 'Check the tin: it varies by paint and surface.' }],
    required: ['coats', 'tin'],
    compute(v, a, w) {
      const walls = 2 * (v.length + v.width) * v.height;
      const ceil = v.ceiling === 'yes' ? v.length * v.width : 0;
      const dims = Math.max(0, walls + ceil - v.openings);
      const area = v.area > 0 ? v.area : dims;
      if (!(area > 0)) return { error: 'Enter the area, or the room length, width and height.' };
      const litres = w((area * v.coats) / a.coverage, true);
      const tins = ceilN(litres / v.tin);
      return {
        results: [{ label: 'Area', value: fmt(area), unit: 'm²' }, { label: 'Paint needed', value: fmt(litres, 1), unit: 'litres' }, { label: `Tins (${fmt(v.tin)} litres)`, value: String(tins), unit: 'tins' }],
        lines: [{ item: `Paint, ${fmt(v.tin)} litre tin`, qty: tins, unit: 'tins' }],
        steps: [v.area > 0 ? `Area = ${fmt(area)} m² (as entered)` : `Area = walls 2 × (${fmt(v.length)} + ${fmt(v.width)}) × ${fmt(v.height)}${ceil ? ` + ceiling ${fmt(ceil)}` : ''} − openings ${fmt(v.openings)} = ${fmt(area)} m²`, `Litres = ${fmt(area)} × ${fmt(v.coats, 0)} coats ÷ ${fmt(a.coverage)} m² per litre = ${fmt((area * v.coats) / a.coverage, 2)}; with wastage ${fmt(litres, 2)}`, `Tins = ${fmt(litres, 2)} ÷ ${fmt(v.tin)} = ${fmt(litres / v.tin, 2)}, rounded up to ${tins}`],
      };
    },
  },
  // ===================================================================== plasterboard
  {
    key: 'plasterboard', title: 'Plasterboard and plaster', emoji: '🪨', group: 'Boards, timber and insulation', text: 'Boards, screws and skim plaster for an area.',
    waste: { mode: 'pct', value: '10' }, mainUnit: 'boards',
    inputs: [
      { k: 'area', label: 'Area to board', unit: 'm²' }, { k: 'bl', label: 'Board length', unit: 'mm', def: '2400' }, { k: 'bw', label: 'Board width', unit: 'mm', def: '1200' },
      { k: 'thick', label: 'Skim plaster thickness (0 for none)', unit: 'mm', opt: true, def: '2' },
    ],
    assumptions: [
      { k: 'screwsPerM2', label: 'Screws per m² of board', unit: '', def: '20' }, { k: 'screwBox', label: 'Screws in a box', unit: '', def: '1000' },
      { k: 'plasterKg', label: 'Plaster used per m² per mm of thickness', unit: 'kg', def: '1', hint: 'Check the bag.' }, { k: 'plasterBag', label: 'Plaster bag size', unit: 'kg', def: '25' },
    ],
    compute(v, a, w) {
      const boardArea = (v.bl * v.bw) / 1e6;
      const rawBoards = v.area / boardArea;
      const boards = ceilN(w(rawBoards, true));
      const screws = ceilN(w(v.area * a.screwsPerM2));
      const boxes = ceilN(screws / a.screwBox);
      const results = [{ label: 'Boards', value: String(boards), unit: 'boards' }, { label: 'Screws', value: String(screws), unit: 'screws' }, { label: `Boxes of ${fmt(a.screwBox, 0)}`, value: String(boxes), unit: 'boxes' }];
      const lines = [{ item: `Plasterboard ${fmt(v.bl, 0)} × ${fmt(v.bw, 0)} mm`, qty: boards, unit: 'boards' }, { item: 'Drywall screws', qty: boxes, unit: `boxes of ${fmt(a.screwBox, 0)}` }];
      const steps = [`One board = ${fmt(v.bl, 0)} × ${fmt(v.bw, 0)} mm = ${fmt(boardArea, 3)} m²`, `Boards = ${fmt(v.area)} ÷ ${fmt(boardArea, 3)} = ${fmt(rawBoards, 1)}; with wastage ${fmt(w(rawBoards, true), 1)}, rounded up to ${boards}`, `Screws = ${fmt(w(v.area))} m² × ${fmt(a.screwsPerM2, 0)} = ${screws} (${boxes} boxes)`];
      if (v.thick > 0) {
        const kg = w(v.area * v.thick * a.plasterKg);
        const bags = bagsOf(kg, a.plasterBag);
        steps.push(`Plaster = ${fmt(v.area)} m² × ${fmt(v.thick)} mm × ${fmt(a.plasterKg)} kg = ${fmt(kg, 1)} kg = ${bags} bags of ${fmt(a.plasterBag, 0)} kg`);
        results.push({ label: `Skim plaster (${fmt(a.plasterBag, 0)} kg)`, value: String(bags), unit: 'bags' });
        lines.push({ item: `Skim plaster, ${fmt(a.plasterBag, 0)} kg`, qty: bags, unit: 'bags' });
      }
      return { results, lines, steps };
    },
  },
  // ===================================================================== stud wall
  {
    key: 'studwall', title: 'Stud wall', emoji: '🪚', group: 'Boards, timber and insulation', text: 'Studs, noggins and head and sole plates.',
    waste: { mode: 'pct', value: '10' }, mainUnit: 'studs',
    inputs: [
      { k: 'length', label: 'Wall length', unit: 'm' }, { k: 'height', label: 'Wall height', unit: 'm', def: '2.4' },
      { k: 'centres', label: 'Stud centres', kind: 'select', def: '400', options: [['400', '400 mm'], ['450', '450 mm'], ['600', '600 mm']] },
      { k: 'rows', label: 'Rows of noggins', unit: '', def: '1' }, { k: 'sw', label: 'Stud width (for noggin length)', unit: 'mm', def: '47' },
      { k: 'piece', label: 'Length of timber bought for plates', unit: 'm', def: '2.4' },
    ],
    assumptions: [],
    compute(v, a, w) {
      const c = Number(v.centres);
      const studsRaw = ceilN((v.length * 1000) / c) + 1;
      const studs = ceilN(w(studsRaw, true));
      const noggins = ceilN(w(v.rows * (studsRaw - 1)));
      const nogLen = c - v.sw;
      const plates = 2 * v.length;
      const pieces = ceilN(w(plates) / v.piece);
      return {
        results: [{ label: `Studs (${fmt(v.height)} m long)`, value: String(studs), unit: 'studs' }, { label: `Noggins (${fmt(nogLen, 0)} mm long)`, value: String(noggins), unit: 'noggins' }, { label: 'Head and sole plate', value: fmt(plates), unit: 'm' }, { label: `Plate timber (${fmt(v.piece)} m lengths)`, value: String(pieces), unit: 'lengths' }],
        lines: [{ item: `Stud timber, ${fmt(v.height)} m long`, qty: studs, unit: 'each' }, { item: `Noggins cut from stud timber, ${fmt(nogLen, 0)} mm long`, qty: noggins, unit: 'each' }, { item: `Plate timber, ${fmt(v.piece)} m length`, qty: pieces, unit: 'lengths' }],
        steps: [`Studs = ${fmt(v.length)} m ÷ ${fmt(c, 0)} mm = ${ceilN((v.length * 1000) / c)} spaces, + 1 = ${studsRaw}; with wastage ${studs}`, `Noggins = ${fmt(v.rows, 0)} row(s) × ${studsRaw - 1} gaps = ${v.rows * (studsRaw - 1)}; with wastage ${noggins}, each ${fmt(c, 0)} − ${fmt(v.sw, 0)} = ${fmt(nogLen, 0)} mm`, `Plates = 2 × ${fmt(v.length)} = ${fmt(plates)} m; with wastage ${fmt(w(plates))} ÷ ${fmt(v.piece)} m = ${pieces} lengths`],
      };
    },
  },
  // ===================================================================== insulation
  {
    key: 'insulation', title: 'Insulation', emoji: '🧤', group: 'Boards, timber and insulation', text: 'Rolls or boards for an area and depth.',
    waste: { mode: 'pct', value: '10' }, mainUnit: 'packs',
    inputs: [
      { k: 'area', label: 'Area to insulate', unit: 'm²' }, { k: 'depth', label: 'Depth required', unit: 'mm', def: '270' },
      { k: 'coverage', label: 'Area covered by one roll or pack (from the label)', unit: 'm²', def: '8.2' },
      { k: 'product', label: 'Product', kind: 'select', def: 'roll', options: [['roll', 'Rolls'], ['board', 'Boards']] },
    ],
    assumptions: [],
    compute(v, a, w) {
      const packs = ceilN(w(v.area, true) / v.coverage);
      const vol = (v.area * v.depth) / 1000;
      const name = v.product === 'board' ? 'boards or packs' : 'rolls';
      return {
        results: [{ label: 'Volume of insulation', value: fmt(vol, 2), unit: 'm³' }, { label: `Number of ${name}`, value: String(packs), unit: name }],
        lines: [{ item: `Insulation ${fmt(v.depth, 0)} mm, covers ${fmt(v.coverage)} m² each`, qty: packs, unit: name }],
        steps: [`Volume = ${fmt(v.area)} m² × ${fmt(v.depth, 0)} mm = ${fmt(vol, 2)} m³`, `${v.product === 'board' ? 'Packs' : 'Rolls'} = ${fmt(w(v.area, true))} m² (with wastage) ÷ ${fmt(v.coverage)} m² = ${fmt(w(v.area, true) / v.coverage, 2)}, rounded up to ${packs}`],
      };
    },
  },
  // ===================================================================== aggregates
  {
    key: 'aggregates', title: 'Aggregates', emoji: '🪨', group: 'Concrete and masonry', text: 'Tonnes or bulk bags for an area and depth.',
    waste: { mode: 'pct', value: '0' }, mainUnit: 'tonnes',
    inputs: [
      { k: 'area', label: 'Area', unit: 'm²' }, { k: 'depth', label: 'Depth', unit: 'mm', def: '100' },
      { k: 'material', label: 'Material', kind: 'select', def: 'type1', options: [['type1', 'Type 1 sub-base'], ['sharp', 'Sharp sand'], ['gravel', 'Gravel or shingle'], ['topsoil', 'Topsoil']] },
    ],
    assumptions: [
      { k: 'type1', label: 'Density of Type 1 sub-base', unit: 't/m³', def: '2.1' }, { k: 'sharp', label: 'Density of sharp sand', unit: 't/m³', def: '1.6' },
      { k: 'gravel', label: 'Density of gravel or shingle', unit: 't/m³', def: '1.7' }, { k: 'topsoil', label: 'Density of topsoil', unit: 't/m³', def: '1.4' },
      { k: 'compaction', label: 'Allowance for compaction', unit: '%', def: '15' }, { k: 'bag', label: 'Bulk bag size', unit: 'tonnes', def: '0.85' },
    ],
    compute(v, a, w) {
      const dens = a[v.material];
      const vol = (v.area * v.depth) / 1000;
      const volC = w(vol * (1 + a.compaction / 100), true);
      const tonnes = up(volC * dens);
      const bags = ceilN(tonnes / a.bag);
      const name = { type1: 'Type 1 sub-base', sharp: 'Sharp sand', gravel: 'Gravel or shingle', topsoil: 'Topsoil' }[v.material];
      return {
        results: [{ label: 'Volume needed', value: fmt(volC, 2), unit: 'm³' }, { label: 'Weight', value: fmt(tonnes, 2), unit: 'tonnes' }, { label: `Bulk bags (${fmt(a.bag)} t)`, value: String(bags), unit: 'bags' }],
        lines: [{ item: name, qty: tonnes, unit: 'tonnes' }],
        steps: [`Volume = ${fmt(v.area)} m² × ${fmt(v.depth, 0)} mm = ${fmt(vol, 3)} m³`, `With ${fmt(a.compaction, 0)}% for compaction and wastage = ${fmt(volC, 3)} m³`, `Weight = ${fmt(volC, 3)} × ${fmt(dens)} t/m³ = ${fmt(tonnes)} t`, `Bulk bags = ${fmt(tonnes)} ÷ ${fmt(a.bag)} = ${fmt(tonnes / a.bag, 1)}, rounded up to ${bags}`],
      };
    },
  },
  // ===================================================================== roof tiles
  {
    key: 'rooftiles', title: 'Roof tiles', emoji: '🏠', group: 'Roofing and groundwork', text: 'Tiles and battens from the roof area, gauge and cover.',
    waste: { mode: 'pct', value: '5' }, mainUnit: 'tiles',
    inputs: [
      { k: 'area', label: 'Roof area (slope area, not floor plan)', unit: 'm²' }, { k: 'gauge', label: 'Batten gauge (spacing up the slope)', unit: 'mm', def: '345' },
      { k: 'cover', label: 'Tile cover width (across the roof)', unit: 'mm', def: '300' }, { k: 'piece', label: 'Batten length bought', unit: 'm', def: '3.6' },
    ],
    assumptions: [],
    compute(v, a, w) {
      const perM2 = 1 / ((v.gauge / 1000) * (v.cover / 1000));
      const raw = v.area * perM2;
      const tiles = ceilN(w(raw, true));
      const run = v.area / (v.gauge / 1000);
      const battens = ceilN(w(run) / v.piece);
      return {
        results: [{ label: 'Tiles per m²', value: fmt(perM2, 1), unit: '' }, { label: 'Tiles', value: String(tiles), unit: 'tiles' }, { label: 'Batten length', value: fmt(w(run), 0), unit: 'm' }, { label: `Battens (${fmt(v.piece)} m)`, value: String(battens), unit: 'battens' }],
        lines: [{ item: 'Roof tiles', qty: tiles, unit: 'each' }, { item: `Roof battens, ${fmt(v.piece)} m length`, qty: battens, unit: 'each' }],
        steps: [`Tiles per m² = 1 ÷ (${fmt(v.gauge, 0)} mm × ${fmt(v.cover, 0)} mm) = ${fmt(perM2, 2)}`, `Tiles = ${fmt(v.area)} × ${fmt(perM2, 2)} = ${fmt(raw, 1)}; with wastage ${fmt(w(raw, true), 1)}, rounded up to ${tiles}`, `Batten run = ${fmt(v.area)} m² ÷ ${fmt(v.gauge / 1000, 3)} m = ${fmt(run, 1)} m; with wastage ${fmt(w(run), 1)} ÷ ${fmt(v.piece)} m = ${battens} battens`],
      };
    },
  },
  // ===================================================================== fall / gradient
  {
    key: 'fall', title: 'Fall and gradient', emoji: '📐', group: 'Converters', text: 'Fall as a ratio, a percentage or an angle – and the reverse.',
    waste: false, mainUnit: '',
    inputs: [
      { k: 'mode', label: 'Work out from', kind: 'select', def: 'fall', options: [['fall', 'Length and fall'], ['ratio', 'Length and ratio (1 in …)'], ['pct', 'Length and percentage']] },
      { k: 'length', label: 'Length', unit: 'mm' },
      { k: 'fall', label: 'Fall', unit: 'mm', opt: true, showIf: { mode: 'fall' } }, { k: 'ratio', label: 'Ratio: 1 in', unit: '', opt: true, showIf: { mode: 'ratio' } }, { k: 'pct', label: 'Percentage', unit: '%', opt: true, showIf: { mode: 'pct' } },
    ],
    assumptions: [],
    compute(v) {
      let fall;
      if (v.mode === 'fall') fall = v.fall;
      else if (v.mode === 'ratio') fall = v.ratio > 0 ? v.length / v.ratio : 0;
      else fall = (v.length * v.pct) / 100;
      if (!(fall > 0)) return { error: 'Enter the fall, the ratio or the percentage as chosen above.' };
      const ratio = v.length / fall, pct = (fall / v.length) * 100, deg = (Math.atan(fall / v.length) * 180) / Math.PI;
      return {
        results: [{ label: 'Fall', value: fmt(fall, 1), unit: 'mm' }, { label: 'Ratio', value: `1 in ${fmt(ratio, 1)}`, unit: '' }, { label: 'Percentage', value: fmt(pct, 2), unit: '%' }, { label: 'Angle', value: fmt(deg, 2), unit: '°' }],
        lines: [],
        steps: [`Fall = ${fmt(fall, 1)} mm over ${fmt(v.length, 0)} mm`, `Ratio = length ÷ fall = ${fmt(v.length, 0)} ÷ ${fmt(fall, 1)} = 1 in ${fmt(ratio, 1)}`, `Percentage = fall ÷ length × 100 = ${fmt(pct, 2)}%`, `Angle = arctan(fall ÷ length) = ${fmt(deg, 2)}°`],
      };
    },
  },
  // ===================================================================== screw converter
  {
    key: 'screws', title: 'Screw converter', emoji: '🔩', group: 'Converters', text: 'Imperial gauge and inches to metric millimetres, and back.',
    waste: false, mainUnit: '',
    inputs: [
      { k: 'gauge', label: 'Imperial gauge (the number, e.g. 6)', unit: '', opt: true }, { k: 'inch', label: 'Length in inches (e.g. 3/4 or 1 1/2)', kind: 'frac', opt: true },
      { k: 'mm', label: 'Metric diameter', unit: 'mm', opt: true }, { k: 'mmLen', label: 'Metric length', unit: 'mm', opt: true },
    ],
    assumptions: [],
    compute(v) {
      const results = [], steps = [];
      if (v.gauge > 0 || v.inch > 0) {
        if (v.gauge > 0) {
          const dIn = gaugeToInches(v.gauge), dMm = dIn * 25.4;
          steps.push(`Gauge ${fmt(v.gauge, 0)}: diameter = 0.060 + 0.013 × ${fmt(v.gauge, 0)} = ${fmt(dIn, 3)} in = ${fmt(dMm, 2)} mm`);
          results.push({ label: `Gauge ${fmt(v.gauge, 0)} is`, value: fmt(dMm, 2), unit: 'mm diameter' }, { label: 'Nearest metric screw', value: `${fmt(nearest(METRIC_DIAMETERS, dMm), 1)} mm`, unit: '' });
        }
        if (v.inch > 0) {
          const mm = v.inch * 25.4;
          steps.push(`Length ${fmt(v.inch, 3)} in × 25.4 = ${fmt(mm, 1)} mm`);
          results.push({ label: `${fmt(v.inch, 3)} in is`, value: fmt(mm, 1), unit: 'mm long' }, { label: 'Nearest metric length', value: `${fmt(nearest(METRIC_LENGTHS, mm), 0)} mm`, unit: '' });
        }
      }
      if (v.mm > 0 || v.mmLen > 0) {
        if (v.mm > 0) {
          const dIn = v.mm / 25.4, g = inchesToGauge(dIn);
          steps.push(`${fmt(v.mm, 2)} mm = ${fmt(dIn, 3)} in; gauge = (${fmt(dIn, 3)} − 0.060) ÷ 0.013 = ${fmt(g, 1)}`);
          results.push({ label: `${fmt(v.mm, 2)} mm is gauge`, value: fmt(g, 1), unit: '' }, { label: 'Nearest whole gauge', value: String(Math.max(0, Math.round(g))), unit: '' });
        }
        if (v.mmLen > 0) {
          const inch = v.mmLen / 25.4;
          steps.push(`${fmt(v.mmLen, 1)} mm ÷ 25.4 = ${fmt(inch, 3)} in`);
          results.push({ label: `${fmt(v.mmLen, 1)} mm is`, value: fmt(inch, 3), unit: 'inches' });
        }
      }
      if (!results.length) return { error: 'Enter a gauge or length on one side, or a metric size on the other.' };
      return { results, lines: [], steps };
    },
  },
  // ===================================================================== unit converter
  {
    key: 'units', title: 'Unit converter', emoji: '⚖️', group: 'Converters', text: 'Length, area, volume and weight, metric and imperial.',
    waste: false, mainUnit: '',
    inputs: [{ k: 'value', label: 'Value', unit: '' }, { k: 'from', label: 'From', kind: 'select', def: 'Length|mm', options: UNIT_OPTIONS }],
    assumptions: [],
    required: ['value'],
    compute(v) {
      const [g, from] = v.from.split('|');
      const table = Object.keys(UNIT_GROUPS[g]).filter((u) => u !== from);
      return {
        results: table.map((u) => ({ label: u, value: fmt(convertUnit(v.value, v.from, u), 6), unit: '' })),
        lines: [],
        steps: [`${fmt(v.value, 6)} ${from} × (${from} in base units) ÷ (target in base units); base units are metres, m², m³ and kilograms`, ...table.slice(0, 3).map((u) => `${fmt(v.value, 6)} ${from} = ${fmt(convertUnit(v.value, v.from, u), 6)} ${u}`)],
      };
    },
  },
];

export const calcByKey = (key) => CALCS.find((c) => c.key === key) || CALCS[0];

const MEMORY = 'voids.calcLast.';
const recall = (kind) => { try { return JSON.parse(localStorage.getItem(MEMORY + kind) || 'null'); } catch { return null; } };
export const remember = (kind, data) => { try { localStorage.setItem(MEMORY + kind, JSON.stringify(data)); } catch { /* storage blocked */ } };

/** The starting inputs, assumptions and wastage for a calculator: the last ones used, else the defaults. */
export function defaultsFor(kind, { useMemory = true } = {}) {
  const c = calcByKey(kind);
  const base = {
    inputs: Object.fromEntries(c.inputs.map((i) => [i.k, i.def ?? ''])),
    assumptions: Object.fromEntries(c.assumptions.map((i) => [i.k, i.def ?? ''])),
    wastage: c.waste ? { ...c.waste } : { mode: 'pct', value: '0' },
  };
  const last = useMemory ? recall(kind) : null;
  if (last) return { inputs: { ...base.inputs, ...last.inputs }, assumptions: { ...base.assumptions, ...last.assumptions }, wastage: { ...base.wastage, ...last.wastage } };
  return base;
}

/** Wastage as a function: w(qty, main). */
export function wasteFn(wastage, calc) {
  const val = num(wastage?.value);
  const v = Number.isFinite(val) && val > 0 ? val : 0;
  if (calc.waste === false) return (q) => q;
  return (q, main = false) => (wastage?.mode === 'extra' ? (main ? q + v : q) : q * (1 + v / 100));
}

/**
 * Run a calculator. inputs / assumptions are the raw typed values. Returns
 * { ok: true, results, lines, steps } or { ok: false, error }.
 */
export function runCalc(kind, inputs, assumptions, wastage) {
  const c = calcByKey(kind);
  const v = {};
  for (const i of c.inputs) {
    const raw = inputs?.[i.k];
    if (i.kind === 'select') v[i.k] = String(raw ?? i.def ?? '');
    else if (i.kind === 'frac') v[i.k] = parseInches(raw);
    else {
      const x = num(raw);
      v[i.k] = Number.isFinite(x) ? x : i.opt ? 0 : NaN;
    }
  }
  const a = {};
  for (const s of c.assumptions) {
    const x = num(assumptions?.[s.k]);
    a[s.k] = Number.isFinite(x) && x >= 0 ? x : num(s.def);
  }
  // fractions typed but not understood
  for (const i of c.inputs) if (i.kind === 'frac' && String(inputs?.[i.k] ?? '').trim() && !Number.isFinite(v[i.k])) return { ok: false, error: `“${inputs[i.k]}” isn’t a length in inches. Try 0.75, 3/4 or 1 1/2.` };
  const required = c.required || c.inputs.filter((i) => !i.opt && i.kind !== 'select').map((i) => i.k);
  const missing = required.filter((k) => !(v[k] > 0));
  if (missing.length) return { ok: false, error: `Fill in: ${missing.map((k) => c.inputs.find((i) => i.k === k).label.replace(/ \(.*\)$/, '').toLowerCase()).join(', ')}.` };
  for (const i of c.inputs) if (!i.opt && i.kind !== 'select' && i.kind !== 'frac' && !(v[i.k] > 0) && !required.includes(i.k)) return { ok: false, error: `Fill in ${i.label.toLowerCase()}.` };
  const out = c.compute(v, a, wasteFn(wastage, c));
  if (out.error) return { ok: false, error: out.error };
  return { ok: true, ...out };
}

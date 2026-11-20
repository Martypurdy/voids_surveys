// A stock cabinet range, as carcass sizes only (millimetres): the widths each kind comes in and its height and depth.
// Source: a supplier's published spec sheet, with the base and tower depth altered to 565 mm to suit a 600 mm worktop.
// Names are generic on purpose. Sizes marked `assumed` are standard sizes that the sheet does not state: check them
// against the supplier before ordering or cutting. These are reference sizes for planning, not an order list.
export const RANGE = {
  // heights (mm)
  height: { base: 720, legs: 170, wallFull: 720, wallExtraTall: 900, wallHalf: 360, tower: 1942, towerExtraTall: 2122 },
  // carcass depths (mm); the door front and its gap are added on top
  depth: { base: 565, tower: 565, wall: 290, wallDeep: 390 },
  widths: {
    wall: [200, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000],
    wallHalf: [300, 350, 400, 450, 500, 600, 700, 800, 900, 1000],
    wallCornerStd: [631], wallCornerDeep: [731],
    wine: [150], curved: [300], hob: [600], microwave: [600], bridging: [1000],
    baseDoor: [200, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000],
    baseDrawerLine: [300, 400, 500, 600, 900, 1000],
    base2Drawer: [300, 350, 400, 450, 500, 600, 700, 800, 900],
    base3Drawer: [300, 600, 900, 1000],
    base4Drawer: [400, 500],
    baseCurved: [300], builtUnderOven: [600], belfast: [600, 800], carousel: [931],
    larder: [300, 400, 500, 600], applianceTower: [600], midiTower: [600], topCornerTower: [1000],
  },
  assumed: ['wine', 'curved', 'hob', 'microwave', 'bridging', 'midiTower'], // sizes not stated on the sheet
  // the midi appliance tower's height is not on the sheet at all
  midiTowerHeight: null,
};

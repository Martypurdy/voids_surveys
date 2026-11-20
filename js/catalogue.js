// Designer › the catalogue look of the tool buttons: a small drawn picture (front view for units, top view for fixtures)
// with the name and typical sizes underneath. The pictures are drawn here in code, so they work offline, follow the light
// and dark colours (CSS classes `.cat-ico .bd / .dr / .dk / .gl / .ln` in app.css) and stay sharp at any size. Pure – no DOM.
import { ITEMS } from './plan.js';

// Each picture is on a 64 x 64 grid. bd = carcass / body, dr = a door or drawer front, dk = solid dark (worktop, plinth,
// panel), gl = glass, ln = a plain line (handles, detail).
const worktop = '<rect class="dk" x="6" y="9" width="52" height="5" rx="1.5"/>';
const plinth = (x, w) => `<rect class="dk" x="${x}" y="52" width="${w}" height="4"/>`;
const handleV = (x, y1, y2) => `<line class="ln" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`;
const handleH = (y, x1, x2) => `<line class="ln" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
const body = (x, y, w, h) => `<rect class="bd" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/>`;
const door = (x, y, w, h) => `<rect class="dr" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;

// the three kinds of tall housing, also used on their own in the tall-housing picker
const larder = body(16, 4, 32, 52) + door(19, 7, 26, 21) + door(19, 30, 26, 22) + handleV(42, 20, 25) + handleV(42, 32, 37) + plinth(18, 28);
const ovenHousing = body(16, 4, 32, 52) + door(19, 7, 26, 14) + door(19, 23, 26, 17) + '<rect class="gl" x="22" y="26" width="20" height="11" rx="1"/><line class="ln" x1="23" y1="24.5" x2="41" y2="24.5"/>' + door(19, 42, 26, 10) + handleH(47, 34, 44) + plinth(18, 28);
const fridgeHousing = body(16, 4, 32, 52) + door(19, 7, 26, 9) + handleH(14, 34, 44) + '<rect class="sp2" x="19" y="18" width="26" height="34" rx="1"/>' + door(21, 20, 22, 10) + door(21, 32, 22, 18) + handleV(40, 22, 27) + handleV(40, 35, 43) + plinth(18, 28);

export const ICONS = {
  base: `${body(9, 12, 46, 40)}${worktop}${door(12, 17, 40, 31)}${handleV(46, 22, 32)}${plinth(11, 42)}`,
  cornerbase: `${body(9, 12, 46, 40)}${worktop}${door(12, 17, 19, 31)}${door(33, 17, 19, 31)}${handleV(28, 24, 34)}${handleV(36, 24, 34)}<path class="ln pk" d="M12 14 V21 H19"/>${plinth(11, 42)}`,
  blindcorner: `${body(9, 12, 46, 40)}${worktop}${door(12, 17, 25, 31)}${handleV(33, 24, 34)}<rect class="dr" x="39" y="17" width="13" height="31" rx="1"/><path class="ln" d="M41 46 L50 19 M41 38 L50 19 M45 46 L50 31"/>${plinth(11, 42)}`,
  tall: `${body(6, 6, 16, 50)}${door(8, 8, 12, 20)}${door(8, 30, 12, 22)}${body(24, 6, 16, 50)}${door(26, 8, 12, 12)}<rect class="gl" x="28" y="23" width="8" height="8" rx="1"/>${door(26, 34, 12, 18)}${body(42, 6, 16, 50)}${door(44, 8, 12, 12)}${door(44, 22, 12, 30)}`,
  blindwall: `<path class="ln" d="M20 5 V9 M44 5 V9"/>${body(9, 9, 46, 32)}${door(12, 12, 25, 26)}${handleV(33, 24, 33)}<rect class="dr" x="39" y="12" width="13" height="26" rx="1"/><path class="ln lt" d="M41 36 L50 15 M41 28 L50 15 M45 36 L50 26"/>`,
  larder, ovenhousing: ovenHousing, fridgefreezer: fridgeHousing,
  // the three family buttons: a few of the units inside, side by side
  basemenu: `<rect class="dk" x="3" y="22" width="58" height="3" rx="1"/>${body(4, 25, 16, 26)}${door(6, 27, 12, 22)}${body(24, 25, 16, 26)}${door(26, 27, 5, 22)}${door(33, 27, 5, 22)}${body(44, 25, 16, 26)}${door(46, 27, 8, 22)}<path class="ln lt" d="M49 47 L55 29 M49 41 L55 29"/>${plinth(4, 56)}`,
  wallmenu: `<path class="ln" d="M12 12 V16 M32 12 V16 M52 12 V16"/>${body(4, 16, 16, 30)}${door(6, 18, 12, 26)}${body(24, 16, 16, 30)}${door(26, 18, 5, 26)}${door(33, 18, 5, 26)}${body(44, 16, 16, 30)}${door(46, 18, 8, 26)}<path class="ln lt" d="M49 42 L55 21 M49 34 L55 21"/>`,
  appspace: `<rect class="sp" x="9" y="12" width="46" height="42" rx="2"/>${door(14, 20, 36, 30).replace('class="dr"', 'class="dr ghost"')}${handleH(25, 22, 42)}`,
  fillerbase: `${body(25, 12, 14, 40)}${worktop.replace('x="6"', 'x="23"').replace('width="52"', 'width="18"')}${door(27, 17, 10, 31)}${plinth(26, 12)}`,
  endpanel: '<rect class="dk" x="27" y="6" width="10" height="48" rx="1"/><path class="ln lt" d="M30 10 V50 M34 12 V48"/>',
  wallunit: `<path class="ln" d="M20 5 V9 M44 5 V9"/>${body(9, 9, 46, 32)}${door(12, 12, 40, 26)}${handleH(35, 26, 38)}`,
  cornerwall: `<path class="ln" d="M20 5 V9 M44 5 V9"/>${body(9, 9, 46, 32)}${door(12, 12, 19, 26)}${door(33, 12, 19, 26)}${handleV(28, 28, 35)}${handleV(36, 28, 35)}`,
  fillerwall: `<path class="ln" d="M32 5 V9"/>${body(25, 9, 14, 32)}${door(27, 12, 10, 26)}`,
  sink: '<rect class="bd" x="6" y="14" width="52" height="36" rx="3"/><rect class="dr" x="11" y="20" width="26" height="24" rx="5"/><path class="ln" d="M42 22 H53 M42 28 H53 M42 34 H53 M42 40 H53"/><circle class="dk" cx="24" cy="32" r="2"/><circle class="dk" cx="24" cy="16.5" r="2"/>',
  hob: '<rect class="bd" x="8" y="12" width="48" height="40" rx="4"/><circle class="dr" cx="22" cy="26" r="7"/><circle class="dr" cx="42" cy="26" r="7"/><circle class="dr" cx="22" cy="42" r="7"/><circle class="dr" cx="42" cy="42" r="7"/><circle class="dk" cx="22" cy="26" r="2"/><circle class="dk" cx="42" cy="26" r="2"/><circle class="dk" cx="22" cy="42" r="2"/><circle class="dk" cx="42" cy="42" r="2"/>',
  oven: `${body(10, 6, 44, 52)}<rect class="dr" x="13" y="9" width="38" height="8" rx="1"/><circle class="dk" cx="20" cy="13" r="1.8"/><circle class="dk" cx="28" cy="13" r="1.8"/><circle class="dk" cx="36" cy="13" r="1.8"/><circle class="dk" cx="44" cy="13" r="1.8"/>${handleH(22, 17, 47)}<rect class="gl" x="16" y="26" width="32" height="26" rx="2"/><rect class="ln" x="16" y="26" width="32" height="26" rx="2" fill="none"/>`,
  fridge: `${body(16, 4, 32, 56)}${door(19, 7, 26, 15)}${door(19, 24, 26, 32)}${handleV(41, 11, 18)}${handleV(41, 30, 44)}`,
  washer: `${body(10, 6, 44, 52)}<rect class="dr" x="13" y="9" width="38" height="8" rx="1"/><circle class="dk" cx="20" cy="13" r="1.8"/><circle class="dk" cx="44" cy="13" r="1.8"/><circle class="dr" cx="32" cy="37" r="14"/><circle class="gl" cx="32" cy="37" r="9"/>`,
  dishwasher: `${body(10, 6, 44, 52)}${door(13, 9, 38, 46)}${handleH(15, 18, 46)}<path class="ln" d="M13 21 H51"/><circle class="dk" cx="22" cy="18" r="1.4"/><circle class="dk" cx="30" cy="18" r="1.4"/><circle class="dk" cx="38" cy="18" r="1.4"/>`,
  radiator: '<rect class="bd" x="7" y="16" width="50" height="32" rx="3"/><path class="ln" d="M15 20 V44 M23 20 V44 M31 20 V44 M39 20 V44 M47 20 V44"/>',
  bath: '<rect class="bd" x="5" y="15" width="54" height="34" rx="14"/><rect class="dr" x="10" y="20" width="44" height="24" rx="10"/><circle class="dk" cx="16" cy="32" r="2.2"/><circle class="dk" cx="9" cy="32" r="1.4" opacity="0"/>',
  shower: '<rect class="bd" x="10" y="10" width="44" height="44" rx="3"/><rect class="dr" x="15" y="15" width="34" height="34" rx="2"/><circle class="dk" cx="32" cy="32" r="3"/><path class="ln lt" d="M15 15 L49 49 M49 15 L15 49"/>',
  wc: '<rect class="bd" x="20" y="6" width="24" height="14" rx="2"/><ellipse class="bd" cx="32" cy="38" rx="13" ry="18"/><ellipse class="dr" cx="32" cy="40" rx="8" ry="12"/>',
  basin: '<rect class="bd" x="7" y="14" width="50" height="36" rx="9"/><ellipse class="dr" cx="32" cy="33" rx="17" ry="11"/><circle class="dk" cx="32" cy="33" r="2"/><circle class="dk" cx="32" cy="19" r="2.2"/>',
};

/** The picture for a tool as an inline SVG string, or '' when it has none (it then keeps its text button). */
export function iconSvg(type) {
  const g = ICONS[type];
  return g ? `<svg class="cat-svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false">${g}</svg>` : '';
}
export const hasIcon = (type) => Boolean(ICONS[type]);

/** A few words under the name: the sizes it comes in, in millimetres. */
export function captionFor(type) {
  const d = ITEMS[type];
  if (!d) return '';
  if (d.menu) return d.hint || '';
  if (d.panel) return '16 / 18 / 22 mm';
  const mm = (cm) => Math.round(cm * 10);
  if (d.sizes?.length) {
    const lo = Math.min(...d.sizes), hi = Math.max(...d.sizes);
    return lo === hi ? `${mm(lo)} mm` : `${mm(lo)}–${mm(hi)} mm`;
  }
  if (d.w && d.h) return `${mm(Math.max(d.w, d.h))} × ${mm(Math.min(d.w, d.h))}`;
  return '';
}

/** A few words under a kind's name in a picker: the widths it comes in (mm), or its choices. */
export function captionForKind(kind) {
  const mm = (cm) => Math.round(cm * 10);
  const list = kind.sizes || [];
  if (list.length === 1) return `${mm(list[0])} mm`;
  if (list.length > 1) return `${mm(Math.min(...list))}–${mm(Math.max(...list))} mm`;
  return '';
}

// ---------- the picture of a unit you are choosing or have selected ----------
// A front view drawn to the unit's real proportions: its width and height, how its doors and drawers are laid out (style
// or door pattern), which end is blind, and the special kinds (Belfast sink base, built-under oven housing, curved,
// hob / microwave / wine rack wall units, appliance towers). Same classes as the tool-button drawings, so it follows
// light and dark mode.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rc = (cls, x, y, w, h, r = 1.5) => `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 0.5).toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="${r}"/>`;
const ln = (x1, y1, x2, y2, cls = 'ln') => `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
const TALLS = ['larder', 'ovenhousing', 'fridgefreezer', 'towercorner'];
const DRAWERS = { drawers2: [0.5, 0.5], drawers: [0.2, 0.4, 0.4], drawers4: [0.25, 0.25, 0.25, 0.25] };

/**
 * unitPicture(type, { width (cm), hgt (cm), style, variant, pattern, hand, door (cm), appliance, thickness (cm), labels })
 * -> an inline SVG string. labels: false leaves out all text (for small cards whose button text must stay the name).
 */
export function unitPicture(type, o = {}) {
  const d = ITEMS[type];
  if (!d) return '';
  const labels = o.labels !== false;
  const uw = Math.max(o.width ?? d.w ?? 60, 3);
  const variant = o.variant || null;
  const isTall = TALLS.includes(type);
  const isWall = d.run === 'wall';
  const pad = 8;

  if (!d.cab && !d.filler && !d.panel) { // appliances and fittings: their catalogue drawing
    const g = ICONS[type];
    return g ? `<svg class="unit-pic-svg" viewBox="0 0 64 64" width="96" height="96" aria-hidden="true">${g}</svg>` : '';
  }

  // real proportions (cm): worktop 4 + carcass + legs 17 for base-level units; towers carcass + feet; wall units carcass only
  const hgt = (o.hgt === undefined ? d.hgt : o.hgt) ?? (variant === 'midi' ? 140 : d.hgt ?? 72);
  const k = isWall ? 1 : isTall ? 0.74 : 1.12;
  const bodyH = hgt * k;
  const legsH = 17 * k;
  const wtH = 4 * k;
  const w = Math.min(Math.max(uw * k * (isWall ? 1.1 : 1), 18), 200);
  const x0 = pad, y0 = pad + (isWall ? 6 : 0);
  const out = [];
  const door = (x, y, ww, hh) => rc('dr', x, y, ww, hh, 1);
  const vh = (x, y) => ln(x, y, x, y + 13); // a door handle
  const hh = (x, y, len = 16) => ln(x - len / 2, y, x + len / 2, y); // a drawer handle
  const blindPanel = (bx, by, bw, bh) => rc('dr', bx, by, bw, bh, 1) + `<path class="ln lt" d="M${(bx + 2).toFixed(1)} ${(by + bh - 3).toFixed(1)} L${(bx + bw - 2).toFixed(1)} ${(by + 4).toFixed(1)} M${(bx + 2).toFixed(1)} ${(by + bh * 0.55).toFixed(1)} L${(bx + bw - 2).toFixed(1)} ${(by + 4).toFixed(1)} M${(bx + bw * 0.45).toFixed(1)} ${(by + bh - 3).toFixed(1)} L${(bx + bw - 2).toFixed(1)} ${(by + bh * 0.45).toFixed(1)}"/>`;
  const doorsAcross = (x, y, ww, hhh, two) => { // one door, or a pair, filling a space
    if (two) {
      const dw = (ww - 2) / 2;
      return door(x, y, dw, hhh) + door(x + dw + 2, y, dw, hhh) + vh(x + dw - 5, y + 6) + vh(x + dw + 7, y + 6);
    }
    return door(x, y, ww, hhh) + vh(x + ww - 7, y + 6);
  };

  if (d.panel && isWall) { // a wall end panel: a board hanging beside a wall unit; a dashed drop shows how far it extends below
    const tcm = o.thickness ?? uw;
    const t = Math.max(tcm * 3, 6);
    const board = (o.hgt ?? d.hgt ?? 72) * 1;
    const drop = (o.ext ?? 0) * 1;
    out.push(ln(x0 + 24, y0 - 6, x0 + 24, y0, 'ln'), rc('dk', x0 + 20, y0, t, board, 1));
    if (drop > 0) out.push(`<rect class="sp" x="${x0 + 20}" y="${(y0 + board).toFixed(1)}" width="${t.toFixed(1)}" height="${drop.toFixed(1)}"/>`);
    const label = labels ? `<text class="pic-t" x="${x0 + 20 + t + 8}" y="${y0 + board / 2}">${Math.round((o.hgt ?? d.hgt ?? 72) * 10)} mm high</text><text class="pic-t" x="${x0 + 20 + t + 8}" y="${y0 + board / 2 + 13}">${Math.round(tcm * 10)} mm thick${drop > 0 ? ', +' + Math.round(drop * 10) + ' below' : ''}</text>` : '';
    return `<svg class="unit-pic-svg" viewBox="0 0 190 ${(y0 + board + drop + 20).toFixed(0)}" width="190" height="${(y0 + board + drop + 20).toFixed(0)}" aria-hidden="true">${out.join('')}${label}</svg>`;
  }
  if (d.panel) {
    const t = Math.max((o.thickness ?? uw) * 1.12 * 3, 6); // thickness exaggerated so it reads
    const target = 104;
    out.push(rc('dk', x0 + 20, y0, t, target + 14, 1));
    out.push(ln(x0 + 20 + t * 0.3, y0 + 8, x0 + 20 + t * 0.3, y0 + target, 'ln lt'), ln(x0 + 20 + t * 0.7, y0 + 12, x0 + 20 + t * 0.7, y0 + target - 4, 'ln lt'));
    const label = labels ? `<text class="pic-t" x="${x0 + 20 + t + 8}" y="${y0 + target / 2}">${Math.round((o.thickness ?? uw) * 10)} mm thick</text>` : '';
    return `<svg class="unit-pic-svg" viewBox="0 0 150 ${target + 30}" width="150" height="${target + 30}" aria-hidden="true">${out.join('')}${label}</svg>`;
  }

  if (d.filler) {
    const bh = 72 * k;
    if (!isWall) out.push(rc('dk', x0 - 2, y0, w + 4, wtH, 1.5));
    const y = isWall ? y0 : y0 + wtH;
    out.push(rc('bd', x0, y, w, bh, 1.5), door(x0 + 2, y + 2, w - 4, bh - 4));
    if (!isWall) out.push(rc('dk', x0 + 2, y + bh, w - 4, legsH, 0));
    return pictureWrap(out, x0, y0, w, isWall ? bh : wtH + bh + legsH, uw, labels);
  }

  if (isWall) {
    // hanging unit: carcass with hooks above, doors, handle low down; variants change the front
    out.push(ln(x0 + w * 0.25, y0 - 6, x0 + w * 0.25, y0, 'ln'), ln(x0 + w * 0.75, y0 - 6, x0 + w * 0.75, y0, 'ln'));
    const ix = x0 + 2, iw = w - 4, iy = y0 + 2, ih = bodyH - 4;
    if (variant === 'hob') { // an extractor housing: a hood shape over a slim door
      out.push(`<path class="bd" d="M${x0} ${y0 + bodyH * 0.3} L${x0 + w * 0.2} ${y0} H${x0 + w * 0.8} L${x0 + w} ${y0 + bodyH * 0.3} V${y0 + bodyH} H${x0} Z"/>`, door(ix, y0 + bodyH * 0.38, iw, bodyH * 0.58), vh(ix + iw - 7, y0 + bodyH * 0.38 + 6));
    } else {
      out.push(rc('bd', x0, y0, w, bodyH, variant === 'curved' ? 8 : 1.5));
      if (d.blind) {
        const doorW = Math.min((o.door ?? uw * 0.6), uw - 10) * k * 1.1;
        const right = (o.hand || 'right') === 'right';
        const dx = right ? ix : ix + iw - doorW;
        out.push(door(dx, iy, doorW, ih), vh(right ? dx + doorW - 6 : dx + 6, y0 + bodyH - 22));
        out.push(blindPanel(right ? ix + doorW + 2 : ix, iy, iw - doorW - 2, ih));
      } else if (variant === 'curved') {
        const bay = iw * 0.65;
        const right = (o.hand || 'left') === 'right';
        const bx = right ? ix + iw - bay : ix;
        const dxx = right ? ix : ix + bay + 2;
        out.push(rc('sp2', bx, iy, bay, ih, 3), ln(bx + 2, iy + ih * 0.5, bx + bay - 2, iy + ih * 0.5, 'ln'), door(dxx, iy, iw - bay - 2, ih, 1), vh(right ? dxx + 6 : dxx + (iw - bay - 2) - 6, y0 + bodyH - 22));
      } else if (variant === 'microwave') { // a glass opening with a door above
        out.push(door(ix, iy, iw, ih * 0.3), `<rect class="gl" x="${(ix + 3).toFixed(1)}" y="${(iy + ih * 0.36).toFixed(1)}" width="${Math.max(iw - 6, 2).toFixed(1)}" height="${(ih * 0.6).toFixed(1)}" rx="2"/>`, `<line class="ln" x1="${(ix + iw * 0.75).toFixed(1)}" y1="${(iy + ih * 0.42).toFixed(1)}" x2="${(ix + iw * 0.75).toFixed(1)}" y2="${(iy + ih * 0.9).toFixed(1)}"/>`);
      } else if (variant === 'wine') { // a lattice rack
        out.push(rc('dr', ix, iy, iw, ih, 1));
        for (let i = 1; i < 4; i++) out.push(ln(ix + (iw * i) / 4, iy + 2, ix + (iw * i) / 4, iy + ih - 2, 'ln lt'), ln(ix + 2, iy + (ih * i) / 4, ix + iw - 2, iy + (ih * i) / 4, 'ln lt'));
      } else if (d.corner || (uw >= 70 && variant !== 'bridging' && variant !== 'curved')) {
        out.push(doorsAcross(ix, iy, iw, ih, true));
      } else {
        out.push(door(ix, iy, iw, ih), vh(ix + iw - 8, y0 + bodyH - 22));
      }
    }
    return pictureWrap(out, x0, y0 - 6, w, bodyH + 6, uw, labels, 6);
  }

  if (type === 'appspace') {
    const hAll = wtH + bodyH + legsH;
    out.push(`<rect class="sp" x="${x0}" y="${y0}" width="${w}" height="${hAll}" rx="2"/>`);
    const iconFor = { 'Oven / cooker': 'oven', Dishwasher: 'dishwasher', 'Washing machine': 'washer', 'Fridge / freezer': 'fridge' }[o.appliance || 'Dishwasher'];
    const g = iconFor && ICONS[iconFor];
    const inner = Math.min(w - 8, hAll - 8);
    if (g) out.push(`<svg x="${x0 + (w - inner) / 2}" y="${y0 + 4}" width="${inner}" height="${inner}" viewBox="0 0 64 64">${g}</svg>`);
    const cap = labels ? `<text class="pic-t" x="${x0 + w / 2}" y="${y0 + hAll + 24}" text-anchor="middle">${esc(o.appliance || 'Appliance space')}</text>` : '';
    return pictureWrap(out, x0, y0, w, hAll, uw, labels, 0, cap);
  }

  // base-level and tall units: worktop (base only), carcass, doors and drawers, legs / plinth
  let y = y0;
  if (!isTall) { out.push(rc('dk', x0 - 3, y0, w + 6, wtH, 1.5)); y = y0 + wtH; }
  const curvedBase = variant === 'curved';
  out.push(rc('bd', x0, y, w, bodyH, curvedBase ? 8 : 1.5));
  const ix = x0 + 2, iw = w - 4, iy = y + 2, ih = bodyH - 4;
  if (isTall && type !== 'towercorner') {
    const [up, low] = String(o.pattern || '50/50').split('/').map(Number);
    if (variant === 'tower' || variant === 'midi') { // appliance tower: openings for two (or one) built-in appliances, a drawer below
      const n = variant === 'midi' ? 1 : 2;
      const dr = ih * 0.16, gap = 3;
      const slot = (ih - dr - gap * n) / n;
      for (let i = 0; i < n; i++) out.push(`<rect class="gl" x="${ix + 2}" y="${(iy + i * (slot + gap)).toFixed(1)}" width="${Math.max(iw - 4, 2)}" height="${slot.toFixed(1)}" rx="2"/>`);
      out.push(door(ix, iy + n * (slot + gap), iw, dr), hh(ix + iw / 2, iy + n * (slot + gap) + 6));
    } else {
      const upperH = ih * (up / ((up + low) || 100));
      out.push(door(ix, iy, iw, upperH - 1), door(ix, iy + upperH + 1, iw, ih - upperH - 1), vh(ix + iw - 7, iy + upperH - 20), vh(ix + iw - 7, iy + upperH + 9));
    }
    const cue = variant === 'tower' ? 'TOWER' : variant === 'midi' ? 'MIDI' : { larder: 'LARDER', ovenhousing: 'OVEN', fridgefreezer: 'FRIDGE' }[type];
    if (labels && cue && variant !== 'tower' && variant !== 'midi') out.push(`<text class="pic-t" x="${x0 + w / 2}" y="${iy + ih * ((String(o.pattern || '50/50').split('/')[0] || 50) / 100) / 2}" text-anchor="middle">${cue}</text>`);
  } else if (type === 'towercorner') { // a tall corner unit: door at one end, blind panel the other
    const doorW = Math.min((o.door ?? uw * 0.6), uw - 10) * k;
    const right = (o.hand || 'right') === 'right';
    const dx = right ? ix : ix + iw - doorW;
    out.push(door(dx, iy, doorW, ih / 2 - 1), door(dx, iy + ih / 2 + 1, doorW, ih / 2 - 1), vh(right ? dx + doorW - 6 : dx + 6, iy + ih / 2 - 18));
    out.push(blindPanel(right ? ix + doorW + 2 : ix, iy, iw - doorW - 2, ih));
  } else if (d.corner) { // corner base: a pair of doors meeting in the corner (a carousel shows its curve)
    const dw = (iw - 2) / 2;
    out.push(door(ix, iy, dw, ih), door(ix + dw + 2, iy, dw, ih), vh(ix + dw - 5, iy + 8), vh(ix + dw + 7, iy + 8));
    if (variant === 'carousel') out.push(`<path class="ln pk" d="M${ix + dw - 8} ${iy + ih - 6} q${dw * 0.5} -${ih * 0.45} ${dw * 0.9} 0"/>`);
    else out.push(`<path class="ln pk" d="M${ix + 4} ${iy + 4} v10 h10"/>`);
  } else if (d.blind) { // a door at one end, the corner post, then the blind panel
    const doorW = Math.min((o.door ?? uw * 0.6), uw - 10) * k;
    const right = (o.hand || 'right') === 'right'; // the blind end is on the right
    const dx = right ? ix : ix + iw - doorW;
    out.push(door(dx, iy, doorW, ih), vh(right ? dx + doorW - 6 : dx + 6, iy + 8));
    out.push(blindPanel(right ? ix + doorW + 2 : ix, iy, iw - doorW - 2, ih));
  } else if (curvedBase) { // an open shelved bay on the curved side (its edge rounded), a door bay on the other
    const bay = iw * 0.65;
    const right = (o.hand || 'left') === 'right';
    const bx = right ? ix + iw - bay : ix;
    const dx = right ? ix : ix + bay + 2;
    out.push(rc('sp2', bx, iy, bay, ih, 3), ln(bx + 2, iy + ih * 0.45, bx + bay - 2, iy + ih * 0.45, 'ln'));
    out.push(door(dx, iy, iw - bay - 2, ih, 1), vh(right ? dx + 6 : dx + (iw - bay - 2) - 6, iy + 8));
    out.push(`<path class="ln pk" d="M${(right ? bx + bay - 2 : bx + 2).toFixed(1)} ${(iy + 2).toFixed(1)} q${right ? 6 : -6} ${(ih * 0.5).toFixed(1)} 0 ${(ih - 4).toFixed(1)}"/>`);
  } else if (variant === 'belfast') { // a deep ceramic sink sitting in the top, one wide door below
    out.push(`<rect class="gl" x="${(x0 + 3).toFixed(1)}" y="${(y0 - 4).toFixed(1)}" width="${Math.max(w - 6, 2).toFixed(1)}" height="${(wtH + 12).toFixed(1)}" rx="4"/>`);
    out.push(doorsAcross(ix, iy + 10, iw, ih - 10, false));
  } else if (variant === 'oven') { // an oven opening over a drawer
    out.push(`<rect class="gl" x="${ix + 2}" y="${iy.toFixed(1)}" width="${Math.max(iw - 4, 2)}" height="${(ih * 0.62).toFixed(1)}" rx="2"/>`);
    out.push(door(ix, iy + ih * 0.66, iw, ih * 0.34), hh(ix + iw / 2, iy + ih * 0.66 + 6));
  } else { // base unit by style: door(s), a drawer line over a door, or 2 / 3 / 4 drawers
    const style = o.style || 'door';
    const two = uw >= 80;
    if (DRAWERS[style]) {
      let yy = iy;
      for (const f of DRAWERS[style]) { const hv = ih * f; out.push(door(ix, yy, iw, hv - 2), hh(ix + iw / 2, yy + 6)); yy += hv; }
    } else if (style === 'drawerline') {
      const dh = ih * 0.2;
      out.push(door(ix, iy, iw, dh - 2), hh(ix + iw / 2, iy + 6), doorsAcross(ix, iy + dh, iw, ih - dh, two));
    } else {
      out.push(doorsAcross(ix, iy, iw, ih, two && !curvedBase));
    }
  }
  out.push(rc('dk', x0 + 2, y + bodyH, w - 4, legsH, 0)); // legs / plinth
  return pictureWrap(out, x0, y0, w, (isTall ? 0 : wtH) + bodyH + legsH, uw, labels);
}

// the frame round a picture: a width dimension line and label underneath
function pictureWrap(parts, x0, y0, w, h, uw, labels, extraTop = 0, caption = '') {
  const pad = 8;
  const dimY = y0 + h + 10;
  const dim = labels ? `${ln(x0, dimY, x0 + w, dimY, 'ln lt')}${ln(x0, dimY - 3, x0, dimY + 3, 'ln lt')}${ln(x0 + w, dimY - 3, x0 + w, dimY + 3, 'ln lt')}<text class="pic-t" x="${x0 + w / 2}" y="${dimY + 12}" text-anchor="middle">${Math.round(uw * 10)} mm</text>` : '';
  const W = w + pad * 2, Hh = y0 + h + (labels ? 38 : 8) + (caption ? 14 : 0);
  return `<svg class="unit-pic-svg" viewBox="0 ${-extraTop} ${W.toFixed(1)} ${(Hh + extraTop).toFixed(1)}" width="${W.toFixed(0)}" height="${(Hh + extraTop).toFixed(0)}" aria-hidden="true">${parts.join('')}${dim}${caption}</svg>`;
}

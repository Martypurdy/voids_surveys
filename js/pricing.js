// Materials & labour costing: line and sheet totals. Pure functions – no DOM.

/** Number from what was typed ("£1,250.50", "12,5" …). Blank / rubbish = 0. */
export function money(v) {
  let s = String(v ?? '').replace(/[£\s]/g, '');
  // "12,5" / "12,50" -> decimal comma; otherwise commas are thousands ("1,250.50").
  s = /^-?\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** £1,234.50 */
export const gbp = (n) => `£${round2(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Line maths. price: materials unit price; rate: labour rate (per item / hour / day). */
export function lineTotals(line) {
  const qty = String(line.qty ?? '').trim() === '' ? 1 : money(line.qty);
  const cost = qty * money(line.price ?? line.rate);
  const m = money(line.markup);
  const markup = line.markupType === '£' ? m : cost * (m / 100);
  return { cost, markup, total: cost + markup };
}

/** A line with nothing typed in it (ignored in totals and the PDF). */
export const isBlankLine = (line) => !['item', 'supplier', 'code', 'qty', 'unit', 'price', 'rate', 'markup', 'url']
  .some((k) => String(line[k] ?? '').trim());

const sum = (lines) => lines.filter((l) => !isBlankLine(l)).map(lineTotals)
  .reduce((a, t) => ({ cost: a.cost + t.cost, markup: a.markup + t.markup, total: a.total + t.total }), { cost: 0, markup: 0, total: 0 });

export const VAT_MODES = [['plus', '+ VAT'], ['inc', 'Inc VAT'], ['none', 'No VAT']];

/**
 * Sheet totals. Prices are typed as the sheet's VAT mode says:
 * 'plus' – before VAT (VAT added on top); 'inc' – already include VAT; 'none' – no VAT.
 */
export function sheetTotals(p) {
  const materials = sum(p.materials);
  const labour = sum(p.labour);
  const delivery = { total: (p.deliveries || []).reduce((a, d) => a + money(d.cost), 0), count: (p.deliveries || []).length };
  const typed = materials.total + labour.total + delivery.total;
  const rate = p.vat === 'none' ? 0 : money(p.vatRate) / 100;
  let net = typed, vat = 0, gross = typed;
  if (p.vat === 'plus') { vat = typed * rate; gross = typed + vat; }
  if (p.vat === 'inc') { net = typed / (1 + rate); vat = typed - net; }
  return { materials, labour, delivery, markup: materials.markup + labour.markup, net, vat, gross, rate: rate * 100 };
}

export const LABOUR_BASIS = [['item', 'Per item'], ['hour', 'Per hour'], ['day', 'Per day']];
/** Units suggested in the Unit box (any text can be typed). */
export const UNIT_SUGGESTIONS = ['each', 'pack', 'box', 'bag', 'roll', 'sheet', 'length', 'm', 'm²', 'm³', 'litre', 'kg', 'tonne', 'pallet', 'pair', 'set'];

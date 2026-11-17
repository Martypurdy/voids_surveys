// Accountancy: pick the date, supplier, total and VAT out of the text read from a receipt. Pure functions, no DOM.
// Till receipts are messy, so every field comes back with how sure we are: 'sure', 'check' (a guess – look at it) or
// 'missing'. The screen highlights anything that is not 'sure'.
import { isoDate } from './hmrc.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

/** Merchants worth recognising by name when they appear anywhere in the text. */
export const COMMON_SUPPLIERS = ['Screwfix', 'Toolstation', 'Wickes', 'B&Q', 'Travis Perkins', 'Selco', 'Jewson', 'Homebase', 'Machine Mart', 'Halfords', 'Wilko',
  'Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Aldi', 'Lidl', 'Co-op', 'Greggs', 'Costa', 'Shell', 'BP', 'Esso', 'Texaco', 'Amazon', 'Argos', 'Currys', 'Dunelm', 'Ikea', 'Plumbase', 'City Plumbing', 'Howdens', 'Buildbase', 'Huws Gray', 'Brewers', 'Dulux', 'Ronseal'];

const valid = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/**
 * The first plausible date in the text (UK order: day first), as yyyy-mm-dd, or ''. A date more than a day ahead or
 * more than six years old is ignored: it is a misread.
 */
export function parseDate(text, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const latest = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  const earliest = new Date(t.getFullYear() - 6, t.getMonth(), t.getDate());
  const ok = (y, m, d) => {
    if (!valid(y, m, d)) return false;
    const dt = new Date(y, m - 1, d);
    return dt <= latest && dt >= earliest;
  };
  const found = [];
  const add = (index, y, m, d) => { if (ok(y, m, d)) found.push({ index, iso: isoDate(y, m, d) }); };
  let m;
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((m = iso.exec(text))) add(m.index, Number(m[1]), Number(m[2]), Number(m[3]));
  const uk = /(?<![\d/.-])(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?![\d])/g;
  while ((m = uk.exec(text))) add(m.index, fullYear(Number(m[3])), Number(m[2]), Number(m[1]));
  const dMonY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH_RE}\\.?,?[\\s-]+(\\d{4}|\\d{2})\\b`, 'gi');
  while ((m = dMonY.exec(text))) add(m.index, fullYear(Number(m[3])), MONTHS[m[2].toLowerCase().slice(0, 4) === 'sept' ? 'sept' : m[2].toLowerCase().slice(0, 3)], Number(m[1]));
  const monDY = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');
  while ((m = monDY.exec(text))) add(m.index, Number(m[3]), MONTHS[m[1].toLowerCase().slice(0, 4) === 'sept' ? 'sept' : m[1].toLowerCase().slice(0, 3)], Number(m[2]));
  found.sort((a, b) => a.index - b.index);
  return found[0]?.iso || '';
}

const MONEY = /(?<![\d.,/-])(?:£|GBP)?\s?(\d{1,3}(?:[ ,]\d{3})+|\d+)\s?[.,]\s?(\d{2})(?![\d])(?![.,/]\d)/g;
/** The money amounts on one line, as numbers: "£1,234.56" -> 1234.56. */
export function amountsOn(line) {
  const out = [];
  let m;
  MONEY.lastIndex = 0;
  while ((m = MONEY.exec(line))) out.push(Number(`${m[1].replace(/[ ,]/g, '')}.${m[2]}`));
  return out;
}

const TOTAL_WORDS = /\b(grand\s*total|total\s*(?:due|payable|to\s*pay|amount|gbp)?|amount\s*(?:due|payable|paid)|balance\s*(?:due|to\s*pay)|to\s*pay|sale\s*total|invoice\s*total)\b/i;
const NOT_TOTAL = /sub\s*-?\s*total|total\s*vat|vat\s*total|net\s*total|total\s*net|total\s*saving|total\s*items|savings?|discount|points|change|cash\s*(?:given|tendered)|tender(?:ed)?|you\s*saved/i;
const PAYMENT_WORDS = /\b(card|visa|mastercard|debit|credit|contactless|chip|paid|payment|amount\s*tendered)\b/i;

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * The total paid: from a line that says total / amount due, else a card payment line, else the largest amount that is
 * not change. Returns { value, how: 'sure' | 'check' | 'missing' }.
 */
export function findTotal(lines) {
  const keyed = [], paid = [], all = [];
  for (const line of lines) {
    const amts = amountsOn(line);
    if (!amts.length) continue;
    if (TOTAL_WORDS.test(line) && !NOT_TOTAL.test(line)) keyed.push(...amts);
    else if (PAYMENT_WORDS.test(line) && !NOT_TOTAL.test(line)) paid.push(...amts);
    if (!NOT_TOTAL.test(line)) all.push(...amts);
  }
  if (keyed.length) return { value: Math.max(...keyed), how: 'sure' };
  if (paid.length) return { value: Math.max(...paid), how: 'check' };
  if (all.length) return { value: Math.max(...all), how: 'check' };
  return { value: null, how: 'missing' };
}

/** The VAT amount: from lines mentioning VAT, preferring the figure that matches 20% or 5% of the total. */
export function findVat(lines, total) {
  const cands = [];
  let zero = false;
  for (const line of lines) {
    if (!/\bvat\b/i.test(line) || /vat\s*(?:no|number|reg|reg\.|registration|#)|gb\s?\d{3}\s?\d{4}\s?\d{2}/i.test(line)) continue;
    const amts = amountsOn(line);
    if (amts.some((a) => a === 0)) zero = true;
    cands.push(...amts.filter((a) => a > 0));
  }
  if (!total) return { value: cands.length ? Math.min(...cands) : null, how: cands.length ? 'check' : 'missing' };
  const limit = total * 0.2; // VAT can never be more than 1/6 of a VAT-inclusive total
  const usable = cands.filter((a) => a < limit);
  if (usable.length) {
    for (const rate of [20, 5]) {
      const expected = round2((total * rate) / (100 + rate));
      const hit = usable.find((a) => Math.abs(a - expected) <= 0.03);
      if (hit != null) return { value: hit, how: 'sure', rate };
    }
    const guess = usable.reduce((b, a) => (Math.abs(a - total / 6) < Math.abs(b - total / 6) ? a : b));
    return { value: guess, how: 'check' };
  }
  if (zero) return { value: 0, how: 'check' };
  return { value: null, how: 'missing' };
}

const SKIP_TOP = /^(receipt|tax\s*invoice|invoice|vat\s*(?:receipt|invoice)|customer\s*copy|merchant\s*copy|duplicate|welcome|thank|please|tel|telephone|phone|www|http|vat|order|table|server|till|store|branch|date|time)\b/i;

/** The shop name: a known supplier mentioned in the text, else the first line that looks like a name. */
export function findSupplier(lines, text, known = []) {
  const lower = text.toLowerCase();
  const byName = [...known, ...COMMON_SUPPLIERS];
  for (const name of byName) {
    const n = name.trim().toLowerCase();
    if (n.length < 2) continue;
    const re = new RegExp(`(?<![a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
    if (re.test(lower)) return { value: name, how: 'sure' };
  }
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/[^A-Za-z0-9&'’.,\- ]/g, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || letters < line.length * 0.5 || SKIP_TOP.test(line) || /\d{5,}/.test(line) || /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i.test(line)) continue;
    const name = line.length > 40 ? line.slice(0, 40).trim() : line;
    return { value: name.replace(/\b([A-Za-z])([A-Za-z']*)/g, (_, a, b) => (b === b.toLowerCase() && a === a.toLowerCase() ? a.toUpperCase() + b : a + b.toLowerCase())), how: 'check' };
  }
  return { value: '', how: 'missing' };
}

/**
 * Read a receipt's text. Returns { date, supplier, total, vat, vatRate, flags } where flags says how sure each is
 * ('sure' | 'check' | 'missing').
 */
export function parseReceiptText(text, { knownSuppliers = [], today = new Date() } = {}) {
  const clean = String(text || '').replace(/\r/g, '');
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const date = parseDate(clean, today);
  const total = findTotal(lines);
  const vat = findVat(lines, total.value);
  const supplier = findSupplier(lines, clean, knownSuppliers);
  return {
    date, supplier: supplier.value, total: total.value, vat: vat.value, vatRate: vat.rate || null,
    flags: { date: date ? 'sure' : 'missing', supplier: supplier.how, total: total.how, vat: vat.how },
  };
}

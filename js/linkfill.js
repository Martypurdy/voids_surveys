// Product link → costing line. The supplier, product code and a readable name come
// from the link itself (works offline and for sites that block look-ups); the
// look-up service (cloudflare/lookup-worker.js) adds the real name, code and price.
import { money } from './pricing.js';

/** The deployed look-up service. Empty = link-only (no prices). Testing: localStorage 'voids.lookupUrl'. */
const LOOKUP_DEFAULT = 'https://propertypad-lookup.propertypad-tools.workers.dev';
export const LOOKUP_URL = (() => { try { return localStorage.getItem('voids.lookupUrl'); } catch { return null; } })() || LOOKUP_DEFAULT;

const SUPPLIERS = {
  'screwfix.com': 'Screwfix', 'toolstation.com': 'Toolstation', 'wickes.co.uk': 'Wickes', 'diy.com': 'B&Q',
  'tradepoint.co.uk': 'TradePoint', 'travisperkins.co.uk': 'Travis Perkins', 'selcobw.com': 'Selco', 'jewson.co.uk': 'Jewson',
  'homebase.co.uk': 'Homebase', 'ccfltd.co.uk': 'CCF', 'buildbase.co.uk': 'Buildbase', 'mkmbs.co.uk': 'MKM', 'mkm.com': 'MKM',
  'huwsgray.co.uk': 'Huws Gray', 'bradfords.co.uk': 'Bradfords', 'cityplumbing.co.uk': 'City Plumbing',
  'plumbcenter.co.uk': 'Plumb Center', 'wolseley.co.uk': 'Wolseley', 'plumbnation.co.uk': 'Plumbnation',
  'victorianplumbing.co.uk': 'Victorian Plumbing', 'howdens.com': 'Howdens', 'toppstiles.co.uk': 'Topps Tiles',
  'cef.co.uk': 'CEF', 'edmundson-electrical.co.uk': 'Edmundson', 'tlc-direct.co.uk': 'TLC Direct', 'rexel.co.uk': 'Rexel',
  'duluxdecoratorcentre.co.uk': 'Dulux Decorator Centre', 'brewers.co.uk': 'Brewers', 'johnstonesdecoratingcentres.co.uk': "Johnstone's",
  'amazon.co.uk': 'Amazon', 'ebay.co.uk': 'eBay', 'argos.co.uk': 'Argos', 'ao.com': 'AO', 'currys.co.uk': 'Currys',
  'ironmongerydirect.co.uk': 'IronmongeryDirect', 'insulationwholesale.co.uk': 'Insulation Wholesale', 'materialsmarket.com': 'Materials Market',
};

/** First web link in some text (shared text is often "Product name https://…"). */
export function findUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  try { return new URL(m[0].replace(/[),.;]+$/, '')).href; } catch { return null; }
}

export function supplierOf(url) {
  const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  const key = Object.keys(SUPPLIERS).find((d) => host === d || host.endsWith('.' + d));
  if (key) return SUPPLIERS[key];
  const name = host.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const tidy = (slug) => {
  const s = decodeURIComponent(slug || '').replace(/\.(html?|prd|aspx?)$/i, '').replace(/[-_+]+/g, ' ')
    .replace(/(\d) (\d)(mm|m|kg|l)\b/gi, '$1.$2$3') // 12-5mm -> 12.5mm
    .replace(/\b(\d{1,2}) 5 x\b/g, '$1.5 x') // 12-5-x-1200 -> 12.5 x 1200
    .replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};

/** What the link itself says: supplier, a readable name and the product code. */
export function fromUrl(url) {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, '');
  let slug = '', code = '';
  let m;
  if ((m = path.match(/\/p\/([^/]+)\/([A-Za-z0-9]+)$/))) [, slug, code] = m; // Screwfix
  else if ((m = path.match(/\/([^/]+)\/p\/([A-Za-z0-9]+)$/))) [, slug, code] = m; // Wickes, Travis Perkins, CCF
  else if ((m = path.match(/\/([^/]+)\/p([A-Z]{0,2}\d+)$/i))) [, slug, code] = m; // Toolstation
  else if ((m = path.match(/\/([^/]+)\/(\d+)_BQ\.prd$/i))) [, slug, code] = m; // B&Q / TradePoint
  else if ((m = path.match(/\/(?:([^/]+)\/)?dp\/([A-Z0-9]{10})/))) [, slug, code] = m; // Amazon
  else {
    slug = path.split('/').pop() || '';
    m = slug.match(/^(.*?)[-_](\d{5,}|[A-Z]{1,4}\d{4,}[A-Z]?)(\.html?)?$/i); // Selco and most others: name-12345
    if (m) [, slug, code] = m;
  }
  return { supplier: supplierOf(url), item: tidy(slug), code };
}

/** A sensible unit from the product name: pack of 10, bag, sheet, roll… (else each). */
export function guessUnit(name) {
  const n = String(name || '');
  // A pack only if the name says so and holds more than one (prices for "Pack of 1" are each).
  const pack = n.match(/\b(?:pack|box|bag|tub) of (\d+)\b|\b(\d+)\s*-?\s*(?:pack|pk|pcs|pieces)\b/i);
  const count = pack ? Number(pack[1] || pack[2]) : 0;
  if (count > 1) return `pack of ${count}`;
  if (/bulk bag|jumbo bag|tonne/i.test(n)) return 'bulk bag';
  if (/\bpallet\b/i.test(n)) return 'pallet';
  if (/\bbag\b|\d{2}\s?kg\b/i.test(n)) return 'bag';
  if (/plasterboard|wallboard|\bboard\b|\bsheet\b|\bosb\b|plywood|\bmdf\b/i.test(n)) return 'sheet';
  if (/\broll\b/i.test(n)) return 'roll';
  if (/\d\s?(l|ltr|litre)s?\b/i.test(n)) return 'tin';
  return 'each';
}

/** The supplier's own "price per …" (e.g. Selco), as a unit. */
function perUnit(per) {
  const p = String(per || '').trim().toLowerCase().replace(/^per\s+/, '');
  if (!p) return '';
  if (/^(each|ea|item|unit|1)$/.test(p)) return 'each';
  return p;
}

/**
 * Everything we can find for a product link.
 * Resolves { url, supplier, item, code, brand, price (number, as on the site), priceIncVat,
 *            unit, looked: true if the page was read, note: why not }.
 */
export async function lookupProduct(url) {
  const base = { url, ...fromUrl(url), brand: '', price: null, priceIncVat: true, looked: false, note: '' };
  if (!LOOKUP_URL) return { ...base, unit: guessUnit(base.item), note: 'nolookup' };
  if (!navigator.onLine) return { ...base, unit: guessUnit(base.item), note: 'offline' };
  try {
    const r = await fetch(`${LOOKUP_URL}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20000) });
    const d = await r.json();
    if (d.error && !d.name) return { ...base, unit: guessUnit(base.item), note: d.blocked ? 'blocked' : d.error };
    const item = d.name || base.item;
    return {
      ...base,
      item,
      code: d.code || base.code,
      brand: d.brand || '',
      price: typeof d.price === 'number' && (!d.currency || d.currency === 'GBP') ? d.price : null,
      priceIncVat: d.priceIncVat !== false,
      unit: perUnit(d.per) || guessUnit(item),
      looked: true,
    };
  } catch {
    return { ...base, unit: guessUnit(base.item), note: 'failed' };
  }
}

/** Shop price → the price to type on this sheet (+ VAT sheets want prices before VAT). */
export function sheetPrice(info, p) {
  if (info.price == null) return null;
  const rate = money(p.vatRate || 20) / 100;
  let v = info.price;
  if (p.vat === 'plus' && info.priceIncVat) v /= 1 + rate;
  if (p.vat !== 'plus' && !info.priceIncVat) v *= 1 + rate;
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Fill a costing line from a look-up (keeps qty and markup). */
export function applyToLine(line, info, p) {
  line.url = info.url;
  if (info.item) line.item = info.item;
  if (info.supplier) line.supplier = info.supplier;
  if (info.code) line.code = info.code;
  if (!String(line.unit || '').trim() && info.unit) line.unit = info.unit;
  const price = sheetPrice(info, p);
  if (price != null) {
    line.price = price;
    line.checked = { price: info.price, incVat: info.priceIncVat, date: new Date().toISOString() };
  }
  return price != null;
}

/** Plain-English reason the price wasn't filled in. */
export function noPriceReason(info) {
  return {
    nolookup: 'Price look-up isn’t switched on yet – type the price.',
    offline: 'No signal – type the price, or tap the line’s 🔗 later to update it.',
    blocked: `${info.supplier} doesn’t let apps read its prices – type the price (tap 🔗 › Open the supplier’s page to see it).`,
    failed: 'Couldn’t check the price just now – type it, or try again later.',
  }[info.note] || 'No price found on that page – type the price.';
}

// A product link shared to the app (Android share sheet) waiting to be added to a costing.
let pendingLink = null;
export const setPendingLink = (url) => { pendingLink = url; };
export const takePendingLink = () => { const u = pendingLink; pendingLink = null; return u; };

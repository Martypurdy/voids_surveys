// PropertyPad product look-up – a Cloudflare Worker (free plan).
// The app sends a supplier's product link; this reads the public product page and returns
// what it finds: name, product code, brand, price (as shown on the site – UK sites show
// prices including VAT) and picture. Browsers can't read other sites directly, which is
// why this small helper is needed. It stores nothing.
//
// Deploy: Cloudflare dashboard › Workers & Pages › Create › Hello World › Edit code ›
// paste this file › Deploy. Or: npx wrangler deploy (see wrangler.toml next to this file).

const APP_ORIGINS = ['https://martypurdy.github.io'];
const isAllowedOrigin = (o) => APP_ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_HTML = 3_000_000;

export default {
  async fetch(request) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': isAllowedOrigin(origin) ? origin : APP_ORIGINS[0],
      'access-control-allow-methods': 'GET, OPTIONS',
      vary: 'origin',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!isAllowedOrigin(origin)) return json({ error: 'Not allowed' }, 403);

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url') || '');
    } catch {
      return json({ error: 'That isn’t a web link' }, 400);
    }
    if (!/^https?:$/.test(target.protocol) || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(target.hostname) || !target.hostname.includes('.')) {
      return json({ error: 'That isn’t a shop web link' }, 400);
    }

    let res;
    try {
      res = await fetch(target.href, {
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-GB,en;q=0.9' },
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
    } catch (e) {
      return json({ error: 'Couldn’t reach the supplier’s website', blocked: true });
    }
    if (!res.ok || res.status === 202) return json({ error: `The supplier’s website wouldn’t share this page (${res.status})`, blocked: true });
    const html = (await res.text()).slice(0, MAX_HTML);
    const product = parseProduct(html, res.url || target.href);
    if (!product.name && product.price == null) return json({ error: 'No product details found on that page', blocked: true, ...product });
    return json(product);
  },
};

// ---------- page parsing ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£' };
function decode(s) {
  return String(s ?? '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const isType = (node, t) => [node?.['@type']].flat().some((x) => String(x).toLowerCase() === t.toLowerCase());

/** Every object in the page's JSON-LD blocks (arrays and @graph flattened). */
function jsonLdNodes(html) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    out.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = m[1].trim().replace(/^<!--|-->$/g, '').replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, '');
    try { walk(JSON.parse(text)); } catch { /* skip broken block */ }
  }
  return out;
}

function priceOf(offers) {
  for (const o of [offers].flat().filter(Boolean)) {
    const v = o.price ?? o.lowPrice ?? o.priceSpecification?.price ?? [o.priceSpecification].flat()[0]?.price;
    const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) return { price: n, currency: o.priceCurrency || o.priceSpecification?.priceCurrency || 'GBP' };
    if (o.offers) {
      const inner = priceOf(o.offers);
      if (inner) return inner;
    }
  }
  return null;
}

function meta(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return '';
}

function parseProduct(html, url) {
  const nodes = jsonLdNodes(html);
  let p = nodes.find((n) => isType(n, 'Product'));
  const group = nodes.find((n) => isType(n, 'ProductGroup'));
  if (!p && group) p = [group.hasVariant].flat().find((v) => v?.url && url.includes(v.url)) || [group.hasVariant].flat()[0] || group;
  const offer = p ? priceOf(p.offers) : null;
  const brand = typeof p?.brand === 'string' ? p.brand : p?.brand?.name || '';
  const image = [p?.image].flat()[0];
  const metaPrice = parseFloat(meta(html, ['product:price:amount', 'og:price:amount', 'price']).replace(/[^\d.]/g, ''));
  const title = decode(html.match(/<title[^>]*>([^<]*)/i)?.[1] || '');
  return {
    name: decode(p?.name) || meta(html, ['og:title']) || title.replace(/\s*[|–-]\s*[^|–-]+$/, ''),
    code: decode(p?.sku || p?.mpn || p?.productID || ''),
    gtin: decode(p?.gtin13 || p?.gtin || p?.gtin12 || p?.gtin8 || ''),
    brand: decode(brand),
    price: offer?.price ?? (Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : null),
    currency: offer?.currency || meta(html, ['product:price:currency', 'og:price:currency']) || 'GBP',
    priceIncVat: true, // UK shop pages (and their product data) show prices including VAT
    image: typeof image === 'string' ? image : image?.url || meta(html, ['og:image']),
    site: meta(html, ['og:site_name']),
    url,
  };
}

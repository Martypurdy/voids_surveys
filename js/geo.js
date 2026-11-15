// Location helpers: device GPS, postcodes.io lookup, Google Maps links.
// The only network calls in the app are here, and only on explicit user action.
import { addressLines } from './model.js';

/** Current position -> { lat, lng, accuracy } (metres). */
export function getPosition({ timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: round(p.coords.latitude),
        lng: round(p.coords.longitude),
        accuracy: Math.round(p.coords.accuracy),
      }),
      (err) => reject(new Error(
        err.code === err.PERMISSION_DENIED ? 'Location permission denied'
          : err.code === err.TIMEOUT ? 'Timed out getting location'
            : 'Could not get location')),
      { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}

const round = (n) => Math.round(n * 1e6) / 1e6;

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export const looksLikePostcode = (s) => UK_POSTCODE.test((s || '').trim());

/** Format "sw1a1aa" -> "SW1A 1AA". */
export function formatPostcode(s) {
  const c = (s || '').replace(/\s+/g, '').toUpperCase();
  return c.length > 3 ? `${c.slice(0, -3)} ${c.slice(-3)}` : c;
}

// ----- Demo addresses (for testing and demonstrations) -----
// Any two letters + "000" + any two letters (e.g. AB000CD, shown as "AB00 0CD") gives a
// random made-up address, with the map pin on a random famous UK landmark. No real
// postcode looks like this ("00" districts don't exist). Works offline; nothing is sent.
const DEMO = /^([A-Z]{2})000([A-Z]{2})$/i;
const DEMO_STREETS = ['Demo Street', 'Sample Road', 'Example Avenue', 'Test Lane', 'Specimen Close', 'Trial Way', 'Mock Crescent', 'Practice Place', 'Pretend Parade', 'Rehearsal Row', 'Placeholder Gardens', 'Dummy Drive', 'Make-Believe Mews', 'Lookalike Lane', 'Prototype Terrace', 'Walkthrough Walk'];
const DEMO_TOWNS = [['Sampleton', 'Demoshire'], ['Testbury', 'Sampleshire'], ['Mockington', 'West Mockland'], ['Demoford', 'Demoshire'], ['Trialhampton', 'Testshire'], ['Specimen-on-Sea', 'East Exampleshire'], ['Exampleby', 'North Trialshire'], ['Pretendwick', 'Mockshire']];
/** Famous UK places for the demo map pin. */
export const DEMO_PINS = [
  ['Buckingham Palace', 51.501364, -0.14189], ['Big Ben', 51.500729, -0.124625], ['Tower of London', 51.508112, -0.075949],
  ['The Shard', 51.504497, -0.0865], ['Wembley Stadium', 51.556021, -0.279519], ['Windsor Castle', 51.483884, -0.604455],
  ['Stonehenge', 51.178882, -1.826215], ['Glastonbury Tor', 51.144417, -2.698681], ['The Roman Baths, Bath', 51.381071, -2.359619],
  ['Clifton Suspension Bridge', 51.454926, -2.627848], ['Cheddar Gorge', 51.2829, -2.7609], ['Durdle Door', 50.621428, -2.276789],
  ['Land’s End', 50.066033, -5.714661], ['St Michael’s Mount', 50.116926, -5.477548], ['The Eden Project', 50.36196, -4.744744],
  ['Brighton Palace Pier', 50.815147, -0.137], ['Alton Towers', 52.9875, -1.8869], ['Old Trafford', 53.463056, -2.291389],
  ['Anfield', 53.430819, -2.960828], ['Blackpool Tower', 53.815906, -3.055352], ['Lake Windermere', 54.3627, -2.9206],
  ['Hadrian’s Wall', 55.013318, -2.330938], ['The Angel of the North', 54.914102, -1.589645], ['Lindisfarne Castle', 55.6693, -1.7848],
  ['Cardiff Castle', 51.482224, -3.181121], ['Yr Wyddfa (Snowdon) summit', 53.068501, -4.076193], ['Edinburgh Castle', 55.948595, -3.199913],
  ['Loch Ness – Urquhart Castle', 57.323953, -4.441876], ['Ben Nevis summit', 56.796891, -5.003675], ['The Old Man of Storr, Skye', 57.5073, -6.1799],
  ['John o’ Groats', 58.643837, -3.069847], ['The Giant’s Causeway', 55.240807, -6.511555],
];
/** Default demo pin (older demo surveys). */
export const DEMO_PIN = { lat: 51.501364, lng: -0.14189, label: 'Buckingham Palace (demo)' };

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** True for a demo postcode (two letters, 000, two letters). */
export const isDemoPostcode = (postcode) => DEMO.test((postcode || '').replace(/\s+/g, ''));

/** A random demo address and landmark for a demo postcode, or null for any other postcode. */
export function demoAddress(postcode) {
  const m = DEMO.exec((postcode || '').replace(/\s+/g, ''));
  if (!m) return null;
  const pc = formatPostcode(`${m[1]}000${m[2]}`);
  const [town, county] = pick(DEMO_TOWNS);
  const [place, lat, lng] = pick(DEMO_PINS);
  const number = 1 + Math.floor(Math.random() * 150);
  return { postcode: pc, text: [`${number} ${pick(DEMO_STREETS)}`, town, county, pc].join('\n'), lat, lng, place, label: `${place} (demo)` };
}

/**
 * Look up a postcode on api.postcodes.io (free, no key).
 * Sends only the postcode. Returns { postcode, lat, lng, district }.
 */
export async function lookupPostcode(postcode) {
  if (!navigator.onLine) throw new Error('You are offline');
  if (!looksLikePostcode(postcode)) throw new Error('That doesn’t look like a UK postcode');
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ''))}`;
  let res;
  try {
    res = await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' });
  } catch {
    throw new Error('Lookup failed – check your connection');
  }
  if (res.status === 404) throw new Error('Postcode not found');
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const { result } = await res.json();
  return {
    postcode: result.postcode,
    lat: result.latitude,
    lng: result.longitude,
    district: result.admin_district || '',
  };
}

/**
 * Best-effort street/town for a coordinate via OpenStreetMap Nominatim (free, no key).
 * Used after a postcode lookup – sends only the postcode's centre point.
 * postcodes.io has no street data, and a UK postcode is usually a single street.
 * Returns { road, locality, town } or null on any failure.
 */
export async function lookupStreet(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&accept-language=en-GB&lat=${lat}&lon=${lng}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    // Nominatim's usage policy asks for an identifying Referer, so send our origin.
    const res = await fetch(url, { signal: ctrl.signal, referrerPolicy: 'strict-origin', credentials: 'omit' });
    if (!res.ok) return null;
    const { address: x } = await res.json();
    if (!x) return null;
    return {
      road: x.road || x.pedestrian || x.residential || '',
      locality: x.suburb || x.neighbourhood || x.hamlet || '',
      town: x.town || x.city || x.village || '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Google Maps directions URL. Prefers the typed address, falls back to coordinates. */
export function directionsUrl(address) {
  // Demo addresses don't exist – navigate to the demo pin instead.
  if (address.demo && address.lat != null) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${address.lat},${address.lng}`)}`;
  const lines = addressLines(address);
  let dest = '';
  if (lines.length) dest = lines.join(', ');
  else if (address.lat != null && address.lng != null) dest = `${address.lat},${address.lng}`;
  if (!dest) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Google Maps pin URL for a coordinate. */
export const pinUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

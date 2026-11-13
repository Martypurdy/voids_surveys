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
  const lines = addressLines(address);
  let dest = '';
  if (lines.length) dest = lines.join(', ');
  else if (address.lat != null && address.lng != null) dest = `${address.lat},${address.lng}`;
  if (!dest) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Google Maps pin URL for a coordinate. */
export const pinUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

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

/** Google Maps directions URL. Prefers the typed address, falls back to coordinates. */
export function directionsUrl(address) {
  const lines = addressLines(address);
  let dest = '';
  if (address.line1?.trim() || address.postcode?.trim()) dest = lines.join(', ');
  else if (address.lat != null && address.lng != null) dest = `${address.lat},${address.lng}`;
  if (!dest) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Google Maps pin URL for a coordinate. */
export const pinUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;

// Key safe details – location, code (shown in plain view), GPS pin, photos.
// Shown under "Fit key safe" on the Property screen.
import { scheduleSave } from '../db.js';
import { h, textField, toast } from '../ui.js';
import { photoField } from '../photos.js';
import { getPosition, pinUrl } from '../geo.js';
/** Key safe details section. */
export function keySafeSection(job) {
  const ks = job.keySafe;
  const save = () => scheduleSave(job);

  const codeField = textField('Key safe code', ks.code, (v) => {
    ks.code = v;
    save();
  }, { autocapitalize: 'characters', spellcheck: 'false', placeholder: 'e.g. 1234' });
  const codeInput = codeField.querySelector('input');
  // Stop password managers offering to save it.
  codeInput.setAttribute('data-lpignore', 'true');
  codeInput.setAttribute('data-1p-ignore', '');

  const pin = h('p', { class: 'coords' });
  const clearBtn = h('button', {
    type: 'button',
    class: 'btn-danger',
    onclick: () => {
      ks.lat = ks.lng = ks.accuracy = null;
      save();
      syncPin();
    },
  }, 'Clear pin');
  const syncPin = () => {
    clearBtn.hidden = ks.lat == null;
    pin.replaceChildren(ks.lat != null
      ? h('span', null, `Pinned at ${ks.lat.toFixed(6)}, ${ks.lng.toFixed(6)}`,
        ks.accuracy != null ? ` (±${ks.accuracy} m) · ` : ' · ',
        h('a', { href: pinUrl(ks.lat, ks.lng), target: '_blank', rel: 'noopener noreferrer' }, 'view map'))
      : 'No GPS pin yet. Stand next to the key safe and tap “Pin my location”.');
  };
  const pinBtn = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      pinBtn.disabled = true;
      pinBtn.textContent = 'Locating…';
      try {
        Object.assign(ks, await getPosition());
        save();
        syncPin();
        if (ks.accuracy > 30) toast(`Accuracy is only ±${ks.accuracy} m – try again outside`);
      } catch (e) {
        toast(e.message);
      } finally {
        pinBtn.disabled = false;
        pinBtn.textContent = 'Pin my location';
      }
    },
  }, 'Pin my location');
  syncPin();

  return h('section', null,
    h('h2', { class: 'section-title' }, 'Key safe details'),
    h('div', null,
      textField('Key safe location', ks.location, (v) => {
        ks.location = v;
        save();
      }, { multiline: true, placeholder: 'e.g. Left of front door, behind downpipe, 1 m high', autocapitalize: 'sentences' }),
      codeField,
      h('span', { class: 'field-label' }, 'GPS pin'),
      pin,
      h('div', { class: 'btn-row' }, pinBtn, clearBtn),
      h('span', { class: 'field-label' }, 'Key safe photos'),
      photoField(job, ks.photos)));
}

// Screen 5: key safe – location, masked code, GPS pin, photos.
// The code is masked on screen and excluded from exports unless the user opts in.
import { scheduleSave } from '../db.js';
import { h, textField, toast } from '../ui.js';
import { photoField } from '../photos.js';
import { getPosition, pinUrl } from '../geo.js';
import { loadJobOr404, jobChrome } from './jobAddress.js';

export default async function keySafe(root, { id }) {
  const job = await loadJobOr404(id);
  const ks = job.keySafe;
  const save = () => scheduleSave(job);

  // Masked with CSS (-webkit-text-security) rather than type=password, so
  // browsers don't offer to save it in the password manager.
  const codeField = textField('Code', ks.code, (v) => {
    ks.code = v;
    save();
  }, { class: 'masked', autocapitalize: 'off', spellcheck: 'false' });
  const codeInput = codeField.querySelector('input');
  codeInput.setAttribute('data-lpignore', 'true');
  codeInput.setAttribute('data-1p-ignore', '');
  const toggle = h('button', {
    type: 'button',
    'aria-pressed': 'false',
    onclick: () => {
      const showing = codeInput.classList.toggle('masked') === false;
      toggle.textContent = showing ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(showing));
    },
  }, 'Show');

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

  root.append(
    ...jobChrome(job, 'keysafe'),
    h('div', { class: 'content' },
      textField('Location', ks.location, (v) => {
        ks.location = v;
        save();
      }, { multiline: true, placeholder: 'e.g. Left of front door, behind downpipe, 1 m high', autocapitalize: 'sentences' }),
      h('div', { class: 'input-row' }, codeField, toggle),
      h('p', { class: 'hint' }, 'The code is hidden on screen and left out of PDF and backup exports unless you tick “Include key safe code” when exporting.'),
      h('h2', null, 'GPS pin'),
      pin,
      h('div', { class: 'btn-row' }, pinBtn, clearBtn),
      h('h2', null, 'Photos'),
      photoField(job, ks.photos)));
}

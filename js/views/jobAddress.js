// Screen 2: job details – address, postcode lookup, GPS, navigate, void ref, surveyor.
import { getJob, scheduleSave, flushSave } from '../db.js';
import { jobTitle, fmtDateTime } from '../model.js';
import { h, pageHeader, jobTabs, textField, toast, icon, ICONS } from '../ui.js';
import { lookupPostcode, formatPostcode, getPosition, directionsUrl, pinUrl } from '../geo.js';
import { LAST_SURVEYOR } from './jobList.js';
import { jobActions } from './jobActions.js';
import { go } from '../router.js';

export async function loadJobOr404(id) {
  const job = await getJob(id);
  if (!job) throw new Error('Job not found on this device');
  return job;
}

/** Header + tabs shared by all job screens. */
export function jobChrome(job, active) {
  return [
    pageHeader(jobTitle(job), {
      back: '#/',
      actions: h('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Export / job actions',
        onclick: async () => {
          await flushSave();
          if (await jobActions(job)) go('/');
        },
      }, icon(ICONS.share)),
    }),
    jobTabs(job.id, active),
  ];
}

export default async function jobAddress(root, { id }) {
  const job = await loadJobOr404(id);
  const a = job.address;
  const save = () => scheduleSave(job);

  const nav = h('a', { class: 'btn btn-primary', target: '_blank', rel: 'noopener noreferrer' }, 'Navigate');
  const coords = h('p', { class: 'coords' });
  const updateDerived = () => {
    const url = directionsUrl(a);
    nav.href = url || '#';
    nav.setAttribute('aria-disabled', String(!url));
    coords.replaceChildren(
      a.lat != null
        ? h('span', null, `Location: ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)} `,
          a.source ? `(${a.source}) · ` : '· ',
          h('a', { href: pinUrl(a.lat, a.lng), target: '_blank', rel: 'noopener noreferrer' }, 'view map'))
        : 'No location set');
    root.querySelector('.appbar h1')?.replaceChildren(jobTitle(job));
  };

  const bind = (key, label, opts) => textField(label, a[key], (v) => {
    a[key] = v;
    save();
    updateDerived();
  }, opts);

  const postcodeField = bind('postcode', 'Postcode', { autocapitalize: 'characters', enterkeyhint: 'search' });
  const postcodeInput = postcodeField.querySelector('input');
  const townInput = { el: null };

  const lookupBtn = h('button', {
    type: 'button',
    onclick: async () => {
      lookupBtn.disabled = true;
      try {
        const r = await lookupPostcode(a.postcode);
        a.postcode = r.postcode;
        postcodeInput.value = r.postcode;
        a.lat = r.lat;
        a.lng = r.lng;
        a.source = 'postcode centre';
        if (!a.town.trim() && r.district) {
          a.town = r.district;
          townInput.el.value = r.district;
        }
        save();
        updateDerived();
        toast('Postcode found');
      } catch (e) {
        toast(e.message);
      } finally {
        lookupBtn.disabled = false;
      }
    },
  }, 'Look up');

  postcodeInput.addEventListener('blur', () => {
    const f = formatPostcode(a.postcode);
    if (f !== a.postcode) {
      a.postcode = f;
      postcodeInput.value = f;
      save();
    }
  });
  postcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookupBtn.click();
  });

  const gpsBtn = h('button', {
    type: 'button',
    onclick: async () => {
      gpsBtn.disabled = true;
      try {
        const p = await getPosition();
        a.lat = p.lat;
        a.lng = p.lng;
        a.source = `GPS ±${p.accuracy} m`;
        save();
        updateDerived();
      } catch (e) {
        toast(e.message);
      } finally {
        gpsBtn.disabled = false;
      }
    },
  }, 'Use my location');

  const townField = bind('town', 'Town / city', { autocapitalize: 'words' });
  townInput.el = townField.querySelector('input');

  root.append(
    ...jobChrome(job, ''),
    h('div', { class: 'content' },
      h('h2', null, 'Address'),
      bind('line1', 'Address line 1', { autocapitalize: 'words', autocomplete: 'off' }),
      bind('line2', 'Address line 2', { autocapitalize: 'words' }),
      townField,
      h('div', { class: 'input-row' }, postcodeField, lookupBtn),
      h('p', { class: 'hint' }, 'Look up sends only the postcode to postcodes.io to find the town and map location.'),
      coords,
      h('div', { class: 'btn-row' }, nav, gpsBtn),

      h('h2', null, 'Job'),
      textField('Void reference', job.voidRef, (v) => {
        job.voidRef = v;
        save();
        updateDerived();
      }, { autocapitalize: 'characters' }),
      textField('Surveyor', job.surveyor, (v) => {
        job.surveyor = v;
        try { localStorage.setItem(LAST_SURVEYOR, v); } catch { /* ignore */ }
        save();
      }, { autocapitalize: 'words' }),
      h('p', { class: 'hint' }, `Created ${fmtDateTime(job.created)}`)));

  updateDerived();
}

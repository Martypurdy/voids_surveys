// Screen: address – postcode lookup, address, GPS, navigate, surveyor.
import { scheduleSave } from '../db.js';
import { jobTitle, fmtDateTime, isPrice } from '../model.js';
import { h, textField, toast, confirmDialog } from '../ui.js';
import { lookupPostcode, lookupStreet, formatPostcode, getPosition, directionsUrl, pinUrl, demoAddress, DEMO_PIN } from '../geo.js';
import { surveyorField } from '../surveyors.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

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
          h('a', { href: pinUrl(a.lat, a.lng), target: '_blank', rel: 'noopener noreferrer' }, 'View on Google Maps'))
        : 'No map location yet – look up the postcode or use your location.');
    root.querySelector('.appbar h1')?.replaceChildren(jobTitle(job));
  };

  // ----- Postcode + Look up (top of the form) -----
  const postcodeField = textField('Postcode', a.postcode, (v) => {
    a.postcode = v;
    if (a.demo && !demoAddress(v)) delete a.demo; // a real postcode – navigate by address again
    save();
    updateDerived();
  }, { autocapitalize: 'characters', enterkeyhint: 'search', placeholder: 'e.g. LS1 1UR' });
  const postcodeInput = postcodeField.querySelector('input');

  // ----- Address: one editable box -----
  const addressField = textField('Address', a.text, (v) => {
    a.text = v;
    save();
    updateDerived();
  }, { multiline: true, autocapitalize: 'words', placeholder: 'House number and street\nTown\nPostcode' });
  const addressBox = addressField.querySelector('textarea');
  addressBox.rows = 4;

  const lookupBtn = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      // Demo postcode (BS000 + two letters): made-up address, pin on Buckingham Palace.
      const demo = demoAddress(a.postcode);
      if (demo) {
        if (a.text.trim() && a.text.trim() !== demo.text && !(await confirmDialog(
          `Replace the address in the box with the demo address “${demo.text.split('\n').join(', ')}”?`,
          { title: 'Replace address?', ok: 'Replace', danger: false }))) return;
        Object.assign(a, { postcode: demo.postcode, text: demo.text, lat: demo.lat, lng: demo.lng, source: DEMO_PIN.label, demo: true });
        postcodeInput.value = demo.postcode;
        addressBox.value = demo.text;
        save();
        updateDerived();
        toast('Demo address loaded');
        return;
      }
      lookupBtn.disabled = true;
      lookupBtn.textContent = 'Looking up…';
      try {
        const r = await lookupPostcode(a.postcode);
        delete a.demo;
        a.postcode = r.postcode;
        postcodeInput.value = r.postcode;
        a.lat = r.lat;
        a.lng = r.lng;
        a.source = 'postcode';
        save();
        updateDerived();

        const street = await lookupStreet(r.lat, r.lng); // best effort, may be null
        const town = street?.town || r.district;
        const lines = [
          street?.locality && street.locality !== town ? street.locality : '',
          town,
          r.postcode,
        ].filter(Boolean);
        // First line is always "house number + street": leave it blank if no street was found.
        const firstLine = street?.road || '';
        const found = [firstLine, ...lines].join('\n');
        if (firstLine) lines.unshift(firstLine);

        const current = a.text.trim();
        if (current && current !== found) {
          const replace = await confirmDialog(`Replace the address in the box with “${lines.join(', ')}”?`, {
            title: 'Replace address?', ok: 'Replace', danger: false,
          });
          if (!replace) return;
        }
        a.text = found;
        addressBox.value = found;
        save();
        updateDerived();
        // Put the cursor at the very start, ready for the house number.
        addressBox.focus();
        addressBox.setSelectionRange(0, 0);
        toast(street?.road ? 'Address found – add the house number at the start' : 'Postcode found – add the house number and street');
      } catch (e) {
        toast(e.message);
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.textContent = 'Look up';
      }
    },
  }, 'Look up');

  postcodeInput.addEventListener('blur', () => {
    const f = formatPostcode(a.postcode);
    if (f !== a.postcode) {
      a.postcode = f;
      postcodeInput.value = f;
      save();
      updateDerived();
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

  // Materials & labour costing: customer and job reference at the top.
  const refBox = isPrice(job)
    ? h('div', { class: 'card card-body ref-box' },
      textField('Customer', job.pricing.customer, (v) => { job.pricing.customer = v; save(); updateDerived(); }, { autocapitalize: 'words', placeholder: 'Customer or client name' }),
      textField('Job reference', job.pricing.ref, (v) => { job.pricing.ref = v; save(); updateDerived(); }, { autocapitalize: 'characters', placeholder: 'e.g. Job number or order ref' }))
    : null;

  root.append(
    ...jobChrome(job, 'address'),
    h('div', { class: 'content' },
      refBox ? [h('h2', null, 'Customer / job reference'), refBox] : null,
      h('h2', null, 'Address'),
      h('div', { class: 'input-row' }, postcodeField, lookupBtn),
      h('p', { class: 'hint' }, 'Look up finds the street and town for the postcode. Check it and add the house number – you can edit the address freely.'),
      addressField,
      coords,
      h('div', { class: 'btn-row' }, nav, gpsBtn),

      h('div', { style: 'margin-top:20px' }, surveyorField(job, save)),
      h('p', { class: 'hint' }, `${isPrice(job) ? 'Costing' : 'Survey'} created ${fmtDateTime(job.created)}`),
      completeFooter(job, 'address')));

  updateDerived();
}

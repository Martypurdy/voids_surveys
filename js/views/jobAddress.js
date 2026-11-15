// Screen: address – postcode lookup, address, GPS, navigate, surveyor.
import { scheduleSave } from '../db.js';
import { jobTitle, fmtDateTime, isPrice, isPlan } from '../model.js';
import { h, textField, toast, confirmDialog } from '../ui.js';
import { lookupPostcode, lookupStreet, formatPostcode, getPosition, directionsUrl, pinUrl, demoAddress, isDemoPostcode } from '../geo.js';
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
    if (a.demo && !isDemoPostcode(v)) delete a.demo; // a real postcode – navigate by address again
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
      // Demo postcode (two letters + 000 + two letters): random made-up address, pin on a
      // random famous UK landmark.
      const demo = demoAddress(a.postcode);
      if (demo) {
        if (a.text.trim() && !a.demo && !(await confirmDialog(
          `Replace the address in the box with the demo address “${demo.text.split('\n').join(', ')}”?`,
          { title: 'Replace address?', ok: 'Replace', danger: false }))) return;
        Object.assign(a, { postcode: demo.postcode, text: demo.text, lat: demo.lat, lng: demo.lng, source: demo.label, demo: true });
        postcodeInput.value = demo.postcode;
        addressBox.value = demo.text;
        save();
        updateDerived();
        toast(`📍 Demo address – your pin has dropped on ${demo.place}!`, { timeout: 6000 });
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

  // Materials & labour costing: customer (with their own address – they may not live at
  // the project address) and job reference at the top.
  const refBox = isPrice(job) ? customerBox(job, save, updateDerived) : null;

  root.append(
    ...jobChrome(job, 'address'),
    h('div', { class: 'content' },
      refBox ? [h('h2', null, 'Customer / job reference'), refBox] : null,
      h('h2', null, isPrice(job) ? 'Project address' : 'Address'),
      h('div', { class: 'input-row' }, postcodeField, lookupBtn),
      h('p', { class: 'hint' }, 'Look up finds the street and town for the postcode. Check it and add the house number – you can edit the address freely.'),
      addressField,
      coords,
      h('div', { class: 'btn-row' }, nav, gpsBtn),

      h('div', { style: 'margin-top:20px' }, surveyorField(job, save)),
      h('p', { class: 'hint' }, `${isPrice(job) ? 'Costing' : isPlan(job) ? 'Plan' : 'Survey'} created ${fmtDateTime(job.created)}`),
      completeFooter(job, 'address')));

  updateDerived();
}

/** Street, town and postcode for a postcode (first line left blank if no street was found). */
async function addressForPostcode(postcode) {
  const demo = demoAddress(postcode);
  if (demo) return { postcode: demo.postcode, text: demo.text, street: true };
  const r = await lookupPostcode(postcode);
  const street = await lookupStreet(r.lat, r.lng); // best effort, may be null
  const town = street?.town || r.district;
  const rest = [street?.locality && street.locality !== town ? street.locality : '', town, r.postcode].filter(Boolean);
  return { postcode: r.postcode, text: [street?.road || '', ...rest].join('\n'), street: Boolean(street?.road) };
}

/** Costing: customer name, the customer's own address (postcode look-up) and job reference. */
function customerBox(job, save, onChange) {
  const p = job.pricing;
  const ca = p.customerAddress;
  const pcField = textField('Customer postcode', ca.postcode, (v) => { ca.postcode = v; save(); }, { autocapitalize: 'characters', enterkeyhint: 'search', placeholder: 'e.g. LS1 1UR' });
  const pcInput = pcField.querySelector('input');
  const addrField = textField('Customer address', ca.text, (v) => { ca.text = v; save(); }, { multiline: true, autocapitalize: 'words', placeholder: 'House number and street\nTown\nPostcode' });
  const addrBox = addrField.querySelector('textarea');
  addrBox.rows = 4;
  const setAddress = (postcode, text) => {
    ca.postcode = postcode;
    ca.text = text;
    pcInput.value = postcode;
    addrBox.value = text;
    save();
  };
  const lookBtn = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      if (!ca.postcode.trim()) return toast('Type the customer’s postcode first');
      lookBtn.disabled = true;
      lookBtn.textContent = 'Looking up…';
      try {
        const found = await addressForPostcode(ca.postcode);
        const current = ca.text.trim();
        if (current && current !== found.text && !(await confirmDialog(`Replace the customer address with “${found.text.split('\n').filter(Boolean).join(', ')}”?`, { title: 'Replace address?', ok: 'Replace', danger: false }))) return;
        setAddress(found.postcode, found.text);
        addrBox.focus();
        addrBox.setSelectionRange(0, 0);
        toast(found.street ? 'Address found – add the house number at the start' : 'Postcode found – add the house number and street');
      } catch (e) {
        toast(e.message);
      } finally {
        lookBtn.disabled = false;
        lookBtn.textContent = 'Look up';
      }
    },
  }, 'Look up');
  pcInput.addEventListener('blur', () => {
    const f = formatPostcode(ca.postcode);
    if (f !== ca.postcode) { ca.postcode = f; pcInput.value = f; save(); }
  });
  pcInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookBtn.click(); });
  const sameBtn = h('button', {
    type: 'button',
    class: 'btn-small',
    onclick: async () => {
      const a = job.address;
      if (!a.text.trim() && !a.postcode.trim()) return toast('Fill in the project address below first');
      if (ca.text.trim() && ca.text.trim() !== a.text.trim() && !(await confirmDialog('Replace the customer address with the project address?', { title: 'Replace address?', ok: 'Replace', danger: false }))) return;
      setAddress(a.postcode, a.text);
      toast('Customer address set to the project address');
    },
  }, 'Same as project address');
  return h('div', { class: 'card card-body ref-box' },
    textField('Customer', p.customer, (v) => { p.customer = v; save(); onChange(); }, { autocapitalize: 'words', placeholder: 'Customer or client name' }),
    h('div', { class: 'input-row' }, pcField, lookBtn),
    addrField,
    h('div', { class: 'btn-row' }, sameBtn),
    textField('Job reference', p.ref, (v) => { p.ref = v; save(); onChange(); }, { autocapitalize: 'characters', placeholder: 'e.g. Job number or order ref' }));
}

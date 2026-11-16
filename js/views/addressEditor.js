// Address box with postcode look-up, used to add a property and to edit one.
import { h, textField, choose, toast, confirmDialog } from '../ui.js';
import { lookupPostcode, lookupStreet, formatPostcode, demoAddress } from '../geo.js';
import { findProperty, saveProperty, requestPersist } from '../db.js';
import { newProperty } from '../properties.js';

/** Fields for an address object `a` (edited in place): postcode, Look up, and the address box. */
export function addressEditor(a) {
  const postcodeField = textField('Postcode', a.postcode, (v) => { a.postcode = v; delete a.demo; }, { autocapitalize: 'characters', enterkeyhint: 'search', placeholder: 'e.g. LS1 1UR' });
  const postcodeInput = postcodeField.querySelector('input');
  const addressField = textField('Address', a.text, (v) => { a.text = v; }, { multiline: true, autocapitalize: 'words', placeholder: 'House number and street\nTown\nPostcode' });
  const box = addressField.querySelector('textarea');
  box.rows = 4;

  const lookupBtn = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      const demo = demoAddress(a.postcode); // two letters + 000 + two letters: a made-up address for demos
      if (demo) {
        Object.assign(a, { postcode: demo.postcode, text: demo.text, lat: demo.lat, lng: demo.lng, source: demo.label, demo: true });
        postcodeInput.value = demo.postcode;
        box.value = demo.text;
        toast(`📍 Demo address – ${demo.place}`);
        return;
      }
      lookupBtn.disabled = true;
      lookupBtn.textContent = 'Looking up…';
      try {
        const r = await lookupPostcode(a.postcode);
        delete a.demo;
        Object.assign(a, { postcode: r.postcode, lat: r.lat, lng: r.lng, source: 'postcode' });
        postcodeInput.value = r.postcode;
        const street = await lookupStreet(r.lat, r.lng); // best effort, may be null
        const town = street?.town || r.district;
        const lines = [street?.locality && street.locality !== town ? street.locality : '', town, r.postcode].filter(Boolean);
        const first = street?.road || ''; // first line is always "house number + street": blank if no street was found
        const found = [first, ...lines].join('\n');
        if (a.text.trim() && a.text.trim() !== found && !(await confirmDialog(`Replace the address in the box with “${[first, ...lines].filter(Boolean).join(', ')}”?`, { title: 'Replace address?', ok: 'Replace', danger: false }))) return;
        a.text = found;
        box.value = found;
        box.focus();
        box.setSelectionRange(0, 0);
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
    if (f !== a.postcode) { a.postcode = f; postcodeInput.value = f; }
  });
  postcodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupBtn.click(); });

  return h('div', null,
    h('div', { class: 'input-row' }, postcodeField, lookupBtn),
    h('p', { class: 'hint' }, 'Look up finds the street and town for the postcode. Check it and add the house number – you can edit the address freely.'),
    addressField);
}

/** Dialog to add a property. Resolves with the new (or already existing) property, or null. */
export async function addPropertyDialog() {
  const a = { postcode: '', text: '', lat: null, lng: null };
  let ref = '';
  for (;;) {
    const v = await choose({
      title: 'Add property',
      content: h('div', null, addressEditor(a), textField('Reference (optional)', ref, (t) => { ref = t; })),
      buttons: [{ label: 'Add property', value: 'add', class: 'btn-primary btn-big' }, { label: 'Cancel', value: null }],
    });
    if (v !== 'add') return null;
    if (!a.text.trim() && !a.postcode.trim()) { toast('Enter a postcode or an address first'); continue; }
    const existing = await findProperty(a);
    if (existing) {
      toast('That property is already here – opening it');
      return existing;
    }
    const p = newProperty(a);
    p.ref = ref.trim();
    await saveProperty(p);
    requestPersist();
    return p;
  }
}

/** Dialog to edit a property's address and reference (saved on OK). Resolves true if changed. */
export async function editPropertyDialog(p) {
  const a = structuredClone(p.address);
  let ref = p.ref || '';
  const v = await choose({
    title: 'Edit property',
    content: h('div', null, addressEditor(a), textField('Reference (optional)', ref, (t) => { ref = t; })),
    buttons: [{ label: 'Save', value: 'save', class: 'btn-primary btn-big' }, { label: 'Cancel', value: null }],
  });
  if (v !== 'save') return false;
  p.address = a;
  p.ref = ref.trim();
  await saveProperty(p);
  return true;
}

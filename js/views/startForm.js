// Starting a new entry (inspection, costing, plan…) inside a property.
import { saveJob, saveProperty, getProperty, requestPersist } from '../db.js';
import { newJob, isPlan } from '../model.js';
import { newProperty } from '../properties.js';
import { h, choose } from '../ui.js';
import { go } from '../router.js';
import { getLastSurveyor } from '../surveyors.js';

/**
 * Buttons offered when starting an entry. A group opens a pop-up of its forms (form = the job's form key);
 * forms without one show what's planned.
 */
export const GROUPS = [
  {
    key: 'voids', emoji: '🏠', title: 'Empty home inspections', text: 'Empty home inspection and Ready to let forms.',
    forms: [
      { form: 'void', emoji: '🏠', title: 'Empty home inspection', text: 'Rooms, defects, security, services, materials and a PDF report.' },
      { form: 'rtl', emoji: '🔑', title: 'Ready to let', text: 'Works complete check, keys, services, gifted items and sign off.' },
    ],
  },
  {
    key: 'pricing', emoji: '💷', title: 'Pricing', text: 'Materials & labour calculator. Quotes and invoices coming soon.',
    forms: [
      { form: 'price', emoji: '🧮', title: 'Materials & labour', text: 'Cost materials and labour line by line – markup, VAT and running totals.' },
      { emoji: '📝', title: 'Quote', text: 'Turn a costing into a quote for the customer.' },
      { emoji: '🧾', title: 'Invoice', text: 'Turn a quote into an invoice.' },
    ],
  },
  {
    key: 'designer', emoji: '📐', title: 'Designer', text: 'Kitchen, bathroom and whole property floor plans.',
    forms: [
      { form: 'plan:kitchen', emoji: '🍳', title: 'Kitchen plan', text: 'Room size, doors, windows, units, sink, hob and appliances.' },
      { form: 'plan:bathroom', emoji: '🛁', title: 'Bathroom plan', text: 'Room size, doors, windows, bath, shower, WC and basin.' },
      { form: 'plan:property', emoji: '🏠', title: 'Whole property plan', text: 'Every room and floor with measurements, doors, windows, fuse board and water main.' },
    ],
  },
  { key: 'safety', emoji: '🦺', title: 'Health and safety', text: 'Risk assessments, method statements (RAMS) and CDM paperwork.' },
  { key: 'calcs', emoji: '🔢', title: 'Calculators', text: 'Concrete, bricks, flooring, tiles, paint, screws and more – with a materials list.' },
  {
    key: 'inspect', emoji: '📋', title: 'Property inspection', text: 'Repair surveys, and tenancy, estate and compliance inspections.',
    forms: [
      { form: 'repair', emoji: '🛠️', title: 'Property repair survey', text: 'Condition, causation and recommended repairs, with photos and a materials list.' },
    ],
  },
];

/** Card contents: emoji, title (+ Coming soon), description, and + or ›. */
export const cardInner = (f, ready, go = '+') => [
  h('span', { class: 'form-emoji', 'aria-hidden': 'true' }, f.emoji),
  h('span', { class: 'form-text' },
    h('span', { class: 'form-title' }, f.title, ready ? null : h('span', { class: 'soon-pill' }, 'Coming soon')),
    h('span', { class: 'form-desc' }, f.text)),
  ready ? h('span', { class: 'form-go', 'aria-hidden': 'true' }, go) : null];

/** Where an entry opens: plans start on Room dimensions, everything else on its Address tab. */
export const entryPath = (job) => (isPlan(job) ? `/job/${job.id}/dimensions` : `/job/${job.id}`);

/**
 * Create an entry (choice is a form key, e.g. 'void' or 'plan:kitchen') in a property. With no property it
 * goes in a new one with no address yet, which can be filled in or merged later. Returns the new job.
 */
export async function createEntry(choice, propertyId) {
  const [form, planKind] = choice.split(':');
  let p = propertyId ? await getProperty(propertyId) : null;
  if (!p) {
    p = newProperty();
    await saveProperty(p);
  }
  const job = newJob({ surveyor: getLastSurveyor(), form, planKind });
  job.propertyId = p.id;
  job.address = structuredClone(p.address);
  await saveJob(job);
  requestPersist(); // ask the browser to keep our data (helps against eviction, esp. on iOS)
  return job;
}

/** Pop-up listing a group's forms; tapping one starts it in this property. */
export async function pickForm(g, propertyId) {
  const form = await choose({
    title: `${g.emoji} ${g.title}`,
    message: 'Choose a form to start.',
    buttons: [
      ...g.forms.map((f) => (f.form
        ? { label: cardInner(f, true), value: f.form, class: 'form-card form-card-ready' }
        : { label: cardInner(f, false), value: '__soon', class: 'form-card form-card-soon' })),
      { label: 'Cancel', value: null },
    ],
  });
  if (form === '__soon') return pickForm(g, propertyId);
  if (form) go(entryPath(await createEntry(form, propertyId)));
}

/** One button's worth: choose a kind of form (inspection, pricing, designer…), then the form. */
export async function pickGroup(propertyId) {
  const key = await choose({
    title: 'Start something new',
    buttons: [
      ...GROUPS.map((g) => ({ label: cardInner(g, Boolean(g.forms), '›'), value: g.key, class: g.forms ? 'form-card form-card-ready' : 'form-card form-card-soon' })),
      { label: 'Cancel', value: null },
    ],
  });
  const g = GROUPS.find((x) => x.key === key);
  if (!g) return;
  if (!g.forms) return pickGroup(propertyId);
  return pickForm(g, propertyId);
}

/** The grid of start buttons for one property. */
export function formGrid(propertyId) {
  return h('div', { class: 'form-grid' }, GROUPS.map((g) => h(g.forms ? 'button' : 'div', {
    type: g.forms ? 'button' : null,
    class: `form-card${g.forms ? ' form-card-ready form-card-group' : ''}`,
    dataset: { group: g.key },
    onclick: g.forms ? () => pickForm(g, propertyId) : null,
    'aria-disabled': g.forms ? null : 'true',
  }, cardInner(g, Boolean(g.forms), '›'))));
}

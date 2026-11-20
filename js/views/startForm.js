// Starting a new entry (inspection, costing, plan…) inside a property.
import { saveJob, saveProperty, getProperty, requestPersist } from '../db.js';
import { newJob, isPlan, isCalc } from '../model.js';
import { CALCS } from '../calc/calculators.js';
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
    key: 'pricing', emoji: '💷', title: 'Pricing', text: 'Materials & labour costings, quotes and invoices.',
    forms: [
      { form: 'price', emoji: '🧮', title: 'Materials & labour', text: 'Cost materials and labour line by line – markup, VAT and running totals.' },
      { form: 'quote', emoji: '📝', title: 'Quote', text: 'A quote for the customer, from scratch or from a costing.' },
      { form: 'invoice', emoji: '🧾', title: 'Invoice', text: 'An invoice for the customer, from scratch or from a quote.' },
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
  { key: 'accounts', emoji: '📒', title: 'Accountancy', text: 'Receipts read on your phone, VAT and spending by tax year.', href: '#/accounts' },
  {
    key: 'safety', emoji: '🦺', title: 'Health and safety', text: 'Risk assessments, method statements (RAMS) and CDM paperwork.',
    forms: [
      { form: 'rams', emoji: '🦺', title: 'RAMS pack', text: 'Construction phase plan, risk assessments, method statements and a briefing record for one job.' },
    ],
  },
  {
    key: 'calcs', emoji: '🔢', title: 'Calculators', text: 'Concrete, bricks, flooring, tiles, paint, screws and more – with a materials list.',
    forms: CALCS.map((c) => ({ form: `calc:${c.key}`, emoji: c.emoji, title: c.title, text: c.text })),
  },
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
export const entryPath = (job) => (job.form === 'quote' || job.form === 'invoice' ? `/job/${job.id}/items` : isPlan(job) ? `/job/${job.id}/dimensions` : isCalc(job) ? `/job/${job.id}/calculate` : `/job/${job.id}`);

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
  if (form === 'quote' || form === 'invoice') await (await import('../docs/create.js')).initDoc(job); // company, number and dates
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
      ...GROUPS.map((g) => ({ label: cardInner(g, Boolean(g.forms || g.href), '›'), value: g.key, class: g.forms || g.href ? 'form-card form-card-ready' : 'form-card form-card-soon' })),
      { label: 'Cancel', value: null },
    ],
  });
  const g = GROUPS.find((x) => x.key === key);
  if (!g) return;
  if (g.href) return go(g.href.slice(1));
  if (!g.forms) return pickGroup(propertyId);
  return pickForm(g, propertyId);
}

const ORDER_KEY = 'voids.homeOrder';
const readOrder = () => { try { const v = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeOrder = (v) => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** GROUPS in this device's saved order. New buttons added later go at the end. */
export function orderedGroups() {
  const saved = readOrder();
  const rank = (g) => { const i = saved.indexOf(g.key); return i < 0 ? saved.length + GROUPS.indexOf(g) : i; };
  return [...GROUPS].sort((a, b) => rank(a) - rank(b));
}

/** The grid of start buttons for one property, with a Reorder mode (up / down arrows, saved on this device). */
export function formGrid(propertyId) {
  let editing = false;
  const wrap = h('div', { class: 'form-grid-wrap' });

  const move = (key, dir) => {
    const keys = orderedGroups().map((g) => g.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    writeOrder(keys);
    draw(key, dir);
  };

  const card = (g) => (g.href
    ? h('a', { class: 'form-card form-card-ready form-card-group', href: g.href, dataset: { group: g.key } }, cardInner(g, true, '›'))
    : h(g.forms ? 'button' : 'div', {
      type: g.forms ? 'button' : null,
      class: `form-card${g.forms ? ' form-card-ready form-card-group' : ''}`,
      dataset: { group: g.key },
      onclick: g.forms ? () => pickForm(g, propertyId) : null,
      'aria-disabled': g.forms ? null : 'true',
    }, cardInner(g, Boolean(g.forms), '›')));

  const sortCard = (g, i, n) => h('div', { class: 'form-card form-card-ready form-card-sort', dataset: { group: g.key } },
    h('span', { class: 'form-emoji', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'form-text' }, h('span', { class: 'form-title' }, g.title)),
    h('span', { class: 'sort-btns' },
      h('button', { type: 'button', class: 'sort-btn', dataset: { dir: 'up' }, 'aria-label': `Move ${g.title} up`, disabled: i === 0, onclick: () => move(g.key, -1) }, '▲'),
      h('button', { type: 'button', class: 'sort-btn', dataset: { dir: 'down' }, 'aria-label': `Move ${g.title} down`, disabled: i === n - 1, onclick: () => move(g.key, 1) }, '▼')));

  function draw(focusKey, dir) {
    const groups = orderedGroups();
    wrap.replaceChildren(...[
      h('div', { class: 'form-grid-bar' },
        editing ? h('span', { class: 'form-grid-hint' }, 'Use the arrows to put the buttons in your order.') : null,
        h('button', { type: 'button', class: editing ? 'btn-primary' : 'btn-quiet', onclick: () => { editing = !editing; draw(); } }, editing ? '✓ Done' : '↕ Reorder')),
      h('div', { class: 'form-grid' }, groups.map((g, i) => (editing ? sortCard(g, i, groups.length) : card(g)))),
    ].filter(Boolean));
    if (editing && focusKey) {
      const row = wrap.querySelector(`[data-group="${focusKey}"]`);
      const btn = row && (row.querySelector(`.sort-btn[data-dir="${dir < 0 ? 'up' : 'down'}"]:not([disabled])`) || row.querySelector('.sort-btn:not([disabled])'));
      if (btn) btn.focus({ preventScroll: true });
    }
  }
  draw();
  return wrap;
}

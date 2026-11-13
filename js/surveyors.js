// Saved surveyor names (per browser/device) and the surveyor picker widget.
// The last surveyor used is filled in automatically on new jobs.
import { h, choose, confirmDialog, toast } from './ui.js';

const LIST_KEY = 'voids.surveyors';
const LAST_KEY = 'voids.lastSurveyor';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

export function getSurveyors() {
  const list = read(LIST_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function addSurveyor(name) {
  name = name.trim();
  if (!name) return;
  const list = getSurveyors();
  if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) {
    list.push(name);
    list.sort((a, b) => a.localeCompare(b));
    write(LIST_KEY, list);
  }
}

export function removeSurveyor(name) {
  write(LIST_KEY, getSurveyors().filter((n) => n !== name));
  if (getLastSurveyor() === name) write(LAST_KEY, '');
}

export function getLastSurveyor() {
  // Older versions stored the raw string, not JSON.
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (raw == null) return '';
    try { return String(JSON.parse(raw)); } catch { return raw; }
  } catch {
    return '';
  }
}

export const setLastSurveyor = (name) => write(LAST_KEY, name);

/** Ask for a new surveyor name. Resolves the trimmed name or ''. */
async function promptName() {
  const input = h('input', { type: 'text', autocapitalize: 'words', autocomplete: 'off', placeholder: 'Full name', 'aria-label': 'Surveyor name' });
  setTimeout(() => input.focus(), 50);
  const ok = await choose({
    title: 'Add surveyor',
    content: input,
    buttons: [
      { label: 'Add', value: true, class: 'btn-primary' },
      { label: 'Cancel', value: false },
    ],
  });
  return ok ? input.value.trim() : '';
}

/**
 * Surveyor picker: choose from saved names, add new ones, remove old ones.
 * @param {object} job
 * @param {() => void} save
 */
export function surveyorField(job, save) {
  // Make sure the last-used name (from older versions) is in the list.
  const last = getLastSurveyor();
  if (last) addSurveyor(last);

  const select = h('select', { 'aria-label': 'Surveyor' });
  const removeBtn = h('button', { type: 'button', class: 'btn-small' }, 'Remove');

  const render = () => {
    const names = getSurveyors();
    const opts = job.surveyor && !names.includes(job.surveyor) ? [job.surveyor, ...names] : names;
    select.replaceChildren(
      h('option', { value: '' }, names.length ? 'Select surveyor…' : 'No surveyors yet – tap Add'),
      ...opts.map((n) => h('option', { value: n }, n)));
    select.value = job.surveyor || '';
    removeBtn.disabled = !job.surveyor || !names.includes(job.surveyor);
  };

  const pick = (name) => {
    job.surveyor = name;
    if (name) setLastSurveyor(name);
    save();
    render();
  };

  select.addEventListener('change', () => pick(select.value));

  const addBtn = h('button', {
    type: 'button',
    class: 'btn-small',
    onclick: async () => {
      const name = await promptName();
      if (!name) return;
      addSurveyor(name);
      pick(getSurveyors().find((n) => n.toLowerCase() === name.toLowerCase()) || name);
      toast(`${name} added – they'll be filled in on new surveys`);
    },
  }, '+ Add');

  removeBtn.addEventListener('click', async () => {
    const name = job.surveyor;
    if (!(await confirmDialog(`Remove “${name}” from the surveyor list on this device? Existing surveys keep their surveyor.`, { ok: 'Remove' }))) return;
    removeSurveyor(name);
    render();
  });

  render();
  return h('div', { class: 'field' },
    h('span', { class: 'field-label' }, 'Surveyor'),
    h('div', { class: 'input-row' }, h('div', { class: 'field' }, select), addBtn, removeBtn));
}

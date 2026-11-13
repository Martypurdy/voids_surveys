// Small DOM helpers: element builder, form fields, dialogs, toasts.
import { CONDITIONS } from './model.js';

/**
 * Hyperscript-style element builder.
 * h('button', { class: 'btn', onclick: fn }, 'Label')
 * Props are applied after children so <select value> works.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  append(el, children);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'open') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Inline SVG icon from a path string (24x24 viewBox). */
export function icon(d) {
  const wrap = document.createElement('span');
  wrap.style.display = 'inline-flex';
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return wrap.firstChild;
}

export const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

// ---------- Page chrome ----------

export function pageHeader(title, { back, actions = [] } = {}) {
  return h('header', { class: 'appbar' },
    back ? h('a', { class: 'btn icon-btn', href: back, 'aria-label': 'Back' }, icon(ICONS.back)) : h('span', { style: 'width:8px' }),
    h('h1', null, title),
    actions);
}

// ---------- Fields ----------

/**
 * Labelled text input / textarea. onInput receives the string value.
 * opts: { type, multiline, placeholder, inputmode, autocomplete, class, enterkeyhint }
 */
export function textField(label, value, onInput, opts = {}) {
  const input = h(opts.multiline ? 'textarea' : 'input', {
    type: opts.multiline ? null : opts.type || 'text',
    value: value ?? '',
    placeholder: opts.placeholder,
    inputmode: opts.inputmode,
    autocomplete: opts.autocomplete || 'off',
    autocapitalize: opts.autocapitalize,
    spellcheck: opts.spellcheck,
    enterkeyhint: opts.enterkeyhint,
    class: opts.class,
    oninput: (e) => onInput(e.target.value, e),
  });
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
}

/** Labelled <select>. options: array of strings or [value, label]. */
export function selectField(label, value, options, onChange, { placeholder = '—' } = {}) {
  const sel = h('select', { value: value ?? '', onchange: (e) => onChange(e.target.value, e) },
    placeholder != null ? h('option', { value: '' }, placeholder) : null,
    options.map((o) => (Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o))));
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), sel);
}

/** Good / Fair / Poor / N/A toggle buttons. Tapping the active one clears it. */
export function conditionPicker(value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Condition' });
  const render = (v) => {
    for (const b of wrap.children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  };
  for (const c of CONDITIONS) {
    wrap.append(h('button', {
      type: 'button',
      dataset: { v: c },
      onclick: () => {
        value = value === c ? '' : c;
        render(value);
        onChange(value);
      },
    }, c));
  }
  render(value);
  return wrap;
}

/** Big tap-to-select button (green when on), used for works such as "Fit key safe". */
export function worksButton(label, detail, on, onclick, { chevron, ...attrs } = {}) {
  return h('button', {
    type: 'button',
    class: 'works-item',
    'aria-pressed': String(on),
    onclick,
    ...attrs,
  },
  h('span', { class: 'works-tick', 'aria-hidden': 'true' }, on ? '✓' : ''),
  h('span', { class: 'works-text' },
    h('span', { class: 'works-label' }, label),
    detail ? h('span', { class: 'works-detail' }, detail) : null),
  chevron ? h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, chevron) : null);
}

export function badge(condition) {
  return condition ? h('span', { class: 'badge', dataset: { v: condition } }, condition) : null;
}

// ---------- Object URLs (released on navigation) ----------

const urls = new Set();
export function objectUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function releaseObjectUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

// ---------- Dialogs ----------

/**
 * Modal choice dialog. Resolves with the chosen button's value (or null on cancel/Esc).
 * buttons: [{ label, value, class, onClick }] – onClick (optional) runs inside the
 * click gesture, which matters for navigator.share().
 */
export function choose({ title, message, content, buttons }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', null,
      h('div', { class: 'dialog-body' },
        title ? h('h3', null, title) : null,
        message ? h('p', null, message) : null,
        content),
      h('div', { class: 'dialog-buttons' },
        buttons.map((b) => h('button', {
          type: 'button',
          class: b.class || '',
          onclick: () => {
            b.onClick?.();
            done(b.value);
          },
        }, b.label))));
    const done = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(null);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) done(null); // backdrop tap
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function confirmDialog(message, { title = 'Are you sure?', ok = 'Delete', danger = true } = {}) {
  const v = await choose({
    title,
    message,
    buttons: [
      { label: ok, value: true, class: danger ? 'btn-danger' : 'btn-primary' },
      { label: 'Cancel', value: false },
    ],
  });
  return v === true;
}

/**
 * Pop-up of toggle buttons; pick as many as needed.
 * groups: [{ label, options: string[], selected: string[] }]
 * Resolves with an array of selected arrays (one per group), or null if cancelled.
 */
export async function multiSelect({ title, message, groups }) {
  const state = groups.map((g) => new Set(g.selected || []));
  const grids = groups.map((g, gi) => {
    const grid = h('div', { class: 'choice-grid choice-grid-2', role: 'group', 'aria-label': g.label || title });
    const render = () => grid.replaceChildren(...g.options.map((opt) => h('button', {
      type: 'button',
      'aria-pressed': String(state[gi].has(opt)),
      onclick: () => {
        if (state[gi].has(opt)) state[gi].delete(opt);
        else state[gi].add(opt);
        render();
      },
    }, state[gi].has(opt) ? `✓ ${opt}` : opt)));
    render();
    grid.render = render;
    return grid;
  });
  const content = h('div', null, groups.map((g, gi) => [
    g.label ? h('span', { class: 'field-label', style: 'margin-top:10px' }, g.label) : null,
    grids[gi],
  ]));
  const v = await choose({
    title,
    message,
    content,
    buttons: [
      { label: 'Done', value: 'done', class: 'btn-primary' },
      {
        label: 'Clear all',
        value: 'clear',
      },
      { label: 'Cancel', value: null },
    ],
  });
  if (v === 'clear') return groups.map(() => []);
  if (v !== 'done') return null;
  // Keep the options' original order.
  return groups.map((g, gi) => g.options.filter((o) => state[gi].has(o)));
}

// ---------- Toast & busy overlay ----------

let toastEl = null;
let toastTimer = 0;

export function toast(message, { action, onAction, timeout = 3500 } = {}) {
  toastEl?.remove();
  clearTimeout(toastTimer);
  toastEl = h('div', { class: 'toast', role: 'status' },
    h('span', null, message),
    action ? h('button', { type: 'button', onclick: () => { toastEl?.remove(); onAction?.(); } }, action) : null);
  document.body.append(toastEl);
  if (timeout) toastTimer = setTimeout(() => toastEl?.remove(), timeout);
}

/** Show a blocking "working…" overlay. Returns { update(msg), close() }. */
export function busy(message) {
  const text = h('div', { class: 'busy-box', role: 'status' }, message);
  const el = h('div', { class: 'busy' }, text);
  document.body.append(el);
  return {
    update: (m) => { text.textContent = m; },
    close: () => el.remove(),
  };
}

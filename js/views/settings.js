// Screen: settings, in three tabs –
//   Sync & sharing  how data is stored today, and how connected storage would work (with a demo sign-in)
//   Defect lists    this device's defect list for each room type and feature
//   SOR library     load / remove the private SOR library on this device
import { getLibrary, saveLibrary, removeLibrary, validateLibrary } from '../sor.js';
import { PARTS } from '../data/parts.js';
import { h, pageHeader, confirmDialog, toast, busy } from '../ui.js';
import { fmtDateTime } from '../model.js';
import { refresh } from '../router.js';
import { defectListEditor } from './defectLists.js';
import { openSyncDemo } from './syncDemo.js';

const TABS = [
  ['sync', 'Sync & sharing'],
  ['defects', 'Defect lists'],
  ['sor', 'SOR library'],
];
const LAST_TAB = 'voids.settingsTab';

export default async function settings(root, { tab } = {}) {
  if (!TABS.some(([k]) => k === tab)) {
    let last = null;
    try { last = localStorage.getItem(LAST_TAB); } catch { /* storage blocked */ }
    tab = TABS.some(([k]) => k === last) ? last : 'sync';
  }
  try { localStorage.setItem(LAST_TAB, tab); } catch { /* storage blocked */ }
  const lib = await getLibrary();

  const nav = h('nav', { class: 'tabs', 'aria-label': 'Settings sections' },
    TABS.map(([k, label]) => h('a', {
      href: `#/settings/${k}`,
      'aria-current': k === tab ? 'page' : null,
    }, label)));

  const body = tab === 'defects' ? defectsTab(lib) : tab === 'sor' ? sorTab(lib) : syncTab();
  root.append(pageHeader('Settings', { back: '#/' }), nav, h('div', { class: 'content' }, body));
}

// ---------- Sync & sharing ----------
function syncTab() {
  const step = (n, title, text) => h('li', { class: 'intro-step' },
    h('span', { class: 'intro-num', 'aria-hidden': 'true' }, String(n)),
    h('span', null, h('strong', null, title), h('br'), text));
  const option = (emoji, title, who, points) => h('div', { class: 'card card-body intro-option' },
    h('h3', null, `${emoji} ${title}`),
    h('p', { class: 'hint' }, who),
    h('ul', { class: 'intro-list' }, points.map((p) => h('li', null, p))));

  return [
    h('div', { class: 'intro-banner' },
      h('strong', null, 'Not switched on yet'),
      h('span', null, 'This page explains what connected storage would add if the app is adopted. Today everything stays on this device.')),

    h('h2', null, 'How your data is stored today'),
    h('div', { class: 'card card-body' },
      h('p', null, 'Everything you enter – surveys, photos, your defect lists and wording – is saved ', h('strong', null, 'only on this device'), ', inside this browser. It works with no signal and nothing is sent anywhere.'),
      h('ul', { class: 'intro-list' },
        h('li', null, 'To move a survey to another device, use ', h('em', null, 'Backup .json'), ' and ', h('em', null, 'Import'), '.'),
        h('li', null, 'Reports leave the device only when you share or save the PDF.'),
        h('li', null, 'Each device has its own defect lists – changes on your phone don’t reach your PC.'))),

    h('h2', null, 'What connected storage would add'),
    h('p', { class: 'hint' }, 'The app would sign in to the company’s own Microsoft 365 (OneDrive / SharePoint) and keep its data there, so the same information is on every device you – or your team – use.'),
    option('👤', 'Individual', 'For a surveyor who works on site and in the office.', [
      'Start a survey on your phone, finish or review it on your PC.',
      'Your defect lists, wording and surveyors follow you to every device.',
      'Lose or replace a phone without losing surveys.',
    ]),
    option('👥', 'Team', 'For a voids team sharing work.', [
      'Surveys shared in a team folder – anyone in the team can open, check or finish one.',
      'One shared set of defect lists and materials, so reports are consistent.',
      'A supervisor can see which surveys are in progress or complete.',
    ]),
    option('🏢', 'Company', 'For the whole organisation.', [
      'Standard defect lists and materials set centrally, with local additions.',
      'The licensed SOR library loaded for every licensed user automatically.',
      'Accounts, access and leavers managed by IT through company sign-in.',
    ]),

    h('h2', null, 'How it would work'),
    h('ol', { class: 'intro-steps' },
      step(1, 'IT connects the app', 'A one-off set-up in the company’s Microsoft 365 that allows the app to use a chosen OneDrive or SharePoint folder.'),
      step(2, 'Sign in once on each device', 'With your normal work account – no new passwords.'),
      step(3, 'Choose where data is kept', 'Just me, my team’s folder, or the company area – set here in Settings.'),
      step(4, 'It updates itself', 'Each time the app opens it checks the folder for newer surveys and lists. Changes are saved back automatically.'),
      step(5, 'Still works offline', 'With no signal you carry on as normal; everything catches up when you’re back online.')),

    h('h2', null, 'Keeping data safe'),
    h('div', { class: 'card card-body' },
      h('ul', { class: 'intro-list' },
        h('li', null, 'Data stays inside the company’s own Microsoft 365 – never on a third-party server.'),
        h('li', null, 'Only people with company accounts and permission to the folder can see surveys.'),
        h('li', null, 'Tenant addresses and key safe codes are covered by the company’s existing data protection and retention rules.'),
        h('li', null, 'Removing a leaver’s company account removes their access straight away.'))),

    h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: openSyncDemo }, 'See how sign-in would look (demo)'),
    h('p', { class: 'footnote' }, 'The demo is a mock-up only – nothing is sent or saved.'),
  ];
}

// ---------- Defect lists ----------
function defectsTab(lib) {
  return [
    h('h2', null, 'Defect lists'),
    h('div', { class: 'card card-body intro-card' },
      h('p', null, 'These are the defects offered when you tap a feature in a room – for example ', h('em', null, 'Bedroom › Walls'), '. Build them up over time so the app matches the defects you find in your properties.'),
      h('ul', { class: 'intro-list' },
        h('li', null, h('strong', null, 'Room types share a list: '), 'Bedroom 1, 2, 3 … all use the Bedroom list.'),
        h('li', null, h('strong', null, 'Add your own: '), 'type a defect and choose Qty, m² or m. It stays on every survey until you remove it.'),
        h('li', null, h('strong', null, 'Remove: '), 'tap − to hide a standard defect you never use. Hidden ones can be put back at the bottom.'),
        h('li', null, h('strong', null, 'Change wording: '), 'in a survey, press and hold a defect. The new wording is remembered for next time.'),
        h('li', null, h('strong', null, 'Safe: '), 'changes here never alter defects already recorded on surveys.')),
      h('p', { class: 'hint' }, 'Lists are saved on this device. You can also change them while surveying, from the defects screen.')),
    defectListEditor(lib),
  ];
}

// ---------- SOR library ----------
function sorTab(lib) {
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const progress = busy('Loading SOR library…');
      try {
        const data = validateLibrary(JSON.parse(await file.text()));
        await saveLibrary(data);
        progress.close();
        toast(`SOR library loaded – ${data.items.length.toLocaleString('en-GB')} items`);
        refresh();
      } catch (err) {
        progress.close();
        toast(err instanceof SyntaxError ? 'That file isn’t valid' : err.message);
      }
    },
  });

  const status = lib
    ? h('div', { class: 'card card-body' },
      h('p', { class: 'sor-status' }, '✓ ', h('strong', null, lib.name || 'SOR library'), ' loaded on this device'),
      h('p', { class: 'hint' },
        `${lib.items.length.toLocaleString('en-GB')} items · loaded ${fmtDateTime(lib.loaded)}`, h('br'),
        'Preloaded: ', PARTS.map((p) => `${p.label} ${lib.parts[p.key]?.length || 0}`).join(', ')),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', onclick: () => fileInput.click() }, 'Load a newer file'),
        h('button', {
          type: 'button',
          class: 'btn-danger',
          onclick: async () => {
            if (!(await confirmDialog('Remove the SOR library from this device? Surveys keep the SOR items already recorded.', { ok: 'Remove' }))) return;
            await removeLibrary();
            toast('SOR library removed');
            refresh();
          },
        }, 'Remove')))
    : h('div', { class: 'card card-body' },
      h('p', { class: 'sor-status' }, 'No SOR library loaded – the defect lists use the app’s built-in wording.'),
      h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: () => fileInput.click() }, 'Load SOR library file'));

  return [
    h('h2', null, 'SOR library'),
    h('div', { class: 'card card-body intro-card' },
      h('p', null, 'A Schedule of Rates (SOR) is the priced list of standard repair items that contractors work to. Loading your organisation’s licensed SOR links each defect to its SOR code.'),
      h('h3', null, 'With a library loaded'),
      h('ul', { class: 'intro-list' },
        h('li', null, 'Defect lists for ceilings, walls, floors, woodwork, doors and windows are preloaded with matching SOR items, sized from the room measurements.'),
        h('li', null, 'A search box finds any item in the full SOR by code or words.'),
        h('li', null, 'SOR codes are printed on the PDF report and schedule of works.')),
      h('h3', null, 'Without one'),
      h('p', { class: 'hint' }, 'The app works fully using its built-in defect wording – no codes are shown. Useful for demonstrations.'),
      h('h3', null, 'Licensing'),
      h('p', { class: 'hint' }, 'SOR content is licensed, so it is never part of the app or website. The library file (sor-library.json) is supplied separately to licensed users and is stored only on the device it is loaded on. It holds codes and descriptions – no prices.')),
    status,
    fileInput,
    h('h3', null, 'How to load it'),
    h('ol', { class: 'intro-list' },
      h('li', null, 'Tap “Load SOR library file”.'),
      h('li', null, 'In the file picker choose OneDrive (Android: ☰ › OneDrive; iPhone: Browse › OneDrive).'),
      h('li', null, 'Open the “Void Surveys” folder and pick sor-library.json.')),
    h('p', { class: 'hint' }, 'Do this once on each device, and again whenever a newer library is issued.'),
  ];
}

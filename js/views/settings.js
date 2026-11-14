// Screen: settings, in three tabs (SOR library and Sync & sharing are proposed add-ons) –
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

// Defect lists are part of the app; the other two are proposed add-on features.
const TABS = [
  ['defects', 'Defect lists', false],
  ['sor', 'SOR library', true],
  ['sync', 'Sync & sharing', true],
];
const LAST_TAB = 'voids.settingsTab';

export default async function settings(root, { tab } = {}) {
  if (!TABS.some(([k]) => k === tab)) {
    let last = null;
    try { last = localStorage.getItem(LAST_TAB); } catch { /* storage blocked */ }
    tab = TABS.some(([k]) => k === last) ? last : 'defects';
  }
  try { localStorage.setItem(LAST_TAB, tab); } catch { /* storage blocked */ }
  const lib = await getLibrary();

  const nav = h('nav', { class: 'tabs', 'aria-label': 'Settings sections' },
    TABS.map(([k, label, addOn]) => h('a', {
      href: `#/settings/${k}`,
      'aria-current': k === tab ? 'page' : null,
    }, label, addOn ? h('span', { class: 'addon-pill' }, 'Add-on') : null)));

  const body = tab === 'defects' ? defectsTab(lib) : tab === 'sor' ? sorTab(lib) : syncTab();
  root.append(pageHeader('Settings', { back: '#/' }), nav, h('div', { class: 'content' }, body));
}

/** Numbered step with a title and any content. */
function guideStep(n, title, ...content) {
  return h('li', { class: 'intro-step' },
    h('span', { class: 'intro-num', 'aria-hidden': 'true' }, String(n)),
    h('div', null, h('strong', null, title), h('div', { class: 'intro-step-text' }, content)));
}

/** "Proposed add-on" banner at the top of an add-on tab. */
function proposal(title, text) {
  return h('div', { class: 'intro-banner' },
    h('span', { class: 'addon-pill' }, 'Proposed add-on'),
    h('strong', null, title),
    h('span', null, text));
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
    proposal('Sync & sharing across devices and teams',
      'An optional extra that could be added if the app is adopted. It isn’t switched on – today everything stays on this device.'),

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
    proposal('SOR integration',
      'An optional extra for organisations that hold a Schedule of Rates licence. The app works fully without it.'),
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
      h('p', { class: 'hint' }, 'SOR content is licensed, so it is never part of the app or website. The library file (sor-library.json) is supplied separately to licensed users and is stored only on the device it is loaded on. It holds codes and descriptions – no prices.'),
      h('h3', null, 'How it would be added'),
      h('ul', { class: 'intro-list' },
        h('li', null, 'The organisation confirms its SOR licence covers use in the app.'),
        h('li', null, 'A library file is prepared from the organisation’s own SOR, with the defect lists matched to its codes.'),
        h('li', null, 'Licensed users load it here – or, with the Sync & sharing add-on, it reaches every licensed user automatically.'))),
    h('h2', null, 'Setting up a library'),
    h('p', { class: 'hint' }, 'Done once by whoever looks after the SOR (for example a manager or admin), then shared with licensed users.'),
    h('ol', { class: 'intro-steps' },
      guideStep(1, 'Prepare the spreadsheet',
        'Start from your organisation’s SOR spreadsheet – or your own job list (see below) – as Excel .xlsx or .csv. It needs one row per item with at least:',
        h('ul', { class: 'intro-list' },
          h('li', null, h('strong', null, 'SOR code'), ' – e.g. DEC-0101'),
          h('li', null, h('strong', null, 'Description'), ' – the short item wording'),
          h('li', null, h('strong', null, 'Unit'), ' – m², m, nr, item, etc.'),
          h('li', null, 'Optional: ', h('strong', null, 'section / trade'), ' and a ', h('strong', null, 'long description'))),
        'For a licensed SOR, price / rate columns are left out – the library holds codes and wording only. Your own job list can include your prices (see below).'),
      guideStep(2, 'Convert it to a library file',
        'Open the converter included with the add-on and choose the spreadsheet. Pick the sheet to use and match its columns to Code, Description and Unit. ',
        'Then choose the items to offer first for each feature (ceilings, walls, floors, woodwork, doors, windows). ',
        'The converter saves one file, ', h('strong', null, 'sor-library.json'), '.'),
      guideStep(3, 'Save it where your devices can reach it',
        'Put sor-library.json in a private cloud folder – company OneDrive or SharePoint, Google Drive, Dropbox or iCloud Drive – or copy it straight onto the device. ',
        h('strong', null, 'Share it only with licensed users'), ' – never with a public “anyone with the link” share.'),
      guideStep(4, 'Load it on each device',
        'Tap “Load SOR library file” below. The device’s file picker opens:',
        h('ul', { class: 'intro-list' },
          h('li', null, h('strong', null, 'Android: '), 'tap ☰ (top left) and choose ', h('em', null, 'Drive'), ', ', h('em', null, 'OneDrive'), ', ', h('em', null, 'Dropbox'), ' or ', h('em', null, 'Downloads'), '.'),
          h('li', null, h('strong', null, 'iPhone / iPad: '), 'tap ', h('em', null, 'Browse'), ' and choose ', h('em', null, 'Google Drive'), ', ', h('em', null, 'OneDrive'), ' or ', h('em', null, 'iCloud Drive'), '. If one is missing, tap ⋯ › Edit and switch it on.'),
          h('li', null, h('strong', null, 'Windows / Mac: '), 'open the synced OneDrive or Google Drive folder, or your Downloads folder.')),
        'Then open the folder and pick sor-library.json. If your cloud service isn’t listed, open its app, download the file to the device, and pick it from Downloads.'),
      guideStep(5, 'Keep it up to date',
        'When a new SOR version is issued, convert it again and tap “Load a newer file” on each device. Items already recorded on surveys are kept.')),
    h('p', { class: 'hint' }, 'With the Sync & sharing add-on, steps 3 and 4 happen automatically – every licensed user gets the latest library when they open the app.'),

    h('h2', null, 'No SOR licence? Build your own job list'),
    h('div', { class: 'card card-body intro-card' },
      h('p', null, 'An organisation without a licensed SOR can create its own list of job numbers, fault descriptions and prices in a spreadsheet, and use it in exactly the same way. It belongs to the organisation, so there is no licence to buy.'),
      h('h3', null, 'Set out the spreadsheet'),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'intro-table' },
          h('thead', null, h('tr', null, ['Job no.', 'Description', 'Unit', 'Price £', 'Section'].map((c) => h('th', null, c)))),
          h('tbody', null,
            [['DEC-0101', 'Prepare and emulsion ceiling, room up to 10 m²', 'item', '85.00', 'Decoration'],
              ['DEC-0204', 'Strip wallpaper', 'm²', '4.50', 'Decoration'],
              ['SAN-0310', 'Renew toilet seat', 'nr', '18.00', 'Sanitary'],
              ['JOI-0402', 'Renew internal door handles (pair)', 'nr', '22.00', 'Joinery']]
              .map((r) => h('tr', null, r.map((c) => h('td', null, c))))))),
      h('ul', { class: 'intro-list' },
        h('li', null, h('strong', null, 'Job numbers: '), 'give every item its own number that never changes. A short trade prefix (DEC, SAN, JOI, ELE…) keeps them easy to find.'),
        h('li', null, h('strong', null, 'Descriptions: '), 'one clear fault or job per row, worded the way contractors will read it.'),
        h('li', null, h('strong', null, 'Units: '), 'say how it is measured – m² for areas, m for lengths, nr for each, item for a fixed job.'),
        h('li', null, h('strong', null, 'Prices: '), 'your agreed rate per unit. Keep prices in their own column so they can be updated each year without touching the rest.'),
        h('li', null, h('strong', null, 'Sections: '), 'group items by trade or room feature so searches find the right ones first.')),
      h('h3', null, 'Where to start'),
      h('ul', { class: 'intro-list' },
        h('li', null, 'Begin with the defects you record most – the built-in lists in Settings › Defect lists are a good starting point.'),
        h('li', null, 'Add prices from your contractor’s agreed rates or your own past jobs.'),
        h('li', null, 'Add a version number and date to the file name (e.g. job-list-v1-2026.xlsx) so everyone knows which is current.')),
      h('p', { class: 'hint' }, 'Then follow steps 2–5 above to convert and load it. Because the prices are your own, the add-on could also show an estimated cost for each item and a total on the schedule of works.')),

    h('h2', null, 'Load a library (licensed users)'),
    status,
    fileInput,
  ];
}

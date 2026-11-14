// Mock-up of how company sign-in and connected storage would look. Demo only:
// nothing typed here is saved or sent anywhere.
import { h, trackOverlay } from '../ui.js';

const LOCATIONS = [
  { key: 'me', emoji: '👤', title: 'Just me', where: 'My OneDrive › Void Surveys', text: 'Your own surveys and lists on all your devices.' },
  { key: 'team', emoji: '👥', title: 'My team', where: 'SharePoint › Voids Team › Surveys', text: 'Shared surveys and lists for the voids team.' },
  { key: 'company', emoji: '🏢', title: 'Company', where: 'SharePoint › Property Services › Void Surveys', text: 'Company standard lists, SOR library and all surveys.' },
];

export function openSyncDemo() {
  let stepNo = 0;
  let email = '';
  let location = LOCATIONS[0];
  const body = h('div', { class: 'demo-body' });
  const dots = h('div', { class: 'demo-dots', 'aria-hidden': 'true' });

  let untrack = () => {};
  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    untrack();
  };

  const screens = [
    // 1. Sign in
    () => {
      const input = h('input', { type: 'email', value: email, placeholder: 'name@yourcompany.co.uk', autocomplete: 'off', 'aria-label': 'Work email (demo)' });
      input.addEventListener('input', () => { email = input.value; });
      return [
        h('div', { class: 'demo-logo', 'aria-hidden': 'true' }, '🏠'),
        h('h2', null, 'Sign in to Void Surveys'),
        h('p', { class: 'hint' }, 'Use your normal work account. Your company’s own sign-in page opens here – the app never sees your password.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Work email'), input),
        h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: () => go(1) }, 'Sign in with work account'),
        h('p', { class: 'footnote' }, 'Demo – nothing you type is saved or sent.'),
      ];
    },
    // 2. Permissions
    () => [
      h('div', { class: 'demo-logo', 'aria-hidden': 'true' }, '🔒'),
      h('h2', null, 'Allow Void Surveys to:'),
      h('ul', { class: 'demo-perms' },
        h('li', null, '✓ See your name and work email'),
        h('li', null, '✓ Read and save files in the folder you choose'),
        h('li', null, '✓ Keep you signed in on this device')),
      h('p', { class: 'hint' }, 'Approved once by IT for the whole company. You can sign out at any time in Settings.'),
      h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: () => go(2) }, 'Allow'),
      h('button', { type: 'button', class: 'btn-block', onclick: () => go(0) }, 'Back'),
    ],
    // 3. Choose location
    () => [
      h('h2', null, 'Where should your data be kept?'),
      h('p', { class: 'hint' }, 'You can change this later. Your IT team decides which options you see.'),
      h('div', { class: 'works-list' }, LOCATIONS.map((l) => h('button', {
        type: 'button',
        class: 'works-item',
        'aria-pressed': String(l === location),
        onclick: () => { location = l; render(); },
      },
      h('span', { class: 'works-tick', 'aria-hidden': 'true' }, l === location ? '✓' : ''),
      h('span', { class: 'works-text' },
        h('span', { class: 'works-label' }, `${l.emoji} ${l.title}`),
        h('span', { class: 'works-detail' }, `${l.text} – ${l.where}`))))),
      h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: () => go(3) }, 'Connect'),
      h('button', { type: 'button', class: 'btn-block', onclick: () => go(1) }, 'Back'),
    ],
    // 4. Connected
    () => {
      const statusLine = h('span', null, 'Last checked: just now');
      const syncBtn = h('button', {
        type: 'button',
        class: 'btn-block',
        onclick: () => {
          syncBtn.disabled = true;
          statusLine.textContent = '⟳ Checking for updates…';
          setTimeout(() => {
            statusLine.textContent = 'Last checked: just now – everything up to date';
            syncBtn.disabled = false;
          }, 1400);
        },
      }, 'Check for updates now');
      return [
        h('div', { class: 'demo-logo demo-ok', 'aria-hidden': 'true' }, '✓'),
        h('h2', null, 'Connected'),
        h('div', { class: 'card card-body demo-status' },
          h('p', null, h('strong', null, 'Signed in as: '), email.trim() || 'surveyor@yourcompany.co.uk'),
          h('p', null, h('strong', null, 'Data kept in: '), `${location.emoji} ${location.where}`),
          h('p', null, h('strong', null, 'Status: '), statusLine),
          h('p', null, h('strong', null, 'Syncing: '), 'surveys & photos · defect lists & wording · materials · surveyors',
            location.key === 'company' ? ' · SOR library' : '')),
        h('h3', null, 'Your devices'),
        h('ul', { class: 'demo-perms' },
          h('li', null, '📱 Phone – this device · up to date'),
          h('li', null, '💻 Office PC · last used yesterday'),
          h('li', null, '📲 Tablet · last used 3 days ago')),
        h('p', { class: 'hint' }, 'Each time the app opens it checks for newer surveys and lists. With no signal you carry on as normal and it catches up later.'),
        syncBtn,
        h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: close }, 'Finish demo'),
      ];
    },
  ];

  const render = () => {
    body.replaceChildren(...screens[stepNo]());
    dots.replaceChildren(...screens.map((_, i) => h('span', { class: i === stepNo ? 'on' : '' })));
    body.scrollTop = 0;
  };
  const go = (n) => { stepNo = n; render(); };

  const overlay = h('div', { class: 'sheet demo', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign-in demo' },
    h('header', { class: 'sheet-head' },
      h('h2', null, h('span', { class: 'sheet-part' }, 'Connected storage'), h('span', { class: 'demo-flag' }, 'DEMO ONLY')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close demo', onclick: close }, '✕')),
    h('div', { class: 'sheet-body' }, dots, body));
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  untrack = trackOverlay(() => { untrack = () => {}; close(); });
  render();
}

// Screen 1: job list – create, open, actions (export / delete), import.
import { listJobs, saveJob, requestPersist, storageInfo } from '../db.js';
import { newJob, jobTitle, backupStatus, fmtDate, allPhotoIds } from '../model.js';
import { h, icon, ICONS, pageHeader } from '../ui.js';
import { go, refresh } from '../router.js';
import { jobActions } from './jobActions.js';

const LAST_SURVEYOR = 'voids.lastSurveyor';

export default async function jobList(root) {
  const jobs = await listJobs();

  const importInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const { importJobFile } = await import('../export/json.js');
      const job = await importJobFile(file);
      if (job) refresh();
    },
  });

  root.append(
    pageHeader('Void surveys', {
      actions: [h('button', { type: 'button', class: 'btn btn-small', style: 'color:inherit;background:transparent;border-color:currentColor', onclick: () => importInput.click() }, 'Import'), importInput],
    }),
    h('div', { class: 'content' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: createJob }, '+ New survey'),
      jobs.length
        ? h('div', { style: 'margin-top:16px' }, jobs.map(jobCard))
        : h('p', { class: 'empty' }, 'No surveys yet. Tap “New survey” to start.'),
      footnote()));
}

async function createJob() {
  let surveyor = '';
  try { surveyor = localStorage.getItem(LAST_SURVEYOR) || ''; } catch { /* storage blocked */ }
  const job = newJob({ surveyor });
  await saveJob(job);
  // Ask the browser to keep our data (helps against eviction, esp. on iOS).
  requestPersist();
  go(`/job/${job.id}`);
}

function jobCard(job) {
  const status = backupStatus(job);
  const counts = [
    `${job.rooms.length} room${job.rooms.length === 1 ? '' : 's'}`,
    `${allPhotoIds(job).length} photo${allPhotoIds(job).length === 1 ? '' : 's'}`,
  ].join(' · ');
  const sub = [job.address.postcode, job.voidRef && `Ref ${job.voidRef}`].filter(Boolean).join(' · ');
  return h('div', { class: 'card job-card' },
    h('a', { href: `#/job/${job.id}` },
      h('div', { class: 'job-title' }, jobTitle(job)),
      sub ? h('div', { class: 'job-sub' }, sub) : null,
      h('div', { class: 'job-meta' }, `Created ${fmtDate(job.created)} · ${counts}`),
      status.stale ? h('span', { class: 'warn' }, '⚠ ', status.text) : null),
    h('button', {
      type: 'button',
      class: 'icon-btn',
      'aria-label': `Actions for ${jobTitle(job)}`,
      onclick: async () => {
        if (await jobActions(job)) refresh();
      },
    }, icon(ICONS.more)));
}

function footnote() {
  const el = h('p', { class: 'footnote' }, 'All survey data is stored on this device only.');
  storageInfo().then(({ persisted, usage }) => {
    const parts = ['All survey data is stored on this device only.'];
    if (usage != null) parts.push(`Using ${(usage / 1048576).toFixed(1)} MB.`);
    parts.push(persisted ? 'Persistent storage granted.' : 'Back up regularly – the browser may clear data. Installing the app (Add to Home Screen) helps.');
    el.textContent = parts.join(' ');
  });
  return el;
}

export { LAST_SURVEYOR };

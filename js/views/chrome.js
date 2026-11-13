// Shared job-screen chrome: header, section tabs with progress colours,
// and the "Mark complete" footer. Opening a section marks it started (amber);
// the footer button marks it complete (green) and moves to the next section.
import { getJob, scheduleSave, flushSave } from '../db.js';
import { SECTIONS, jobTitle, sectionState } from '../model.js';
import { h, icon, ICONS, pageHeader, toast } from '../ui.js';
import { jobActions } from './jobActions.js';
import { go } from '../router.js';

export async function loadJobOr404(id) {
  const job = await getJob(id);
  if (!job) throw new Error('Job not found on this device');
  return job;
}

const sectionHref = (job, path) => `#/job/${job.id}${path ? '/' + path : ''}`;

function tabs(job, active) {
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Survey sections' });
  const render = () => {
    nav.replaceChildren(...SECTIONS.map(([key, label, path]) => {
      const state = sectionState(job, key) || 'todo';
      return h('a', {
        href: sectionHref(job, path),
        'aria-current': key === active ? 'page' : null,
        dataset: { state },
        'aria-label': `${label}${state === 'complete' ? ' (complete)' : state === 'started' ? ' (in progress)' : ''}`,
      }, state === 'complete' ? '✓ ' : '', label);
    }));
    requestAnimationFrame(() => nav.querySelector('[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  };
  render();
  nav.refresh = render;
  return nav;
}

/** Header + tabs for a job screen; marks `section` as started on first visit. */
export function jobChrome(job, section, { back = '#/', title } = {}) {
  if (!sectionState(job, section)) {
    job.progress[section] = 'started';
    scheduleSave(job);
  }
  const nav = tabs(job, section);
  return [
    pageHeader(title || jobTitle(job), {
      back,
      actions: h('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Export / job actions',
        onclick: async () => {
          if ((await jobActions(job)) === 'deleted') go('/');
        },
      }, icon(ICONS.share)),
    }),
    nav,
  ];
}

/** Big button at the bottom of each section: mark complete / reopen. */
export function completeFooter(job, section) {
  const idx = SECTIONS.findIndex(([k]) => k === section);
  const label = SECTIONS[idx][1];
  const wrap = h('div', { class: 'complete-footer' });

  const render = () => {
    const done = sectionState(job, section) === 'complete';
    wrap.replaceChildren(done
      ? h('div', null,
        h('p', { class: 'complete-note' }, `✓ ${label} is complete`),
        h('button', {
          type: 'button',
          class: 'btn-block',
          onclick: () => {
            job.progress[section] = 'started';
            scheduleSave(job);
            document.querySelector('.tabs')?.refresh?.();
            render();
          },
        }, 'Reopen section'))
      : h('button', {
        type: 'button',
        class: 'btn-complete btn-block',
        onclick: async () => {
          job.progress[section] = 'complete';
          scheduleSave(job, 0);
          await flushSave();
          toast(`✓ ${label} complete`);
          // Go to the next section that isn't complete yet (wrapping round), else back to jobs.
          const order = [...SECTIONS.slice(idx + 1), ...SECTIONS.slice(0, idx)];
          const next = order.find(([k]) => sectionState(job, k) !== 'complete');
          go(next ? sectionHref(job, next[2]).slice(1) : '/');
        },
      }, `✓ Mark ${label} complete`));
  };
  render();
  return wrap;
}

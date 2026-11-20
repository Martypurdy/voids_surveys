// "Update" button (Settings): look for a newer version right now and switch to it.
import { flushSave } from './db.js';
import { toast } from './ui.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The version the server is offering, read straight from sw.js (never from a cache). */
async function latestVersion() {
  try {
    const res = await fetch(`sw.js?nocache=${Date.now()}`, { cache: 'no-store' });
    return (await res.text()).match(/VERSION = '(v\d+)'/)?.[1] || null;
  } catch { return null; }
}

export async function updateNow(button) {
  const label = button?.textContent;
  const done = (msg) => { if (button) { button.disabled = false; button.textContent = label; } toast(msg, { timeout: 6000 }); };
  if (button) { button.disabled = true; button.textContent = 'Checking…'; }
  if (!navigator.onLine) return done('No signal – connect to the internet and try again.');
  try {
    await flushSave();
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (!reg) { location.reload(); return; }
    const latest = await latestVersion();
    await reg.update();
    // A new copy may still be downloading: give it a moment to finish.
    for (let i = 0; i < 40 && !reg.waiting && reg.installing; i++) await wait(250);
    if (reg.waiting) {
      toast(`Updating${latest ? ` to ${latest}` : ''}…`, { timeout: 6000 });
      reg.waiting.postMessage('skipWaiting'); // the page reloads itself when the new version takes over
      await wait(4000);
      location.reload(); // backstop if it did not reload on its own
      return;
    }
    done(latest ? `You are on the newest version (${latest}).` : 'You are on the newest version.');
  } catch (e) {
    console.warn('Update check failed', e);
    done('Could not check for an update. Try again with a better signal.');
  }
}

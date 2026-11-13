// Hand a generated file to the user: share sheet on phones, download elsewhere.
import { h, choose } from '../ui.js';

const isTouch = () => matchMedia('(pointer: coarse)').matches;

/** Share or download. Must be called inside a click handler. Resolves true if not cancelled. */
export async function deliverFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      // NotAllowedError etc. – fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

const mb = (n) => (n / 1048576).toFixed(1);

/**
 * Generating a file can take a while, which expires the tap's "user activation"
 * that navigator.share() needs. So show a ready dialog and share from its button.
 * Resolves true if the user saved/shared it.
 */
export function offerFile(blob, filename, title = 'File ready') {
  let result = Promise.resolve(false);
  return choose({
    title,
    message: `${filename} (${mb(blob.size)} MB)`,
    buttons: [
      { label: isTouch() ? 'Share / Save' : 'Download', value: 'go', class: 'btn-primary', onClick: () => { result = deliverFile(blob, filename); } },
      { label: 'Cancel', value: null },
    ],
  }).then((v) => (v === 'go' ? result : false));
}

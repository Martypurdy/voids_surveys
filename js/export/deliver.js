// Hand a generated file to the user: the phone's share sheet (WhatsApp, Teams, Outlook,
// OneDrive / Drive…) or a plain save / download.
import { h, choose } from '../ui.js';

const isTouch = () => matchMedia('(pointer: coarse)').matches;

/**
 * The file to put on the share sheet. Phone browsers only allow some file types
 * there (PDF yes, .json no), so a .json backup is shared as a .txt text file –
 * Import on the home screen reads either.
 */
function shareableFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) return file;
  if (/\.json$/i.test(filename)) {
    const txt = new File([blob], filename.replace(/\.json$/i, '.txt'), { type: 'text/plain' });
    if (navigator.canShare?.({ files: [txt] })) return txt;
  }
  return null;
}

/** Can this device show the share sheet for this file? */
export const canShareFile = (blob, filename) => isTouch() && Boolean(shareableFile(blob, filename));

/** Save / download the file. */
export function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Share sheet if possible, else save. Must be called inside a tap. Resolves true if not cancelled. */
export async function deliverFile(blob, filename) {
  const file = isTouch() ? shareableFile(blob, filename) : null;
  if (file) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      // NotAllowedError etc. – fall back to saving.
    }
  }
  return saveFile(blob, filename);
}

const mb = (n) => (n / 1048576).toFixed(1);

/**
 * Generating a file can take a while, which expires the tap's "user activation"
 * that navigator.share() needs. So show a ready dialog and share from its button.
 * On phones: Share (WhatsApp, Teams, email, cloud…) or Save to phone.
 * Resolves true if the user saved/shared it.
 */
export function offerFile(blob, filename, title = 'File ready') {
  let result = Promise.resolve(false);
  const share = canShareFile(blob, filename);
  return choose({
    title,
    message: `${filename} (${mb(blob.size)} MB)`,
    buttons: [
      share
        ? { label: '📤 Share – WhatsApp, Teams, email, OneDrive…', value: 'go', class: 'btn-primary btn-big', onClick: () => { result = deliverFile(blob, filename); } }
        : null,
      { label: share ? '💾 Save to phone' : (isTouch() ? '💾 Save' : 'Download'), value: 'go', class: share ? 'btn-big' : 'btn-primary', onClick: () => { result = Promise.resolve(saveFile(blob, filename)); } },
      { label: 'Cancel', value: null },
    ].filter(Boolean),
  }).then((v) => (v === 'go' ? result : false));
}

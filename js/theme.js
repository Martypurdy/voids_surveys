// Light / dark appearance: 'auto' follows the phone's setting; 'light' or 'dark'
// force it. Saved on this device. (index.html applies it before first paint.)
const KEY = 'voids.theme';

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTheme(t) {
  try {
    if (t === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* storage blocked – still applies for this visit */ }
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

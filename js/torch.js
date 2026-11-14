// Phone torch (flashlight) from the top bar, for dark voids.
// Browsers can only switch the torch on through the rear camera, so turning it on opens
// the camera in the background (no picture is shown or saved). It stays on as you move
// between screens and goes off when you tap it again, open the photo camera, or leave
// the app. Browsers don't let a web app choose the brightness – Android runs the torch
// at its normal full brightness.

let stream = null;
let track = null;
const listeners = new Set();

export const torchSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);
export const torchIsOn = () => Boolean(track && track.readyState === 'live');

/** Call fn(on) whenever the torch turns on or off. Returns an unsubscribe function. */
export function onTorchChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn(torchIsOn()));

function stopStream(s) {
  s?.getTracks().forEach((t) => t.stop());
}

/** Open a rear camera that has a torch. Returns { stream, track } or throws. */
async function openTorchCamera() {
  const tryOpen = async (video) => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    const t = s.getVideoTracks()[0];
    if (t?.getCapabilities?.().torch) return { stream: s, track: t };
    stopStream(s);
    return null;
  };
  const first = await tryOpen({ facingMode: { ideal: 'environment' } });
  if (first) return first;
  // Some phones only have the torch on one particular rear camera – try each in turn.
  const cams = (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === 'videoinput' && !/front|user|selfie/i.test(d.label));
  for (const d of cams) {
    const r = await tryOpen({ deviceId: { exact: d.deviceId } }).catch(() => null);
    if (r) return r;
  }
  throw new Error('This phone or browser doesn’t let apps use the torch.');
}

export async function torchOn() {
  if (torchIsOn()) return;
  const r = await openTorchCamera();
  await r.track.applyConstraints({ advanced: [{ torch: true }] });
  stream = r.stream;
  track = r.track;
  track.addEventListener('ended', () => { stream = track = null; notify(); });
  notify();
}

export function torchOff() {
  if (!stream) return;
  try { track?.applyConstraints({ advanced: [{ torch: false }] }); } catch { /* stopping turns it off anyway */ }
  stopStream(stream);
  stream = track = null;
  notify();
}

/** Toggle; throws with a readable message if the torch can't be used. */
export async function toggleTorch() {
  if (torchIsOn()) torchOff();
  else await torchOn();
}

// Leaving the app (switching apps, locking the phone) turns the torch off.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') torchOff();
});

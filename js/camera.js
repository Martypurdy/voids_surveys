// In-app camera: live viewfinder, tap the shutter as many times as you like
// (no per-photo review), zoom 0.5x / 1x / 2x where possible, torch where
// supported, then Done.
//
// Zoom strategy, best first:
//   1. iPhone "Dual Wide" / "Triple" virtual camera with hardware zoom:
//      zoom 1 = 0.5x (ultra-wide), 2 = 1x, 4 = 2x – lens switching is automatic.
//   2. Any camera with a hardware zoom range (many Android phones).
//   3. 0.5x by switching to a camera labelled "Ultra Wide" (iPhone).
//   4. 2x by digital crop (always works, lower resolution).
import { h } from './ui.js';

export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

const MAX_SIDE = 1600;
const QUALITY = 0.85;
const LEVELS = [0.5, 1, 2];

/**
 * Open the camera full screen.
 * @param {{ onCapture: (blob: Blob) => void }} opts  called for every shot
 * @returns {Promise<{ count: number, error?: Error }>} when the user taps Done
 */
export function openCamera({ onCapture }) {
  return new Promise((resolve) => {
    let stream = null;
    let track = null;
    let count = 0;
    let digital = 1; // digital crop factor when hardware zoom isn't available
    let level = 1;
    let factor = 1; // hardware zoom value for "1x" (2 on iPhone virtual wide cameras)
    let torchOn = false;
    let devices = [];
    let closed = false;

    const video = h('video', { class: 'cam-video', playsinline: true, autoplay: true, muted: true });
    video.muted = true;
    const flash = h('div', { class: 'cam-flash' });
    const counter = h('div', { class: 'cam-count', 'aria-live': 'polite' }, '0 photos');
    const lastThumb = h('img', { class: 'cam-last', alt: '' });
    const zoomBar = h('div', { class: 'cam-zoom', role: 'group', 'aria-label': 'Zoom' });
    const torchBtn = h('button', { type: 'button', class: 'cam-torch', hidden: true, 'aria-pressed': 'false', onclick: toggleTorch }, '⚡ Torch');
    const message = h('div', { class: 'cam-message', hidden: true });
    const shutter = h('button', { type: 'button', class: 'cam-shutter', 'aria-label': 'Take photo', onclick: snap });
    const doneBtn = h('button', { type: 'button', class: 'cam-done', onclick: () => close() }, 'Done');

    const overlay = h('div', { class: 'camera', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Camera' },
      video, flash, message,
      h('div', { class: 'cam-top' }, counter, torchBtn),
      h('div', { class: 'cam-bottom' },
        zoomBar,
        h('div', { class: 'cam-controls' }, lastThumb, shutter, doneBtn)));
    document.body.append(overlay);
    document.body.classList.add('no-scroll');

    // ---------- stream handling ----------
    const caps = () => (track?.getCapabilities ? track.getCapabilities() : {});
    const isVirtualWide = () => /dual wide|triple/i.test(track?.label || '');
    const isUltraWide = () => /ultra ?wide/i.test(track?.label || '');

    function stopStream() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      track = null;
    }

    async function start(deviceId) {
      stopStream();
      const size = { width: { ideal: 1920 }, height: { ideal: 1440 } };
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: 'environment' }, ...size },
      });
      if (closed) return stopStream();
      track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      await video.play().catch(() => {});
      factor = isVirtualWide() ? 2 : 1;
      torchOn = false;
      torchBtn.hidden = !caps().torch;
      torchBtn.setAttribute('aria-pressed', 'false');
    }

    const hwZoom = () => caps().zoom; // { min, max } or undefined
    const canHw = (v) => { const z = hwZoom(); return z && v >= z.min - 1e-6 && v <= z.max + 1e-6; };
    const findDevice = (re) => devices.find((d) => re.test(d.label));

    async function boot() {
      try {
        await start();
        devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        // Prefer an iPhone virtual multi-lens camera: smooth 0.5x–2x with one stream.
        const virtual = findDevice(/back (triple|dual wide) camera/i);
        if (virtual && track.getSettings().deviceId !== virtual.deviceId) {
          const before = track.getSettings().deviceId;
          try {
            await start(virtual.deviceId);
            if (!hwZoom()) await start(before);
          } catch {
            await start(before);
          }
        }
        await setLevel(1);
      } catch (err) {
        close(err);
      }
    }

    // ---------- zoom ----------
    function availableLevels() {
      return LEVELS.filter((l) => {
        if (l !== 0.5) return true;
        return canHw(0.5 * factor) || Boolean(findDevice(/ultra ?wide/i)) || isUltraWide();
      });
    }

    function renderZoom() {
      zoomBar.replaceChildren(...availableLevels().map((l) => h('button', {
        type: 'button',
        'aria-pressed': String(l === level),
        onclick: () => setLevel(l),
      }, `${l === 0.5 ? '.5' : l}×`)));
    }

    async function setLevel(l) {
      level = l;
      digital = 1;
      try {
        if (l === 0.5 && !canHw(0.5 * factor)) {
          const uw = findDevice(/ultra ?wide/i);
          if (uw && !isUltraWide()) await start(uw.deviceId);
        } else if (l !== 0.5 && isUltraWide()) {
          // Back from the ultra-wide lens to the main camera.
          const main = findDevice(/^back camera$/i) || devices.find((d) => /back|environment|rear/i.test(d.label) && !/ultra|tele|front/i.test(d.label));
          await start(main?.deviceId);
        }
        if (!isUltraWide()) {
          const want = l * factor;
          if (canHw(want)) await track.applyConstraints({ advanced: [{ zoom: want }] });
          else {
            if (hwZoom()) await track.applyConstraints({ advanced: [{ zoom: Math.max(hwZoom().min, factor) }] }).catch(() => {});
            digital = l > 1 ? l : 1;
          }
        }
      } catch (e) {
        console.warn('Zoom change failed', e);
        digital = l > 1 ? l : 1;
      }
      video.style.transform = digital > 1 ? `scale(${digital})` : '';
      renderZoom();
    }

    // ---------- capture ----------
    function snap() {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const sw = vw / digital;
      const sh = vh / digital;
      const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      canvas.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
      // Instant feedback; encoding/saving happens in the background.
      flash.classList.remove('go');
      void flash.offsetWidth; // restart the animation
      flash.classList.add('go');
      navigator.vibrate?.(25);
      count++;
      counter.textContent = `${count} photo${count === 1 ? '' : 's'}`;
      canvas.toBlob((blob) => {
        if (!blob) return;
        if (lastThumb.src) URL.revokeObjectURL(lastThumb.src);
        lastThumb.src = URL.createObjectURL(blob);
        onCapture(blob);
        canvas.width = canvas.height = 0;
      }, 'image/jpeg', QUALITY);
    }

    async function toggleTorch() {
      try {
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        torchBtn.setAttribute('aria-pressed', String(torchOn));
      } catch {
        torchBtn.hidden = true;
      }
    }

    // The OS stops the camera when the app is backgrounded – restart on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !closed && (!track || track.readyState === 'ended')) {
        start(track?.getSettings?.().deviceId).then(() => setLevel(level)).catch((e) => close(e));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); snap(); }
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', () => close(), { once: true });

    function close(error) {
      if (closed) return;
      closed = true;
      stopStream();
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('keydown', onKey);
      if (lastThumb.src) URL.revokeObjectURL(lastThumb.src);
      overlay.remove();
      document.body.classList.remove('no-scroll');
      resolve({ count, error });
    }

    boot();
  });
}

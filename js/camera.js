// In-app camera: live viewfinder, tap the shutter as many times as you like
// (no per-photo review), zoom .5x / 1x / 2x, torch where supported, then Done.
//
// .5x (wide) – tried in this order:
//   1. iPhone "Dual Wide"/"Triple" virtual camera: hardware zoom 1 = 0.5x.
//   2. Hardware zoom that goes below 1x (some Android phones, e.g. 0.6x).
//   3. A camera labelled "Ultra Wide" (iPhone Safari lists each lens).
//   4. Other rear cameras (Android lists them without names): tapping .5x
//      cycles through them; the one used is remembered on this device.
//   5. Nothing wider available: offer the phone's own camera app.
// 2x – hardware zoom if available, otherwise a digital crop.
import { h } from './ui.js';

export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

const MAX_SIDE = 1600;
const QUALITY = 0.85;
const WIDE_KEY = 'voids.wideLens';

const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/**
 * Open the camera full screen.
 * @param {{ onCapture: (blob: Blob) => void, onNative?: () => void }} opts
 *   onCapture – called for every shot; onNative – called (inside a tap) when the
 *   user chooses the phone's own camera app instead.
 * @returns {Promise<{ count: number, error?: Error }>} when closed
 */
export function openCamera({ onCapture, onNative }) {
  return new Promise((resolve) => {
    let stream = null;
    let track = null;
    let count = 0;
    let digital = 1;
    let level = 1;
    let wideLabel = '.5×';
    let factor = 1; // hardware zoom value meaning "1x" (2 on iPhone virtual wide cameras)
    let mainId = null; // the normal (1x) rear camera
    let torchOn = false;
    let devices = [];
    let closed = false;
    let msgTimer = 0;

    const video = h('video', { class: 'cam-video', playsinline: true, autoplay: true, muted: true });
    video.muted = true;
    const flash = h('div', { class: 'cam-flash' });
    const counter = h('div', { class: 'cam-count', 'aria-live': 'polite' }, '0 photos');
    const lastThumb = h('img', { class: 'cam-last', alt: '' });
    const zoomBar = h('div', { class: 'cam-zoom', role: 'group', 'aria-label': 'Zoom' });
    const torchBtn = h('button', { type: 'button', class: 'cam-torch', hidden: true, 'aria-pressed': 'false', onclick: toggleTorch }, '⚡ Torch');
    const message = h('div', { class: 'cam-message', hidden: true, role: 'status' });
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

    function showMessage(text, action) {
      clearTimeout(msgTimer);
      message.replaceChildren(h('p', null, text), action || '');
      message.hidden = false;
      if (!action) msgTimer = setTimeout(() => { message.hidden = true; }, 3500);
    }

    // ---------- stream ----------
    const caps = () => (track?.getCapabilities ? track.getCapabilities() : {});
    const label = () => track?.label || '';
    const isVirtualWide = () => /dual wide|triple/i.test(label());
    const currentId = () => track?.getSettings?.().deviceId;

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
    const canHw = (v) => { const z = hwZoom(); return Boolean(z) && v >= z.min - 1e-6 && v <= z.max + 1e-6; };
    const findDevice = (re) => devices.find((d) => re.test(d.label));
    const rearCameras = () => devices.filter((d) => !/front|user|face/i.test(d.label));

    async function boot() {
      try {
        await start();
        devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        // Prefer an iPhone virtual multi-lens camera: smooth .5x–2x on one stream.
        const virtual = findDevice(/back (triple|dual wide) camera/i);
        if (virtual && currentId() !== virtual.deviceId) {
          const before = currentId();
          try {
            await start(virtual.deviceId);
            if (!hwZoom()) await start(before);
          } catch {
            await start(before);
          }
        }
        mainId = currentId();
        await setLevel(1);
      } catch (err) {
        close(err);
      }
    }

    // ---------- zoom ----------
    function renderZoom() {
      zoomBar.replaceChildren(...[0.5, 1, 2].map((l) => h('button', {
        type: 'button',
        'aria-pressed': String(l === level),
        onclick: () => setLevel(l),
      }, l === 0.5 ? wideLabel : `${l}×`)));
    }

    async function applyZoom(v) {
      if (canHw(v)) {
        await track.applyConstraints({ advanced: [{ zoom: v }] });
        return true;
      }
      return false;
    }

    async function toMain() {
      if (mainId && currentId() !== mainId) await start(mainId);
    }

    /** Try every way of getting a wider view. Returns true if something wider is showing. */
    async function goWide(cycle) {
      wideLabel = '.5×';
      // 1 & 2: hardware zoom on the main camera.
      await toMain();
      if (await applyZoom(0.5 * factor)) return true;
      const z = hwZoom();
      if (z && z.min < factor - 0.05) {
        await applyZoom(z.min);
        wideLabel = `.${Math.round((z.min / factor) * 10)}×`;
        return true;
      }
      // 3: a lens the browser names "Ultra Wide".
      const uw = findDevice(/ultra ?wide/i);
      if (uw) {
        await start(uw.deviceId);
        return true;
      }
      // 4: unnamed rear cameras (Android) – cycle through them.
      const others = rearCameras().filter((d) => d.deviceId !== mainId);
      if (others.length) {
        const saved = others.findIndex((d) => d.deviceId === recall(WIDE_KEY));
        let i = saved >= 0 ? saved : 0;
        if (cycle) {
          const cur = others.findIndex((d) => d.deviceId === currentId());
          i = (cur + 1) % others.length;
        }
        await start(others[i].deviceId);
        remember(WIDE_KEY, others[i].deviceId);
        if (others.length > 1 || cycle) {
          showMessage(`Lens ${i + 1} of ${others.length}. If this isn’t the wide view, tap ${wideLabel} again to try the next lens.`);
        }
        return true;
      }
      return false;
    }

    async function setLevel(l) {
      const again = l === 0.5 && level === 0.5;
      level = l;
      digital = 1;
      try {
        if (l === 0.5) {
          if (!(await goWide(again))) {
            level = 1;
            await toMain();
            await applyZoom(factor);
            showMessage('This phone’s browser doesn’t give apps the wide (.5×) lens.', onNative
              ? h('button', {
                type: 'button',
                class: 'btn-primary',
                onclick: () => { close(); onNative(); },
              }, 'Use phone camera for .5×')
              : null);
          }
        } else {
          await toMain();
          if (!(await applyZoom(l * factor))) {
            if (hwZoom()) await applyZoom(Math.max(hwZoom().min, Math.min(factor, hwZoom().max))).catch(() => {});
            digital = l > 1 ? l : 1;
          }
        }
      } catch (e) {
        console.warn('Zoom change failed', e);
        if (l > 1) digital = l;
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
      flash.classList.remove('go');
      void flash.offsetWidth;
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
        start(currentId() || mainId).then(() => setLevel(level)).catch((e) => close(e));
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
      clearTimeout(msgTimer);
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

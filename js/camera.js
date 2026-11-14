// In-app camera: live viewfinder, tap the shutter as many times as you like
// (no per-photo review), zoom .5x / 1x / 2x, torch where supported, then Done.
//
// .5x (wide) – never guesses. Tried in this order:
//   1. Hardware zoom below 1x on the main camera (some Android phones).
//   2. A lens the browser names "Ultra Wide" (iPhone Safari names every lens).
//   3. The wide lens the user confirmed earlier on this device.
//   4. One-time lens setup: show each other rear lens and ask "Is this wider
//      than normal?" – the confirmed one is remembered. Lenses that fail or
//      give no picture are skipped; telephoto lenses are never offered.
//   5. No wide lens available: offer the phone's own camera app.
// 2x – hardware zoom on the main camera, otherwise a digital crop.
// Zoom taps are ignored while a lens switch is in progress.
import { h, trackOverlay } from './ui.js';

export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

const MAX_SIDE = 1600;
const QUALITY = 0.85;
const WIDE_KEY = 'voids.wideLens2'; // deviceId confirmed by the user, or 'none'

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
    let mainId = null; // the normal (1x) rear camera
    let torchOn = false;
    let devices = [];
    let closed = false;
    let busy = false;
    let msgTimer = 0;
    let answer = null; // resolver for an on-screen question

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
    // Phone back button closes the camera (photos already taken are kept).
    let untrack = trackOverlay(() => { untrack = () => {}; close(); });

    // ---------- on-screen messages / questions ----------
    function showMessage(text, buttons = []) {
      clearTimeout(msgTimer);
      message.replaceChildren(h('p', null, text),
        buttons.length ? h('div', { class: 'cam-msg-buttons' }, buttons) : '');
      message.hidden = false;
      if (!buttons.length) msgTimer = setTimeout(() => { message.hidden = true; }, 3500);
    }
    const hideMessage = () => { clearTimeout(msgTimer); message.hidden = true; };

    /** Ask a question over the live view. options: [[value, label, class]] */
    function ask(text, options) {
      return new Promise((res) => {
        answer = res;
        showMessage(text, options.map(([value, lbl, cls]) => h('button', {
          type: 'button',
          class: cls || '',
          onclick: () => { answer = null; hideMessage(); res(value); },
        }, lbl)));
      });
    }

    // ---------- stream ----------
    const caps = () => (track?.getCapabilities ? track.getCapabilities() : {});
    const currentId = () => track?.getSettings?.().deviceId;

    function stopStream() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      track = null;
    }

    /** Resolve once the video is actually showing frames; reject if it never does. */
    function waitForPicture(gen, ms = 3000) {
      return new Promise((res, rej) => {
        const t0 = Date.now();
        const check = () => {
          if (closed || gen !== startGen) return res();
          if (video.readyState >= 2 && video.videoWidth > 0) return res();
          if (Date.now() - t0 > ms) return rej(new Error('No picture from this lens'));
          setTimeout(check, 50);
        };
        check();
      });
    }

    let startGen = 0;
    /** Open a camera (main rear camera if no deviceId). Throws if it fails or shows no picture. */
    async function start(deviceId) {
      const gen = ++startGen;
      stopStream();
      video.srcObject = null;
      const size = { width: { ideal: 1920 }, height: { ideal: 1440 } };
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: 'environment' }, ...size },
      });
      if (closed || gen !== startGen) {
        // Closed, or a newer lens switch started meanwhile – drop this one.
        s.getTracks().forEach((t) => t.stop());
        if (!closed) throw new Error('Superseded');
        return;
      }
      stream = s;
      track = s.getVideoTracks()[0];
      video.srcObject = s;
      video.play().catch(() => {}); // don't await: it can hang on a lens with no picture
      try {
        await waitForPicture(gen);
      } catch (e) {
        if (gen === startGen) {
          stopStream();
          video.srcObject = null;
        }
        throw e;
      }
      torchOn = false;
      torchBtn.hidden = !caps().torch;
      torchBtn.setAttribute('aria-pressed', 'false');
    }

    const hwZoom = () => caps().zoom; // { min, max } or undefined
    const canHw = (v) => { const z = hwZoom(); return Boolean(z) && v >= z.min - 1e-6 && v <= z.max + 1e-6; };
    const findDevice = (re) => devices.find((d) => re.test(d.label));
    const isFront = (d) => /front|user|face/i.test(d.label);

    async function boot() {
      try {
        await start();
        devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        // iPhone may hand us a combined multi-lens camera; use the plain main lens so 1x is really 1x.
        if (/dual wide|triple/i.test(track.label)) {
          const plain = findDevice(/^back camera$/i);
          if (plain) await start(plain.deviceId);
        }
        mainId = currentId();
        await setLevel(1);
      } catch (err) {
        close(err);
      }
    }

    async function toMain() {
      if (mainId && currentId() !== mainId) await start(mainId);
      else if (!track || track.readyState === 'ended') await start(mainId || undefined);
    }

    async function applyZoom(v) {
      if (!canHw(v)) return false;
      await track.applyConstraints({ advanced: [{ zoom: v }] });
      return true;
    }

    // ---------- wide (.5x) ----------
    async function goWide() {
      wideLabel = '.5×';
      await toMain();

      // 1. Hardware zoom-out on the main camera.
      const z = hwZoom();
      if (z && z.min <= 0.95) {
        const v = Math.max(z.min, 0.5);
        await applyZoom(v);
        wideLabel = `.${Math.round(v * 10)}×`;
        return true;
      }

      // 2. A lens the browser names "Ultra Wide".
      const uw = findDevice(/ultra ?wide/i);
      if (uw) {
        try {
          await start(uw.deviceId);
          return true;
        } catch {
          await toMain();
        }
      }

      // 3. The lens confirmed earlier on this device.
      const saved = recall(WIDE_KEY);
      if (saved === 'none') return false;
      if (saved && devices.some((d) => d.deviceId === saved)) {
        try {
          await start(saved);
          return true;
        } catch {
          remember(WIDE_KEY, '');
          await toMain();
        }
      }

      // 4. One-time lens setup.
      return lensSetup();
    }

    async function lensSetup() {
      const candidates = devices.filter((d) => d.deviceId !== mainId && !isFront(d) && !/tele/i.test(d.label));
      for (let i = 0; i < candidates.length; i++) {
        try {
          await start(candidates[i].deviceId);
        } catch {
          continue; // no picture / can't open – skip it
        }
        const reply = await ask(
          `Wide lens setup (${i + 1} of ${candidates.length}): is this picture WIDER than normal – showing more of the room?`,
          [['yes', 'Yes – use this for .5×', 'btn-primary'], ['no', 'No – try next lens'], ['stop', 'Cancel']]);
        if (reply === 'yes') {
          remember(WIDE_KEY, candidates[i].deviceId);
          showMessage('Saved – .5× will use this lens on this phone.');
          return true;
        }
        if (reply === 'stop') {
          await toMain();
          return null; // cancelled – no fallback message
        }
      }
      remember(WIDE_KEY, 'none');
      await toMain();
      return false;
    }

    function noWideLens() {
      showMessage('This phone’s browser doesn’t give apps a wide (.5×) lens.', [
        onNative
          ? h('button', { type: 'button', class: 'btn-primary', onclick: () => { close(); onNative(); } }, 'Use phone camera for .5×')
          : null,
        h('button', {
          type: 'button',
          onclick: () => {
            remember(WIDE_KEY, '');
            hideMessage();
            setLevel(0.5);
          },
        }, 'Try lens setup again'),
        h('button', { type: 'button', onclick: hideMessage }, 'Close'),
      ].filter(Boolean));
    }

    // ---------- zoom ----------
    function renderZoom() {
      zoomBar.replaceChildren(...[0.5, 1, 2].map((l) => h('button', {
        type: 'button',
        'aria-pressed': String(l === level),
        disabled: busy,
        onclick: () => setLevel(l),
      }, l === 0.5 ? wideLabel : `${l}×`)));
    }

    async function setLevel(l) {
      if (busy) return;
      busy = true;
      renderZoom();
      const previous = level;
      digital = 1;
      try {
        if (l === 0.5) {
          const ok = await goWide();
          if (ok) level = 0.5;
          else {
            level = 1;
            await toMain();
            await applyZoom(1).catch(() => {});
            if (ok === false) noWideLens();
          }
        } else {
          level = l;
          await toMain();
          if (!(await applyZoom(l))) digital = l > 1 ? l : 1;
        }
      } catch (e) {
        console.warn('Lens change failed', e);
        level = previous === 0.5 ? 1 : previous;
        try {
          await toMain();
        } catch (err) {
          busy = false;
          return close(err);
        }
        showMessage('That lens couldn’t be opened – back to 1×.');
      } finally {
        busy = false;
      }
      video.style.transform = digital > 1 ? `scale(${digital})` : '';
      renderZoom();
    }

    // ---------- capture ----------
    function snap() {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh || busy) return;
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
      if (document.visibilityState === 'visible' && !closed && !busy && (!track || track.readyState === 'ended')) {
        busy = true;
        start(mainId || undefined)
          .then(() => { busy = false; level = 1; return setLevel(1); })
          .catch((e) => { busy = false; close(e); });
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
      answer?.('stop');
      clearTimeout(msgTimer);
      stopStream();
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('keydown', onKey);
      if (lastThumb.src) URL.revokeObjectURL(lastThumb.src);
      overlay.remove();
      document.body.classList.remove('no-scroll');
      untrack();
      resolve({ count, error });
    }

    boot();
  });
}

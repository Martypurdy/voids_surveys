// Full-screen signature pad: sign with a finger (or mouse / stylus) in landscape.
// Tries to switch the phone to landscape for real (full screen + orientation lock);
// where the browser won't allow that, the pad is drawn turned sideways instead, so
// turning the phone gives a wide landscape signing area either way.
// Resolves with a PNG data URL, or null if cancelled.
import { h, toast, trackOverlay } from './ui.js';

export function captureSignature({ title = 'Sign below' } = {}) {
  return new Promise((resolve) => {
    const canvas = h('canvas', { class: 'sig-canvas', 'aria-label': 'Signature area – sign with your finger' });
    const hint = h('span', { class: 'sig-line-hint' }, 'Sign here');
    const pad = h('div', { class: 'sig-pad' }, canvas, h('div', { class: 'sig-line' }), hint);
    const overlay = h('div', { class: 'sig-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sig-stage' },
        h('div', { class: 'sig-head' },
          h('strong', null, title),
          h('div', { class: 'sig-btns' },
            h('button', { type: 'button', onclick: () => clear() }, 'Clear'),
            h('button', { type: 'button', onclick: () => finish(null) }, 'Cancel'),
            h('button', { type: 'button', class: 'btn-primary', onclick: () => done() }, 'Done'))),
        pad));
    document.body.append(overlay);
    document.body.classList.add('no-scroll');

    const stage = overlay.firstElementChild;
    const ctx = canvas.getContext('2d');
    let rotated = false; // drawn sideways because the phone is upright
    let strokes = 0;
    let last = null;
    let untrack = () => {};

    // ----- Size and orientation -----
    const layout = () => {
      const portrait = window.innerHeight > window.innerWidth;
      rotated = portrait;
      overlay.classList.toggle('sig-rotated', rotated);
      // Keep what's been drawn when the layout changes.
      const keep = strokes ? canvas.toDataURL() : null;
      const r = pad.getBoundingClientRect();
      const w = rotated ? r.height : r.width;
      const hgt = rotated ? r.width : r.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#111';
      if (keep) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, hgt);
        img.src = keep;
      }
    };

    // Screen point -> canvas point (allowing for the sideways layout).
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      if (!rotated) return { x: e.clientX - r.left, y: e.clientY - r.top };
      // Turned 90° clockwise: the canvas's x runs down the screen, its y runs right to left.
      return { x: e.clientY - r.top, y: r.right - e.clientX };
    };

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      last = point(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      strokes++;
      hint.hidden = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      e.preventDefault();
      const events = e.getCoalescedEvents?.() || [e];
      for (const ev of events) {
        const p = point(ev);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
      }
    });
    const up = () => { last = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const clear = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      strokes = 0;
      hint.hidden = false;
    };

    const done = () => {
      if (!strokes) return toast('Sign in the box first');
      // Save on a white background, scaled to a sensible size for the report.
      const out = document.createElement('canvas');
      const scale = Math.min(1, 900 / canvas.width);
      out.width = Math.round(canvas.width * scale);
      out.height = Math.round(canvas.height * scale);
      const o = out.getContext('2d');
      o.fillStyle = '#fff';
      o.fillRect(0, 0, out.width, out.height);
      o.drawImage(canvas, 0, 0, out.width, out.height);
      finish(out.toDataURL('image/png'));
    };

    const onResize = () => requestAnimationFrame(layout);
    async function finish(result) {
      if (!overlay.isConnected) return;
      window.removeEventListener('resize', onResize);
      overlay.remove();
      document.body.classList.remove('no-scroll');
      untrack();
      try { screen.orientation?.unlock?.(); } catch { /* not locked */ }
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      resolve(result);
    }

    window.addEventListener('resize', onResize);
    untrack = trackOverlay(() => { untrack = () => {}; finish(null); }); // phone back button

    // Real landscape where allowed (Android: needs full screen first).
    (async () => {
      try {
        if (!matchMedia('(pointer: coarse)').matches) return; // computer: no need
        await overlay.requestFullscreen?.({ navigationUI: 'hide' });
        await screen.orientation?.lock?.('landscape');
      } catch { /* not allowed here – the sideways layout is used instead */ } finally { layout(); }
    })();
    layout();
  });
}

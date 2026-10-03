// Virtual clock, injected into every frame before any other script runs.
// Timers, requestAnimationFrame, performance.now and CSS/Web Animations only move
// forward when the director calls __vt.step(ms), so every captured video frame
// shows exactly 1/60 s of motion no matter how long the capture itself takes.
// Date is left alone so timestamps stay comparable with the service worker.
(() => {
  if (window.__vt) return;
  let vt = 0;
  let nextId = 1;
  const timers = new Map();
  const rafs = new Map();
  const starts = new WeakMap();

  performance.now = () => vt;

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { t: vt + Math.max(0, Number(ms) || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 1);
    timers.set(id, { t: vt + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);
  window.requestAnimationFrame = (fn) => {
    const id = nextId++;
    rafs.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = (id) => void rafs.delete(id);

  const call = (fn, args) => {
    try {
      typeof fn === 'function' ? fn(...args) : 0;
    } catch (e) {
      console.error(e);
    }
  };

  function syncAnimations() {
    for (const a of document.getAnimations()) {
      // The stage's "pulse" keeps Chrome producing frames in real time (needed for input).
      if (a.effect?.target?.id === 'vt-pulse') continue;
      if (!starts.has(a)) {
        starts.set(a, vt - (a.currentTime ?? 0));
        a.pause();
      }
      a.currentTime = vt - starts.get(a);
    }
  }

  window.__vt = {
    now: () => vt,
    /** Advance this frame's clock, and any same-origin child frames, by `ms`. */
    step(ms) {
      const target = vt + ms;
      for (let guard = 0; guard < 10000; guard++) {
        let next = null;
        for (const [id, t] of timers) if (t.t <= target && (!next || t.t < next[1].t)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        vt = Math.max(vt, t.t);
        if (t.every) t.t += t.every;
        else timers.delete(id);
        call(t.fn, t.args);
      }
      vt = target;
      const callbacks = [...rafs.values()];
      rafs.clear();
      for (const cb of callbacks) call(cb, [vt]);
      syncAnimations();
      for (const f of document.querySelectorAll('iframe')) {
        try {
          f.contentWindow.__vt?.step(ms);
        } catch {
          /* cross-origin frame */
        }
      }
    },
    /** Re-sync animations after the DOM changed without advancing time. */
    sync: syncAnimations,
  };
})();

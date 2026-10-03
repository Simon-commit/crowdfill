// Stage controls, called by the director (video/record.mjs) frame by frame.
(() => {
  const $ = (s) => document.querySelector(s);
  const camera = $('#camera');
  const cursor = $('#cursor');
  const caption = $('#caption');
  const results = { counts: [0, 0, 0, 0, 0], total: 0, nps: [] };
  let app = null;

  const restart = (el, cls) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  window.stage = {
    scene(name) {
      $('#title').classList.toggle('on', name === 'title');
      $('#end').classList.toggle('on', name === 'end');
      camera.classList.toggle('on', name === 'browser');
    },

    /** Camera: show the point (x, y) of the 1920x1080 stage at the centre, zoomed by `scale`. */
    camera(x, y, scale) {
      camera.style.transform = `translate(${960 - x * scale}px, ${540 - y * scale}px) scale(${scale})`;
    },

    cursor(x, y, visible = true) {
      cursor.style.transform = `translate(${x - 6}px, ${y - 3}px)`;
      cursor.classList.toggle('on', visible);
    },
    press(down) {
      cursor.classList.toggle('down', down);
      if (down) restart(cursor, 'click');
    },

    caption(text) {
      const span = caption.querySelector('span');
      if (!text) {
        caption.classList.remove('on');
        return;
      }
      if (span.textContent === text && caption.classList.contains('on')) return;
      span.textContent = text;
      restart(caption, 'on');
    },

    /* The survey page, filled by hand in the opening. */
    typeName(text) {
      const box = $('#f-name');
      box.classList.toggle('focus', text !== null);
      box.querySelector('span').textContent = text ?? box.querySelector('span').textContent;
    },
    select(q, index) {
      const labels = document.querySelectorAll(`[data-q="${q}"] label`);
      labels.forEach((l, i) => l.classList.toggle('sel', i === index));
    },
    pressSubmit(down) {
      $('#f-submit').classList.toggle('press', down);
    },
    recorded(on) {
      $('#recorded').classList.toggle('on', on);
    },
    clearForm() {
      document.querySelectorAll('label.sel').forEach((l) => l.classList.remove('sel'));
      $('#f-name span').textContent = '';
      $('#f-name').classList.remove('focus');
    },
    tally(n, show = true) {
      $('#tally').classList.toggle('on', show);
      $('#tally-n').textContent = String(n);
      if (n > 0) restart($('#tally'), 'bump');
    },
    lightIcon(on) {
      $('#ext-icon').classList.toggle('lit', on);
    },

    /* Side panel with the real extension. */
    openPanel(src) {
      if (!app) {
        app = document.createElement('iframe');
        app.src = src;
        $('#app-slot').appendChild(app);
      }
      $('#panel').classList.add('open');
    },
    appWindow() {
      return app?.contentWindow ?? null;
    },

    /* Results view fed by the director as submissions arrive. */
    /** Softly fades the form page so attention goes to the panel. */
    dimPage(on) {
      $('#page').classList.toggle('dim', on);
    },
    showResults(on) {
      $('#page').classList.toggle('show-results', on);
    },
    addResult(sat, nps) {
      if (sat >= 1 && sat <= 5) results.counts[sat - 1]++;
      if (Number.isFinite(nps)) results.nps.push(nps);
      results.total++;
      const max = Math.max(...results.counts, 1);
      document.querySelectorAll('#r-bars > div').forEach((d, i) => {
        d.querySelector('i').style.height = `${(results.counts[i] / max) * 250}px`;
        d.querySelector('.v').textContent = String(results.counts[i]);
      });
      $('#r-count').textContent = String(results.total);
      const n = results.counts.reduce((a, b) => a + b, 0);
      const avg = n ? results.counts.reduce((a, c, i) => a + c * (i + 1), 0) / n : 0;
      $('#r-avg').textContent = n ? avg.toFixed(1) : '-';
      const promoters = results.nps.filter((v) => v >= 9).length;
      $('#r-nps').textContent = results.nps.length ? `${Math.round((promoters / results.nps.length) * 100)}%` : '-';
    },

    /** Bounding box of a stage element, in stage pixels (after the camera). */
    rect(selector) {
      const r = $(selector).getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
  };
})();

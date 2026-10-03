// Renders the Crowdfill showcase video.
//
//   npm run video -- --voice=will           final: 1080p60, narrated
//   npm run video -- --draft                quick 30 fps preview, timing estimated, no narration
//
// The real extension runs inside a stage page. A virtual clock (video/clock.js)
// makes every animation advance exactly one frame per capture, so motion stays
// perfectly smooth. Requests to Google and Anthropic are answered here, on the
// video's own timeline, so nothing ever reaches the real services.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import puppeteer from 'puppeteer-core';
import { chromePath } from '../e2e/chrome.mjs';
import { SHOWCASE_ID, SHOWCASE_URL, showcaseHtml } from '../e2e/showcase.mjs';
import { crowdReply } from './crowd.mjs';
import { renderFx, renderMusic } from './music.mjs';
import { speak, VOICES } from './voice.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.cache', 'video');
const outDir = join(root, 'release');
const FFMPEG = process.env.FFMPEG || ffmpegInstaller.path;

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const DRAFT = process.argv.includes('--draft');
// Replays the timeline without capturing frames, then remixes audio onto the existing video.
const MIX_ONLY = process.argv.includes('--mix-only');
const FPS = DRAFT ? 30 : 60;
const DPR = DRAFT ? 1 : 2;
const VOICE = arg('voice', 'will');
const DT = 1000 / FPS;
let lastAction = 'start';
const log = (...a) => {
  lastAction = a.join(' ');
  if (process.env.DEBUG) console.log('[video]', ...a);
};
if (process.env.DEBUG) setInterval(() => console.log('[heartbeat]', lastAction), 5000).unref();

const script = JSON.parse(readFileSync(join(root, 'video', 'script.json'), 'utf8'));
const lineById = Object.fromEntries(script.map((l) => [l.id, l]));

/* ----------------------------------------------------------------- audio -- */

function probeDuration(file) {
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' });
  } catch (e) {
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(e.stderr));
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  throw new Error(`Could not read the duration of ${file}`);
}

async function prepareVoice() {
  const out = {};
  for (let i = 0; i < script.length; i++) {
    const l = script[i];
    if (DRAFT) {
      out[l.id] = { file: null, dur: l.text.split(/\s+/).length / 2.6 + 0.3 };
      continue;
    }
    const voiceId = VOICES[VOICE]?.id ?? VOICE;
    const file = await speak(l.text, voiceId, { previous: script[i - 1]?.text, next: script[i + 1]?.text });
    out[l.id] = { file, dur: probeDuration(file) };
  }
  return out;
}

/* --------------------------------------------------------------- browser -- */

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

async function main() {
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const voice = await prepareVoice();
  log('voice ready')

  // A copy of the built extension with the stage added.
  const ext = join(work, 'ext');
  rmSync(ext, { recursive: true, force: true });
  cpSync(join(root, 'dist'), ext, { recursive: true });
  cpSync(join(root, 'video', 'stage'), join(ext, 'stage'), { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: await chromePath(root),
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb'],
    defaultViewport: null,
  });

  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
  const extId = new URL(sw.url()).host;
  const cdp = await sw.createCDPSession();
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: 'https://docs.google.com/forms/*' }, { urlPattern: 'https://api.anthropic.com/*' }] });

  // Requests are parked here until the timeline releases them.
  const queues = { form: [], post: [], ai: [] };
  cdp.on('Fetch.requestPaused', (e) => {
    const url = e.request.url;
    if (url.startsWith('https://api.anthropic.com/')) {
      if (e.request.method === 'OPTIONS') {
        void cdp.send('Fetch.fulfillRequest', {
          requestId: e.requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Headers', value: '*' },
          ],
        });
        return;
      }
      queues.ai.push(e);
    } else if (e.request.method === 'POST') queues.post.push(e);
    else queues.form.push(e);
  });
  const fulfill = (e, body, type = 'text/html; charset=utf-8') =>
    cdp.send('Fetch.fulfillRequest', {
      requestId: e.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: type },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: Buffer.from(body).toString('base64'),
    });
  const nextRequest = async (kind) => {
    for (let i = 0; i < 400 && queues[kind].length === 0; i++) await new Promise((r) => setTimeout(r, 25));
    const e = queues[kind].shift();
    if (!e) throw new Error(`No ${kind} request arrived`);
    return e;
  };

  // Seed the extension's settings, then open the stage.
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extId}/stage/stage.html`);
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      settings: { acknowledged: true, reviewAsked: true, notify: false, theme: 'light', apiKey: 'sk-ant-video', aiModel: 'claude-opus-5-5' },
    });
  });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: DPR });
  await page.evaluateOnNewDocument(readFileSync(join(root, 'video', 'clock.js'), 'utf8'));
  await page.goto(`chrome-extension://${extId}/stage/stage.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const client = await page.createCDPSession();
  log('stage loaded')

  /* ------------------------------------------------------------- encoder -- */
  const silent = join(work, DRAFT ? 'draft-silent.mp4' : 'silent.mp4');
  const encoder = MIX_ONLY ? null : spawn(
    FFMPEG,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-c:v',
      'mjpeg',
      '-i',
      '-',
      '-vf',
      // Screenshots are full-range sRGB JPEGs: convert to HD (BT.709) video colour.
      'scale=1920:1080:flags=lanczos:in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-c:v',
      'libx264',
      '-preset',
      DRAFT ? 'veryfast' : 'slow',
      '-crf',
      DRAFT ? '23' : '14',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      silent,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const encoded = MIX_ONLY ? Promise.resolve() : new Promise((res, rej) => encoder.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

  /* ------------------------------------------------------------ timeline -- */
  let frame = 0;
  const now = () => frame / FPS;
  const tracks = new Set();
  const fx = [];
  const voPlan = [];
  const cursor = { x: 1500, y: 900, visible: false };
  const sfx = (type, at = now()) => fx.push({ type, t: at });
  // Page calls fail loudly instead of hanging forever.
  const S = (fn, ...a) =>
    Promise.race([
      page.evaluate(fn, ...a),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Page call timed out: ${String(fn).slice(0, 90)}`)), 15000)),
    ]);

  async function tick() {
    const t0 = Date.now();
    const dbg = frame % 60 === 0 || process.env.DEBUG === '2';
    if (dbg) log('tick', frame, 'tracks');
    for (const tr of [...tracks]) if (await tr(now())) tracks.delete(tr);
    if (dbg) log('tick', frame, 'step');
    await S((ms) => window.__vt.step(ms), DT);
    if (dbg) log('tick', frame, 'shot');
    if (MIX_ONLY) {
      frame++;
      return;
    }
    const { data } = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: DRAFT ? 82 : 95, optimizeForSpeed: true });
    if (dbg) log('tick', frame, 'shot done', data.length, 'ms', Date.now() - t0);
    if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => encoder.stdin.once('drain', r));
    frame++;
    if (frame % (FPS * 5) === 0) process.stdout.write(`  ${now().toFixed(0)}s`);
  }
  const wait = async (sec) => {
    const end = frame + Math.round(sec * FPS);
    while (frame < end) await tick();
  };
  /** Runs `fn(eased progress)` every frame for `sec` seconds, in the background. */
  const animate = (sec, fn, easing = ease) => {
    const start = now();
    return new Promise((done) => {
      tracks.add(async (t) => {
        const p = Math.min(1, (t - start) / sec);
        await fn(easing(p), p);
        if (p >= 1) done();
        return p >= 1;
      });
    });
  };
  /** Keeps rendering frames until `promise` (usually an animation) has finished. */
  const settle = async (promise) => {
    let finished = false;
    promise.then(() => (finished = true));
    await Promise.resolve();
    while (!finished) await tick();
  };
  const play = (sec, fn, easing) => settle(animate(sec, fn, easing));
  /** Waits for real work (requests, renders) without advancing the video. */
  const until = async (check, label) => {
    for (let i = 0; i < 600; i++) {
      const t0 = Date.now();
      await S(() => window.__vt.step(0));
      const t1 = Date.now();
      const ok = await check();
      if (i < 5 || i % 50 === 0) log('until', label, i, 'step ms', t1 - t0, 'check ms', Date.now() - t1);
      if (ok) {
        log('until done', label);
        return;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  // Narration and captions: start a line and return when it has been spoken.
  const say = async (id, { lead = 0.15, tail = 0.35, caption = true } = {}) => {
    const v = voice[id];
    await wait(lead);
    voPlan.push({ file: v.file, t: now() });
    if (caption) await S((text) => stage.caption(text), lineById[id].text);
    return wait(v.dur + tail).then(async () => {
      if (caption) await S(() => stage.caption(null));
    });
  };
  const sayAsync = (id, opts) => {
    const v = voice[id];
    const lead = opts?.lead ?? 0.15;
    const at = now() + lead;
    const caption = opts?.caption ?? true;
    animate(lead + v.dur + (opts?.tail ?? 0.35), async (_, p) => {
      if (p > 0 && !voPlan.some((x) => x.id === id)) {
        voPlan.push({ id, file: v.file, t: at });
        if (caption) await S((text) => stage.caption(text), lineById[id].text);
      }
      if (p >= 1 && caption) await S(() => stage.caption(null));
    }, (p) => p);
    return lead + v.dur + (opts?.tail ?? 0.35);
  };

  // Cursor and mouse.
  const setCursor = async (x, y, visible = true) => {
    Object.assign(cursor, { x, y, visible });
    await S((x, y, v) => stage.cursor(x, y, v), x, y, visible);
  };
  const moveTo = async (target, sec = 0.7) => {
    const from = { x: cursor.x, y: cursor.y };
    const to = typeof target === 'function' ? await target() : target;
    await play(sec, (p) => setCursor(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p));
  };
  /** Visual press of the cursor, optionally clicking an element inside the extension. */
  const click = async (target) => {
    await S(() => stage.press(true));
    sfx('click');
    await wait(0.09);
    if (target) await appDo(target, 'click');
    await S(() => stage.press(false));
    await wait(0.12);
  };
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  // Geometry of things inside the extension iframe, in stage pixels.
  const app = (sel, text, index = 0) =>
    S(
      (sel, text, index) => {
        const w = stage.appWindow();
        if (!w) return null;
        let els = [...w.document.querySelectorAll(sel)];
        if (text) els = els.filter((e) => e.textContent.replace(/\s+/g, ' ').trim().includes(text));
        const el = els[index];
        if (!el) return null;
        const fr = document.querySelector('#app-slot iframe').getBoundingClientRect();
        const k = fr.width / 456;
        const r = el.getBoundingClientRect();
        return { x: fr.left + r.left * k, y: fr.top + r.top * k, w: r.width * k, h: r.height * k, top: r.top };
      },
      sel,
      text ?? null,
      index,
    );
  /** Runs an action on an element inside the extension: click, focus, or set a value. */
  const appDo = ([sel, text, index = 0], action, value) =>
    S(
      (sel, text, index, action, value) => {
        const w = stage.appWindow();
        let els = [...w.document.querySelectorAll(sel)];
        if (text) els = els.filter((e) => e.textContent.replace(/\s+/g, ' ').trim().includes(text));
        const el = els[index];
        if (!el) return false;
        if (action === 'click') {
          const opts = { bubbles: true, cancelable: true, view: w, button: 0 };
          el.dispatchEvent(new w.PointerEvent('pointerdown', opts));
          el.dispatchEvent(new w.MouseEvent('mousedown', opts));
          el.dispatchEvent(new w.PointerEvent('pointerup', opts));
          el.dispatchEvent(new w.MouseEvent('mouseup', opts));
          el.click();
        } else if (action === 'focus') {
          el.focus();
        } else if (action === 'value') {
          const proto = el instanceof w.HTMLTextAreaElement ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
          el.dispatchEvent(new w.Event('input', { bubbles: true }));
        } else if (action === 'change') {
          el.dispatchEvent(new w.Event('change', { bubbles: true }));
        }
        return true;
      },
      sel,
      text ?? null,
      index,
      action,
      value ?? null,
    );
  const appCenter = async (sel, text, index) => {
    const r = await app(sel, text, index);
    if (!r) throw new Error(`Not found in app: ${sel} ${text ?? ''}`);
    return center(r);
  };
  const clickApp = async (sel, text, index = 0, sec = 0.65) => {
    await moveTo(() => appCenter(sel, text, index), sec);
    await click([sel, text, index]);
  };
  const appScroll = async (y, sec = 0.9) => {
    const from = await S(() => stage.appWindow().scrollY);
    await play(sec, (p) => S((y) => stage.appWindow().scrollTo(0, y), from + (y - from) * p));
  };
  /** Scrolls the app so that an element sits `offset` px from the top of the panel. */
  const appScrollTo = async (sel, text, offset = 70, sec = 0.9) => {
    const top = await S(
      (sel, text) => {
        const w = stage.appWindow();
        const el = [...w.document.querySelectorAll(sel)].find((e) => !text || e.textContent.includes(text));
        return el ? w.scrollY + el.getBoundingClientRect().top : null;
      },
      sel,
      text ?? null,
    );
    if (top !== null) await appScroll(Math.max(0, top - offset), sec);
  };
  /** Drags a range input from where it is now to a fraction `to` of its track. */
  const dragSlider = async (label, to, sec = 1.1) => {
    const r = await app(`input[aria-label="${label}"]`);
    const from = await S(
      (label) => {
        const el = stage.appWindow().document.querySelector(`input[aria-label="${label}"]`);
        return (Number(el.value) - Number(el.min || 0)) / (Number(el.max || 100) - Number(el.min || 0));
      },
      label,
    );
    const thumb = 18 * (r.h / 22);
    const xAt = (f) => r.x + thumb / 2 + f * (r.w - thumb);
    const y = r.y + r.h / 2;
    await moveTo({ x: xAt(from), y }, 0.6);
    await S(() => stage.press(true));
    sfx('click');
    const sel = [`input[aria-label="${label}"]`, null, 0];
    const range = await S(
      (label) => {
        const el = stage.appWindow().document.querySelector(`input[aria-label="${label}"]`);
        return { min: Number(el.min || 0), max: Number(el.max || 100), step: Number(el.step || 1) };
      },
      label,
    );
    await play(sec, async (p) => {
      const f = from + (to - from) * p;
      await setCursor(xAt(f), y);
      const v = Math.round((range.min + f * (range.max - range.min)) / range.step) * range.step;
      await appDo(sel, 'value', String(v));
    });
    await S(() => stage.press(false));
    await wait(0.15);
  };

  // Camera: centre point and zoom, tweened.
  const cam = { x: 960, y: 540, s: 1 };
  const setCam = (x, y, s) => {
    Object.assign(cam, { x, y, s });
    return S((x, y, s) => stage.camera(x, y, s), x, y, s);
  };
  const cameraTo = (x, y, s, sec = 1.2) => {
    const from = { ...cam };
    return animate(sec, (p) => setCam(from.x + (x - from.x) * p, from.y + (y - from.y) * p, from.s + (s - from.s) * p));
  };
  // Close-up: the form on the left, the Crowdfill panel on the right, like real use.
  const FOCUS = { x: 1112, y: 566, s: 1.42 };

  // Releases parked form submissions at a steady pace and feeds the results view.
  let released = 0;
  const pumpPosts = (every, total) =>
    new Promise((done) => {
      let next = now();
      tracks.add(async (t) => {
        if (released >= total) {
          done();
          return true;
        }
        if (t < next) return false;
        const e = await nextRequest('post');
        const body = new URLSearchParams(e.request.postData ?? '');
        await fulfill(e, '<html><body>Your response has been recorded. <a href="viewform?usp=form_confirm">Submit another response</a></body></html>');
        released++;
        next = t + every;
        sfx('tick');
        await S((sat, nps) => stage.addResult(sat, nps), Number(body.get('entry.1006')), Number(body.get('entry.1011')));
        return false;
      });
    });

  /* -------------------------------------------------------------- scenes -- */
  console.log(`Recording ${DRAFT ? 'draft ' : ''}at ${FPS} fps, ${1920 * DPR}x${1080 * DPR} capture`);

  const SKIP_INTRO = process.env.SKIP_INTRO === '1';
  // 1. Filling the form by hand, again and again.
  log('scene: intro');
  await S(() => stage.scene('browser'));
  log('scene set');
  await setCam(960, 520, 1.32);
  log('cam set');
  await setCursor(1100, 760, true);
  await S(() => stage.tally(0, true));
  await wait(0.4);
  const introLen = sayAsync('intro1', { lead: 0.1, tail: 0.25 });
  const introStart = now();
  const stageCenter = async (sel) => center(await S((s) => stage.rect(s), sel));
  const nthOption = (q, i) => async () => center(await S((q, i) => stage.rect(`[data-q="${q}"] label:nth-of-type(${i + 1}) i`), q, i));
  const fillOnce = async (name, sat, staff, speed) => {
    log('fill', name);
    await moveTo(() => stageCenter('#f-name'), 0.55 * speed);
    log('fill moved');
    await click();
    for (let i = 1; i <= name.length; i++) {
      await S((t) => stage.typeName(t), name.slice(0, i));
      await wait(0.035 * speed);
    }
    await moveTo(nthOption('sat', sat), 0.45 * speed);
    await click();
    await S((i) => stage.select('sat', i), sat);
    await moveTo(nthOption('staff', staff), 0.4 * speed);
    await click();
    await S((i) => stage.select('staff', i), staff);
    await moveTo(() => stageCenter('#f-submit'), 0.45 * speed);
    await S(() => stage.pressSubmit(true));
    await click();
    await S(() => stage.pressSubmit(false));
    await S(() => stage.recorded(true));
    released++;
    await S((n) => stage.tally(n), released);
    await wait(0.35 * speed);
    await S(() => {
      stage.recorded(false);
      stage.clearForm();
    });
  };
  if (!SKIP_INTRO) {
    await fillOnce('Jane Cooper', 3, 3, 1);
    await fillOnce('Sam Lee', 4, 4, 0.62);
    await fillOnce('Ana Ruiz', 2, 3, 0.45);
    await wait(Math.max(0, introStart + introLen - now()));
  }
  released = 0;

  log('scene: title');
  // 2. Title card.
  sfx('whoosh', now() - 0.25);
  await S(() => {
    stage.tally(0, false);
    stage.scene('title');
  });
  await setCursor(cursor.x, cursor.y, false);
  sfx('chime', now() + 0.3);
  const titleAt = now();
  if (!SKIP_INTRO) await say('intro2', { lead: 0.5, tail: 0.6, caption: false });

  log('scene: load');
  // 3. Open the panel and load the form.
  sfx('whoosh', now() - 0.25);
  await S(() => stage.scene('browser'));
  await setCam(960, 540, 1);
  const mainAt = now();
  await setCursor(1200, 600, true);
  const loadLen = sayAsync('load', { lead: 0.2 });
  const loadStart = now();
  await moveTo(() => stageCenter('#ext-icon'), 0.9);
  await S(() => stage.lightIcon(true));
  await click();
  sfx('pop');
  await S((src) => stage.openPanel(src), `../app.html?form=${encodeURIComponent(SHOWCASE_URL)}`);
  await wait(0.5);
  await until(() => queues.form.length > 0, 'the form request');
  await wait(0.35);
  await fulfill(queues.form.shift(), showcaseHtml());
  await until(async () => !!(await app('.qcard')), 'the question cards');
  await S(() => stage.lightIcon(false));
  await setCursor(1250, 640, true);
  await S(() => stage.dimPage(true));
  await settle(cameraTo(FOCUS.x, FOCUS.y, FOCUS.s, 1.6));
  await wait(0.9);
  await appScrollTo('.qcard', 'Rate the following', 120, 1.6);
  await wait(0.8);
  await appScroll(0, 1.0);
  await wait(Math.max(0, loadStart + loadLen - now()));

  // 4. The crowd: presets.
  const crowdLen = sayAsync('crowd', { lead: 0.1 });
  const crowdStart = now();
  await clickApp('.chip', 'Positive');
  await wait(0.9);
  await clickApp('.chip', 'Negative', 0, 0.5);
  await wait(0.9);
  await clickApp('.chip', 'Polarized', 0, 0.5);
  await wait(Math.max(0.6, crowdStart + crowdLen - now()));

  // 5. Moods: bell curve, drag the average mood up.
  const moodLen = sayAsync('mood', { lead: 0.1 });
  const moodStart = now();
  await clickApp('.seg button', 'Bell curve', 0, 0.6);
  await wait(0.4);
  await dragSlider('Average mood', 0.84, 1.6);
  await wait(Math.max(0.4, moodStart + moodLen - now()));

  // 6. Tendency on the recommend question.
  const tendLen = sayAsync('tendency', { lead: 0.1 });
  const tendStart = now();
  await appScrollTo('.qcard', 'How likely are you to recommend', 60, 1.1);
  await clickApp('.qcard .qhead', 'How likely are you to recommend', 0, 0.6);
  await wait(0.5);
  await clickApp('.seg button', 'Tendency', 0, 0.6);
  await wait(0.5);
  await dragSlider('Tendency strength', 0.92, 1.3);
  await wait(Math.max(0.4, tendStart + tendLen - now()));

  // 7. AI crowd.
  const aiLen = sayAsync('ai', { lead: 0.1 });
  const aiStart = now();
  await appScroll(0, 0.6);
  await clickApp('.tab', 'Data', 0, 0.6);
  await wait(0.5);
  await clickApp('.chip', 'Loyal fans', 0, 0.6);
  const people = ['input[aria-label="Number of people"]', null, 0];
  await moveTo(() => appCenter(...people), 0.5);
  await click(people);
  await appDo(people, 'focus');
  await appDo(people, 'value', '');
  await wait(0.15);
  for (const typed of ['1', '16']) {
    await appDo(people, 'value', typed);
    await wait(0.12);
  }
  await appDo(people, 'change');
  await wait(0.25);
  await clickApp('button', 'Write the crowd', 0, 0.6);
  for (let batch = 0; batch < 2; batch++) {
    await until(() => queues.ai.length > 0, 'the AI crowd request');
    await wait(1.1);
    const e = queues.ai.shift();
    await fulfill(e, JSON.stringify(crowdReply(JSON.parse(e.request.postData ?? '{}'), batch * 8)), 'application/json');
  }
  await until(async () => !!(await app('.persona')), 'the personas');
  await setCursor(cursor.x + 60, cursor.y + 120);
  await appScrollTo('.persona-list', null, 150, 0.9);
  await wait(Math.max(0.6, aiStart + aiLen - now()));

  // 8. Preview.
  const prevLen = sayAsync('preview', { lead: 0.1 });
  const prevStart = now();
  await appScroll(0, 0.5);
  await clickApp('.tab', 'Preview', 0, 0.55);
  await wait(0.6);
  await appScrollTo('.resp', null, 70, 1.2);
  await appScroll((await S(() => stage.appWindow().scrollY)) + 380, 1.6);
  await wait(Math.max(0.3, prevStart + prevLen - now()));

  // 9. Run: pace, send, and watch the results tilt.
  await appScroll(0, 0.5);
  await clickApp('.tab', 'Run', 0, 0.55);
  await wait(0.5);
  const runAt = now();
  const runLen = sayAsync('run', { lead: 0.1, tail: 0.6 });
  const runStart = now();
  await dragSlider('Speed', 0.78, 1.1);
  await clickApp('.chip', '50', 0, 0.5);
  await wait(0.3);
  sfx('whoosh', now());
  await settle(cameraTo(1015, 560, 1.06, 1.3));
  await S(() => {
    stage.dimPage(false);
    stage.showResults(true);
  });
  await wait(0.3);
  await clickApp('button.primary', 'Send 50', 0, 0.7);
  await settle(pumpPosts(0.11, 50));
  const runEnd = now();
  await wait(Math.max(0.8, runStart + runLen - now()));
  await wait(0.6);

  // 10. End card.
  sfx('whoosh', now() - 0.2);
  await setCursor(cursor.x, cursor.y, false);
  await S(() => stage.scene('end'));
  sfx('chime', now() + 0.35);
  const outroAt = now();
  await say('outro', { lead: 0.6, tail: 1.6, caption: false });
  const total = now();

  encoder?.stdin.end();
  await encoded;
  await browser.close();
  console.log(`\nVideo frames done: ${total.toFixed(1)}s, ${frame} frames`);

  writeFileSync(join(work, DRAFT ? 'timeline-draft.json' : 'timeline.json'), JSON.stringify({ total, frames: frame, voPlan, fx, marks: { titleAt, mainAt, runAt, runEnd, outroAt } }, null, 1));

  /* -------------------------------------------------------------- audio -- */
  const musicWav = join(work, 'music.wav');
  const fxWav = join(work, 'fx.wav');
  renderMusic(musicWav, total, { titleAt, mainAt, runAt, runEnd, outroAt });
  renderFx(fxWav, total, fx);

  const final = join(outDir, DRAFT ? 'crowdfill-showcase-draft.mp4' : 'crowdfill-showcase.mp4');
  const inputs = ['-i', silent, '-i', musicWav, '-i', fxWav];
  const voParts = voPlan.filter((v) => v.file);
  for (const v of voParts) inputs.push('-i', v.file);
  const filters = [];
  if (voParts.length) {
    voParts.forEach((v, i) => {
      const ms = Math.round(v.t * 1000);
      filters.push(`[${i + 3}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`);
    });
    const fmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
    filters.push(`${voParts.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voParts.length}:normalize=0,highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,${fmt},asplit=2[vo][key]`);
    filters.push(`[1:a]${fmt},volume=0.55[mus]`);
    filters.push('[mus][key]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=450:makeup=1[duck]');
    filters.push(`[2:a]${fmt},volume=0.8[fxa]`);
    filters.push('[vo][duck][fxa]amix=inputs=3:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9[out]');
  } else {
    filters.push('[1:a]volume=0.8[mus]');
    filters.push('[2:a]volume=0.8[fxa]');
    filters.push('[mus][fxa]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9[out]');
  }
  execFileSync(
    FFMPEG,
    ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', final],
    { stdio: 'inherit' },
  );
  console.log(`Done: ${final}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

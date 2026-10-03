// End-to-end suite: loads the built extension (dist/) into Chrome for Testing and
// drives the real UI and service worker. All traffic to docs.google.com is
// intercepted and answered locally, so nothing ever reaches Google.
//
//   npm run e2e                      run the suite
//   npm run e2e -- --screenshots     also refresh docs/screenshots/*.png
//   npm run e2e -- --screenshots --dark   and dark twins in .cache/shots-dark
//   HEADFUL=1 npm run e2e            watch it run
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.mjs';
import { SHOWCASE_ID, SHOWCASE_URL, showcaseHtml } from './showcase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const shotsDir = join(root, 'docs', 'screenshots');
const takeShots = process.argv.includes('--screenshots');
const darkShots = process.argv.includes('--dark');
const darkDir = join(root, '.cache', 'shots-dark');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`  FAIL  ${name}\n`, e);
    throw e;
  }
}

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: await chromePath(root),
  headless: !process.env.HEADFUL,
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(process.env.CI ? ['--no-sandbox'] : []),
  ],
  defaultViewport: null,
});

/* ---------------------------------------------- fake docs.google.com -- */
const posts = [];
let postCount = 0;
let failNext = 0;
const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('/background.js'));
const extId = new URL(swTarget.url()).host;
const cdp = await swTarget.createCDPSession();
await cdp.send('Fetch.enable', {
  patterns: [{ urlPattern: 'https://docs.google.com/forms/*' }, { urlPattern: 'https://forms.gle/*' }, { urlPattern: 'https://api.anthropic.com/*' }],
});
const aiRequests = [];
cdp.on('Fetch.requestPaused', async (e) => {
  const reply = (code, body) =>
    cdp.send('Fetch.fulfillRequest', {
      requestId: e.requestId,
      responseCode: code,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from(body).toString('base64'),
    });
  try {
    if (e.request.url.startsWith('https://api.anthropic.com/')) {
      if (e.request.method === 'OPTIONS') {
        return await cdp.send('Fetch.fulfillRequest', {
          requestId: e.requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Headers', value: '*' },
            { name: 'Access-Control-Allow-Methods', value: 'POST' },
          ],
        });
      }
      const body = JSON.parse(e.request.postData ?? '{}');
      aiRequests.push({ url: e.request.url, headers: e.request.headers, body });
      const schema = body.output_config?.format?.schema;
      const text = schema?.properties?.respondents ? JSON.stringify(fakeCrowd(schema, body)) : null;
      const message = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: text ?? JSON.stringify({ answers: ['More oat milk options', 'Faster service at lunch', 'More oat milk options', 'Bigger tables'] }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 40 },
      };
      return await cdp.send('Fetch.fulfillRequest', {
        requestId: e.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
        ],
        body: Buffer.from(JSON.stringify(message)).toString('base64'),
      });
    }
    if (e.request.url.includes('LOGINWALL')) {
      return await reply(200, '<html><form action="https://accounts.google.com/v3/signin/identifier" method="post"></form></html>');
    }
    if (e.request.method === 'POST' && e.request.url.endsWith('/formResponse')) {
      postCount++;
      if (failNext > 0) {
        failNext--;
        return await reply(429, 'Too many requests');
      }
      const raw = e.request.postData ?? (e.request.postDataEntries ?? []).map((x) => Buffer.from(x.bytes ?? '', 'base64').toString()).join('');
      posts.push({ at: Date.now(), body: new URLSearchParams(raw) });
      return await reply(200, '<html><body>Your response has been recorded. <a href="viewform?usp=form_confirm">Submit another response</a></body></html>');
    }
    if (e.request.url.includes(SHOWCASE_ID)) return await reply(200, showcaseHtml());
    return await reply(404, 'not found');
  } catch {
    /* request already gone */
  }
});

// Builds a valid AI crowd reply straight from the JSON schema the extension sent.
function fakeCrowd(schema, body) {
  const n = Number(/Write (\d+) respondents/.exec(body.messages[0].content)?.[1] ?? 1);
  const value = (s, i) => {
    if (s.enum) return s.enum[i % s.enum.length] || s.enum[0];
    if (s.type === 'array') return [value(s.items, i)];
    if (s.type === 'object') return Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, value(v, i)]));
    if (/YYYY-MM-DD/.test(s.description ?? '')) return '2026-05-14';
    if (/HH:MM/.test(s.description ?? '')) return '09:30';
    return `Answer ${i + 1}`;
  };
  const item = schema.properties.respondents.items;
  return {
    respondents: Array.from({ length: n }, (_, i) => ({
      persona: `Persona ${i + 1}: a ${i % 2 ? 'grumpy commuter' : 'cheerful regular'}`,
      ...(item.properties.email ? { email: `person${i + 1}@example.com` } : {}),
      answers: value(item.properties.answers, i),
    })),
  };
}

/* ------------------------------------------------------------- helpers -- */
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
const appUrl = (q = '') => `chrome-extension://${extId}/app.html?tab=1${q}`;
const state = () => page.evaluate(async () => (await chrome.storage.session.get('run')).run ?? null);
const send = (msg) => page.evaluate((m) => chrome.runtime.sendMessage(m), msg);
const clickTab = (label) => page.$$eval('.tab', (tabs, l) => tabs.find((t) => t.textContent.includes(l)).click(), label);
let lastRunId = null;
const waitPhase = async (phases, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await state();
    if (s && s.runId === lastRunId && phases.includes(s.phase)) return s;
    await sleep(150);
  }
  throw new Error(`run never reached ${phases.join('/')}; last: ${JSON.stringify(await state())}`);
};
async function startRun(patch, scheduleAt) {
  const res = await page.evaluate(
    async (patch, scheduleAt, id) => {
      const all = await chrome.storage.local.get([`form:${id}`, `config:${id}`]);
      const config = all[`config:${id}`];
      config.run = { ...config.run, ...patch };
      return chrome.runtime.sendMessage({ type: 'run:start', form: all[`form:${id}`], config, scheduleAt });
    },
    patch,
    scheduleAt ?? null,
    SHOWCASE_ID,
  );
  lastRunId = res?.data?.runId ?? null;
  return res;
}
async function shot(name, { width = 420, height = 900, scheme = 'light' } = {}) {
  if (!takeShots) return;
  mkdirSync(shotsDir, { recursive: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await sleep(350);
  await page.screenshot({ path: join(shotsDir, `${name}.png`) });
  // With --dark, every light screenshot gets a dark twin in .cache/shots-dark (used by the website).
  if (darkShots && scheme === 'light') {
    mkdirSync(darkDir, { recursive: true });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await sleep(450);
    await page.screenshot({ path: join(darkDir, `${name}.png`) });
  }
  await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
}

/* --------------------------------------------------------------- suite -- */
console.log(`Crowdfill e2e, extension ${extId}`);
let exitCode = 0;
try {
  await page.setViewport({ width: 420, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  await step('first run shows the responsible-use notice', async () => {
    await page.goto(appUrl());
    await page.waitForSelector('.dialog');
    const start = await page.$('.dialog .btn.primary');
    assert.equal(await start.evaluate((b) => b.disabled), true, 'button disabled until acknowledged');
    await page.click('.dialog .toggle');
    await page.click('.dialog .btn.primary');
    await page.waitForSelector('.dialog', { hidden: true });
  });

  await step('loads a form from a pasted link', async () => {
    await page.type('form.card input.input', `${SHOWCASE_URL}?usp=sf_link`);
    await page.click('form.card button[type=submit]');
    await page.waitForSelector('.qcard');
    const cards = await page.$$eval('.qcard .qtitle', (els) => els.map((e) => e.textContent.trim()));
    assert.equal(cards.length, 15, `15 question cards + e-mail (got ${cards.length})`);
    assert.ok(cards.some((t) => t.startsWith('Rate the following')));
    const sections = await page.$$eval('.section-label', (els) => els.length);
    assert.equal(sections, 3);
    await sleep(4000); // let the toast fade for clean screenshots
  });

  await step('design view: strategies and live distributions', async () => {
    await shot('design', { height: 1000 });
    const titles = await page.$$eval('.qcard .qtitle', (els) => els.map((e) => e.textContent.trim()));
    const open = async (prefix) => {
      const i = titles.findIndex((t) => t.startsWith(prefix));
      await (await page.$$('.qcard .qhead'))[i].click();
      await sleep(150);
      return (await page.$$('.qcard'))[i];
    };
    const nps = await open('How likely are you to recommend');
    const bars = await nps.$$eval('.dist-row', (rows) => rows.length);
    assert.equal(bars, 11, 'NPS shows 11 options');
    for (const b of await nps.$$('.seg button')) if ((await b.evaluate((x) => x.textContent)) === 'Tendency') await b.click();
    await sleep(200);
    const summary = await nps.$eval('.qsummary', (e) => e.textContent);
    assert.match(summary, /Leans to/);
    await nps.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -110));
    await shot('tendency', { height: 1000 });

    const improve = await open('What could we improve?');
    await improve.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -110));
    const examples = await improve.$$eval('.ellipsis[title]', (els) => els.map((e) => e.title));
    assert.ok(examples.length >= 3 && examples.every((x) => x.length > 10), 'paragraph shows comment examples');
    await shot('text', { height: 1000 });

    // Persist: the tendency choice is saved per form.
    await sleep(500);
    const saved = await page.evaluate(async (id) => (await chrome.storage.local.get(`config:${id}`))[`config:${id}`].questions['17'].choice.mode, SHOWCASE_ID);
    assert.equal(saved, 'tendency');
  });

  await step('crowd presets reshape persona questions', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.$$eval('.chip', (c) => c.find((x) => x.textContent === 'Positive').click());
    await sleep(600);
    const persona = await page.evaluate(async (id) => (await chrome.storage.local.get(`config:${id}`))[`config:${id}`].persona, SHOWCASE_ID);
    assert.ok(persona.mean >= 75);
    await page.$$eval('.chip', (c) => c.find((x) => x.textContent === 'Realistic').click());
  });

  await step('preview generates valid, branching responses', async () => {
    await clickTab('Preview');
    await page.waitForSelector('.resp');
    const heads = await page.$$eval('.resp-head', (els) => els.map((e) => e.textContent));
    assert.ok(heads.length >= 10);
    assert.ok(heads.some((h) => h.includes('sections 1, 2, 3')) && heads.some((h) => h.includes('sections 1, 3')), 'both branches occur');
    await sleep(3500);
    await shot('preview', { height: 1000 });
    await shot('preview-wide', { width: 1280, height: 860 });
  });

  await step('runs submissions with retry, pacing and exact payloads', async () => {
    failNext = 1; // the first POST gets HTTP 429 and must be retried
    const res = await startRun({ count: 8, delayMin: 0.05, delayMax: 0.15, concurrency: 2, retries: 2, seed: 'e2e' });
    assert.equal(res.ok, true, JSON.stringify(res));
    await clickTab('Run');
    const s = await waitPhase(['done', 'error']);
    assert.equal(s.phase, 'done', s.lastError);
    assert.equal(s.ok, 8);
    assert.equal(posts.length, 8);
    assert.equal(postCount, 9, 'one retried request');
    for (const { body } of posts) {
      assert.ok(body.get('entry.1001'), 'name present');
      const age = Number(body.get('entry.1002') ?? 30);
      assert.ok(age >= 16 && age <= 99, `age passes validation (${age})`);
      assert.ok(body.getAll('entry.1005').length >= 1, 'at least one order item');
      for (const row of ['1007', '1008', '1009', '1010']) assert.ok(['Poor', 'Fair', 'Good', 'Excellent'].includes(body.get(`entry.${row}`)));
      assert.match(body.get('emailAddress'), /@/);
      const ph = body.get('pageHistory');
      assert.ok(ph === '0,1,2' || ph === '0,2', `valid path ${ph}`);
      assert.equal(ph === '0,1,2', body.get('entry.1013') === 'Yes, sign me up', 'branch matches answer');
      assert.equal(body.has('entry.1014'), ph === '0,1,2', 'loyalty answers only when visited');
      assert.equal(body.get('fbzx'), '-4815162342108');
      assert.ok(body.has('entry.1004_year') && body.has('entry.1004_month') && body.has('entry.1004_day'));
    }
    await sleep(300);
    await shot('run', { height: 1000 });
  });

  await step('same seed reproduces the same responses', async () => {
    const first = posts.map((p) => p.body.toString()).sort();
    posts.length = 0;
    await send({ type: 'run:dismiss' });
    await startRun({ count: 8, delayMin: 0, delayMax: 0, concurrency: 1, seed: 'e2e' });
    await waitPhase(['done']);
    assert.deepEqual(posts.map((p) => p.body.toString()).sort(), first);
  });

  await step('pause, resume and stop', async () => {
    posts.length = 0;
    await send({ type: 'run:dismiss' });
    await startRun({ count: 40, delayMin: 0.15, delayMax: 0.15, concurrency: 1, seed: '' });
    await sleep(700);
    await send({ type: 'run:pause' });
    await sleep(250);
    const atPause = posts.length;
    await sleep(900);
    assert.equal(posts.length, atPause, 'nothing sent while paused');
    assert.equal((await state()).phase, 'paused');
    await send({ type: 'run:resume' });
    await sleep(700);
    assert.ok(posts.length > atPause, 'continues after resume');
    await send({ type: 'run:stop' });
    const s = await waitPhase(['done']);
    const atStop = posts.length;
    await sleep(600);
    assert.equal(posts.length, atStop, 'nothing sent after stop');
    assert.ok(s.sent < 40);
  });

  await step('stops on a sign-in wall instead of hammering', async () => {
    await send({ type: 'run:dismiss' });
    const res = await page.evaluate(async (id) => {
      const all = await chrome.storage.local.get([`form:${id}`, `config:${id}`]);
      const form = { ...all[`form:${id}`], actionUrl: 'https://docs.google.com/forms/d/e/LOGINWALL/formResponse' };
      const config = all[`config:${id}`];
      config.run = { ...config.run, count: 5, delayMin: 0, delayMax: 0, retries: 2, concurrency: 1 };
      return chrome.runtime.sendMessage({ type: 'run:start', form, config });
    }, SHOWCASE_ID);
    assert.equal(res.ok, true);
    lastRunId = res.data.runId;
    const s = await waitPhase(['error', 'done']);
    assert.equal(s.phase, 'error');
    assert.equal(s.sent, 1, 'stops at the first sign-in wall, without retries');
    assert.match(s.lastError, /signed-in/);
  });

  await step('schedules a run for later', async () => {
    posts.length = 0;
    await send({ type: 'run:dismiss' });
    const at = Date.now() + 6000;
    const res = await startRun({ count: 2, delayMin: 0, delayMax: 0, seed: 'sched' }, at);
    assert.equal(res.data.phase, 'scheduled');
    await sleep(500);
    assert.equal(posts.length, 0);
    await waitPhase(['done'], 30000);
    assert.equal(posts.length, 2);
    assert.ok(posts[0].at >= at - 50, 'did not start early');
  });

  await step('imports a CSV dataset and maps columns', async () => {
    const csv = ['Full name,How did you hear about us?,What did you order?,Rate the following [Service]', 'Ada Lovelace,instagram,"Coffee, Pastry",Excellent', 'Alan Turing,Local event,"Tea, Bubble tea",Fair'].join('\n');
    const file = join(root, '.cache', 'dataset.csv');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, csv);
    await clickTab('Data');
    const input = await page.waitForSelector('input[type=file][accept*=csv]');
    await input.uploadFile(file);
    await page.waitForSelector('.map-table');
    await sleep(600); // config saves are debounced
    const cfg = await page.evaluate(async (id) => (await chrome.storage.local.get(`config:${id}`))[`config:${id}`], SHOWCASE_ID);
    assert.equal(cfg.dataset.rows.length, 2);
    assert.deepEqual(Object.keys(cfg.dataset.mapping).sort(), ['10', '12', '14', '1008'].sort());
    await shot('dataset', { height: 1000 });
    await clickTab('Preview');
    await page.waitForSelector('.resp');
    const first = await page.$eval('.resp', (e) => e.innerText);
    assert.match(first, /Ada Lovelace/);
    assert.match(first, /Instagram/);
    assert.match(first, /Coffee, Pastry/);
    await clickTab('Data');
    await page.$$eval('button', (b) => b.find((x) => x.textContent.trim() === 'Remove').click());
  });

  await step('Claude answer writer builds the right request', async () => {
    await page.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, apiKey: 'sk-ant-test-key', aiModel: 'claude-opus-5-5' } });
    });
    await page.goto(appUrl(`&form=${encodeURIComponent(SHOWCASE_URL)}`));
    await page.waitForSelector('.qcard');
    const titles = await page.$$eval('.qcard .qtitle', (els) => els.map((e) => e.textContent.trim()));
    const i = titles.findIndex((t) => t.startsWith('What could we improve?'));
    await (await page.$$('.qcard .qhead'))[i].click();
    await sleep(500); // let the card open
    const card = (await page.$$('.qcard'))[i];
    const generate = await card.$$('button');
    for (const b of generate) if ((await b.evaluate((x) => x.textContent.trim())) === 'Generate') await b.click();
    await page.waitForFunction(
      (id) => chrome.storage.local.get(`config:${id}`).then((r) => r[`config:${id}`].questions['22'].text.source === 'list'),
      { timeout: 10000 },
      SHOWCASE_ID,
    );
    assert.equal(aiRequests.length, 1);
    const req = aiRequests[0];
    assert.equal(req.headers['x-api-key'], 'sk-ant-test-key');
    assert.match(req.headers['anthropic-beta'] ?? '', /server-side-fallback-2026-07-01/);
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.fallbacks, 'default');
    assert.equal(req.body.output_config.format.type, 'json_schema');
    assert.match(req.body.messages[0].content, /What could we improve\?/);
    await sleep(500);
    const text = await page.evaluate(async (id) => (await chrome.storage.local.get(`config:${id}`))[`config:${id}`].questions['22'].text, SHOWCASE_ID);
    assert.deepEqual(text.list, ['More oat milk options', 'Faster service at lunch', 'Bigger tables'], 'deduplicated answers');
    assert.equal(text.listOrder, 'shuffle');
  });

  await step('speed slider updates the live numbers', async () => {
    await clickTab('Run');
    const slider = await page.waitForSelector('input[aria-label="Speed"]');
    const readout = () => page.$eval('.speed-readout', (e) => e.innerText.replace(/\s+/g, ' '));
    const setSpeed = (v) => slider.evaluate((el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    await setSpeed(0);
    await sleep(700);
    const slow = await readout();
    await setSpeed(8);
    await sleep(700);
    const fast = await readout();
    assert.notEqual(slow, fast);
    assert.match(slow, /20(\.0)? to 45 ?s/i);
    const cfg = await page.evaluate(async (id) => (await chrome.storage.local.get(`config:${id}`))[`config:${id}`].run, SHOWCASE_ID);
    assert.equal(cfg.delayMin, 0.15);
    await setSpeed(4);
    await page.$eval('input[aria-label="Number of responses"]', (el) => {
      el.value = '100';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await send({ type: 'run:dismiss' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(900);
    await shot('speed', { height: 1000 });
  });

  await step('AI crowd writes respondents and runs use them', async () => {
    await clickTab('Data');
    const write = await page.waitForFunction(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Write the crowd')));
    await page.$eval('input[aria-label="Number of people"]', (el) => {
      el.value = '10';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const before = aiRequests.length;
    await write.click();
    await page.waitForFunction(() => [...document.querySelectorAll('b')].some((b) => /10 people ready/.test(b.textContent)), { timeout: 15000 });
    const crowdCalls = aiRequests.slice(before);
    assert.equal(crowdCalls.length, 2, 'batches of 8 + 2');
    const schema = crowdCalls[0].body.output_config.format.schema;
    const answers = schema.properties.respondents.items.properties.answers;
    assert.deepEqual(answers.properties.q12.enum, ['Friend or family', 'Instagram', 'Google search', 'Walked past', 'Local event']);
    assert.equal(answers.properties.q16.type, 'object', 'grid rows as an object');
    assert.match(crowdCalls[1].body.messages[0].content, /Already written/);
    await sleep(600);
    await shot('ai-crowd', { height: 1000 });
    await clickTab('Preview');
    await page.waitForSelector('.resp');
    const head = await page.$eval('.resp-head', (e) => e.innerText);
    assert.match(head, /cheerful regular/);
    const firstCard = await page.$eval('.resp', (e) => e.innerText);
    assert.match(firstCard, /Answer 1/);
    await clickTab('Data');
    await page.$$eval('button', (b) => b.find((x) => x.textContent.trim() === 'Clear').click());
  });

  await step('settings drawer and dark theme', async () => {
    await sleep(3500); // let toasts clear
    await clickTab('Design');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('design-dark', { height: 1000, scheme: 'dark' });
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector('.drawer');
    await shot('settings', { height: 1000 });
    await page.click('button[aria-label="Close settings"]');
  });

  await step('no runtime errors in the UI', async () => {
    assert.deepEqual(pageErrors, []);
  });

  console.log(`\n${passed} passed`);
} catch {
  exitCode = 1;
  console.error(`\n${passed} passed, 1 failed`);
} finally {
  await browser.close();
}
process.exit(exitCode);

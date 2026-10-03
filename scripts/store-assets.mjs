// Makes the Chrome Web Store images from the app screenshots in docs/screenshots.
//   npm run screenshots   (refresh the app screenshots first)
//   npm run store-assets  (writes docs/store/*.png)
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { chromePath } from '../e2e/chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'docs', 'screenshots');
const out = join(root, 'docs', 'store');
mkdirSync(out, { recursive: true });

const img = (name) => `data:image/png;base64,${readFileSync(join(shots, `${name}.png`)).toString('base64')}`;
const font = `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64')}`;
const logo = readFileSync(join(root, 'static/icons/icon.svg'), 'utf8');

const BASE = `
  @font-face { font-family: Inter; font-weight: 100 900; src: url(${font}) format('woff2-variations'); }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Inter, sans-serif; color: #fff; overflow: hidden; -webkit-font-smoothing: antialiased; font-feature-settings: 'cv11', 'ss01'; }
  .bg { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 15% 0%, #6d5cf7 0%, transparent 60%), radial-gradient(900px 600px at 100% 100%, #a24df2 0%, transparent 55%), #17123a; }
  .grain { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px); background-size: 22px 22px; }
  .logo svg { width: 100%; height: 100%; filter: drop-shadow(0 10px 30px rgba(0,0,0,.35)); }
  .shot { border-radius: 22px; box-shadow: 0 40px 80px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.12); }
`;

const slide = ({ kicker, title, text, shot, wide }) => `
<style>${BASE}
  .wrap { position: relative; width: 1280px; height: 800px; display: grid; grid-template-columns: ${wide ? '400px 1fr' : '1fr 470px'}; align-items: center; gap: 56px; padding: 0 80px; }
  .copy { position: relative; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; font-weight: 700; font-size: 22px; letter-spacing: -0.02em; }
  .brand .logo { width: 40px; height: 40px; }
  .kicker { display: inline-block; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.12); font-size: 14px; font-weight: 600; letter-spacing: .02em; margin-bottom: 18px; }
  h1 { font-size: ${wide ? 46 : 58}px; line-height: 1.04; letter-spacing: -0.04em; font-weight: 750; margin-bottom: 20px; }
  p { font-size: 20px; line-height: 1.5; color: rgba(255,255,255,.75); max-width: 470px; }
  .frame { position: relative; display: flex; justify-content: center; align-items: center; height: 800px; }
  .frame img { ${wide ? 'width: 100%; max-height: 640px; object-fit: cover; object-position: top left;' : 'height: 700px; margin-top: 100px; object-fit: cover; object-position: top;'} }
</style>
<div class="bg"></div><div class="grain"></div>
<div class="wrap">
  <div class="copy">
    <div class="brand"><span class="logo">${logo}</span>Crowdfill</div>
    <span class="kicker">${kicker}</span>
    <h1>${title}</h1>
    <p>${text}</p>
  </div>
  <div class="frame"><img class="shot" src="${img(shot)}"></div>
</div>`;

const SLIDES = [
  { file: 'screenshot-1-tendency', kicker: 'Tendency', title: 'Make your form lean the way you want.', text: 'Pick an answer, set the strength, and watch the distribution move. Scales spread naturally onto the neighbouring answers.', shot: 'tendency' },
  { file: 'screenshot-2-crowd', kicker: 'Crowd', title: 'Give the crowd a mood.', text: 'Happy, unhappy or split in two. Every answer from one person fits together, from ratings to written comments.', shot: 'design' },
  { file: 'screenshot-3-ai', kicker: 'AI crowd', title: 'Let Claude write the people.', text: 'Describe customer types, moods and biases. Each respondent answers the whole form in character.', shot: 'ai-crowd' },
  { file: 'screenshot-4-speed', kicker: 'Run', title: 'Set the pace and watch the numbers.', text: 'Drag from Gentle to Max and see the wait, the rate and the total time change live. Runs keep going in the background.', shot: 'speed' },
  { file: 'screenshot-5-preview', kicker: 'Preview', title: 'See every answer before it is sent.', text: 'Generate hundreds of responses on the spot, check the spread, export to CSV.', shot: 'preview-wide', wide: true },
];

const smallTile = `
<style>${BASE}
  .wrap { position: relative; width: 440px; height: 280px; display: flex; flex-direction: column; justify-content: center; padding: 0 36px; }
  .logo { width: 56px; height: 56px; margin-bottom: 18px; }
  h1 { font-size: 34px; letter-spacing: -0.035em; font-weight: 750; }
  p { margin-top: 6px; font-size: 16px; color: rgba(255,255,255,.75); }
</style>
<div class="bg"></div><div class="grain"></div>
<div class="wrap"><span class="logo">${logo}</span><h1>Crowdfill</h1><p>Google Forms responses with a tendency</p></div>`;

const marquee = `
<style>${BASE}
  .wrap { position: relative; width: 1400px; height: 560px; display: grid; grid-template-columns: 1fr 640px; align-items: center; padding: 0 80px; gap: 40px; }
  .logo { width: 64px; height: 64px; margin-bottom: 24px; display: block; }
  h1 { font-size: 60px; line-height: 1.02; letter-spacing: -0.04em; font-weight: 750; }
  p { margin-top: 18px; font-size: 21px; line-height: 1.5; color: rgba(255,255,255,.75); max-width: 520px; }
  .frame { height: 560px; overflow: hidden; display: flex; align-items: flex-start; padding-top: 70px; }
  .frame img { width: 640px; }
</style>
<div class="bg"></div><div class="grain"></div>
<div class="wrap">
  <div><span class="logo">${logo}</span><h1>Responses with a tendency.</h1><p>Fill your Google Forms with realistic people who lean the way you choose.</p></div>
  <div class="frame"><img class="shot" src="${img('preview-wide')}"></div>
</div>`;

const thumbnail = `
<style>${BASE}
  .wrap { position: relative; width: 1280px; height: 720px; display: grid; grid-template-columns: 1fr 520px; align-items: center; gap: 30px; padding: 0 70px; }
  .logo { width: 84px; height: 84px; display: block; margin-bottom: 26px; }
  h1 { font-size: 78px; line-height: 0.98; letter-spacing: -0.045em; font-weight: 800; }
  h1 em { font-style: normal; background: linear-gradient(90deg, #a5a6ff, #e0a8ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tag { display: inline-block; margin-top: 26px; padding: 10px 18px; border-radius: 999px; background: rgba(255,255,255,.14); font-size: 22px; font-weight: 650; }
  .frame { height: 720px; display: flex; align-items: center; }
  .frame img { width: 520px; transform: rotate(-2deg); }
</style>
<div class="bg"></div><div class="grain"></div>
<div class="wrap">
  <div><span class="logo">${logo}</span><h1>Google Forms responses <em>with a tendency</em></h1><span class="tag">Free Chrome extension</span></div>
  <div class="frame"><img class="shot" src="${img('tendency')}"></div>
</div>`;

// YouTube thumbnails, three variants for YouTube's "Test & compare".
const thumbA = `
<style>${BASE}
  .wrap { position: relative; width: 1280px; height: 720px; display: grid; grid-template-columns: 1fr 560px; align-items: center; gap: 20px; padding: 0 64px; }
  .logo { width: 76px; height: 76px; display: block; margin-bottom: 26px; }
  h1 { font-size: 112px; line-height: 0.95; letter-spacing: -0.05em; font-weight: 850; }
  h1 em { font-style: normal; background: linear-gradient(90deg, #b3b4ff, #e7b3ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tag { display: inline-block; margin-top: 28px; padding: 12px 20px; border-radius: 14px; background: #fff; color: #2b1d6e; font-size: 26px; font-weight: 750; }
  .card { width: 560px; border-radius: 26px; transform: rotate(2.5deg); box-shadow: 0 40px 90px -20px rgba(0,0,0,.65), 0 0 0 6px rgba(255,255,255,.12); }
</style>
<div class="bg"></div><div class="grain"></div>
<div class="wrap">
  <div><span class="logo">${logo}</span><h1>Auto-fill <em>Google Forms</em></h1><span class="tag">with realistic people</span></div>
  <img class="card" src="${img('results-crop')}">
</div>`;

const bars = (values, color) =>
  `<div class="bars">${values.map((v) => `<i style="height:${v}%;background:${color}"></i>`).join('')}</div>`;

const thumbB = `
<style>${BASE}
  .wrap { position: relative; width: 1280px; height: 720px; padding: 56px 64px; }
  h1 { font-size: 104px; line-height: 0.95; letter-spacing: -0.05em; font-weight: 850; }
  h1 em { font-style: normal; background: linear-gradient(90deg, #b3b4ff, #e7b3ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .row { position: absolute; left: 64px; right: 64px; bottom: 56px; display: grid; grid-template-columns: 1fr 120px 1fr; align-items: center; }
  .panel { padding: 26px 30px 22px; border-radius: 26px; background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.14); }
  .panel.hot { background: #fff; border-color: #fff; box-shadow: 0 30px 80px -20px rgba(140,110,255,.7); }
  .bars { display: flex; align-items: flex-end; gap: 16px; height: 230px; }
  .bars i { flex: 1; border-radius: 10px 10px 4px 4px; }
  .label { margin-top: 16px; font-size: 30px; font-weight: 750; color: rgba(255,255,255,.75); }
  .hot .label { color: #2b1d6e; }
  .arrow { justify-self: center; width: 84px; height: 84px; border-radius: 50%; background: linear-gradient(135deg, #5b5bf6, #a24df2); display: grid; place-items: center; box-shadow: 0 16px 40px -10px rgba(140,110,255,.8); }
  .arrow svg { width: 44px; height: 44px; stroke: #fff; stroke-width: 3.2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .logo { position: absolute; right: 64px; top: 56px; width: 76px; height: 76px; }
</style>
<div class="bg"></div><div class="grain"></div>
<div class="wrap">
  <span class="logo">${logo}</span>
  <h1>Make results<br><em>lean your way</em></h1>
  <div class="row">
    <div class="panel">${bars([46, 58, 41, 52, 48], 'rgba(255,255,255,.35)')}<div class="label">Random</div></div>
    <div class="arrow"><svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></div>
    <div class="panel hot">${bars([8, 14, 30, 72, 100], 'linear-gradient(180deg,#8b6cf6,#5b3fd9)')}<div class="label">Your tendency</div></div>
  </div>
</div>`;

const browser = await puppeteer.launch({ executablePath: await chromePath(root), headless: true });
try {
  const page = await browser.newPage();
  const render = async (html, file, width, height) => {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${file}.png`) });
    console.log(`docs/store/${file}.png`);
  };
  for (const s of SLIDES) await render(slide(s), s.file, 1280, 800);
  await render(smallTile, 'promo-small-440x280', 440, 280);
  await render(marquee, 'promo-marquee-1400x560', 1400, 560);
  await render(thumbA, 'youtube-thumbnail-a-autofill', 1280, 720);
  await render(thumbB, 'youtube-thumbnail-b-tendency', 1280, 720);
  await render(thumbnail, 'youtube-thumbnail-c-slider', 1280, 720);
} finally {
  await browser.close();
}

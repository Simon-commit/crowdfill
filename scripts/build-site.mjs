// Refreshes Crowdfill's files inside a checkout of the dyrt.io site (github.com/Simon-commit/dyrt-site).
//   npm run site -- ../dyrt-site
//
// The page itself, public/crowdfill/index.html, is written by hand in that repository. This script
// fills in everything that comes from here, so the two never drift apart:
//   - the policy pages, rendered from legal/*.md into the site's own page shell
//   - the screenshots, light and dark (run `npm run e2e -- --screenshots --dark` first)
//   - the showcase video, its captions and poster (run `npm run video` first)
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer-core';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { chromePath } from '../e2e/chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(process.argv[2] ?? join(root, '..', 'dyrt-site'));
const out = join(site, 'public', 'crowdfill');
const pagePath = join(out, 'index.html');
if (!existsSync(pagePath)) {
  console.error(`No Crowdfill page at ${pagePath}. Pass the path to a dyrt-site checkout.`);
  process.exit(1);
}

/* ------------------------------------------------------------ policies -- */
const POLICIES = [
  { id: 'privacy', crumb: 'Privacy', title: 'Crowdfill privacy policy', description: 'How Crowdfill handles data: no servers, no tracking, and everything it saves stays in your browser.' },
  { id: 'terms', crumb: 'Terms', title: 'Crowdfill terms of use', description: 'The terms for using Crowdfill, the Google Forms extension published by dyrt.' },
  { id: 'acceptable-use', crumb: 'Acceptable use', title: 'Crowdfill acceptable use policy', description: 'What Crowdfill may and may not be used for. It is made for forms you own or have permission to test.' },
];

// The shell (head, sprite, header, footer) is taken from the Crowdfill page, so it always matches the site.
const page = readFileSync(pagePath, 'utf8');
const head = page.slice(0, page.indexOf('</head>'));
const top = page.slice(page.indexOf('<body>'), page.indexOf('  <main id="main">'));
const bottom = page.slice(page.indexOf('</main>') + '</main>'.length);
const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

for (const policy of POLICIES) {
  const md = readFileSync(join(root, 'legal', `${policy.id}.md`), 'utf8');
  const effective = /^Effective (.+)$/m.exec(md)?.[1];
  if (!effective) throw new Error(`legal/${policy.id}.md has no "Effective" line`);
  const body = marked
    .parse(md.replace(/^# .+$/m, '').replace(/^Effective .+$/m, ''))
    .replace(/href="(privacy|terms|acceptable-use)\.html"/g, 'href="/crowdfill/$1/"')
    .trim()
    .replace(/^/gm, '        ');
  const url = `https://dyrt.io/crowdfill/${policy.id}/`;
  const pageHead = head
    .replace(/<title>.*<\/title>/, `<title>${policy.title} \u00b7 dyrt</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escape(policy.description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${policy.title}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escape(policy.description)}`)
    .replace(/<script[^>]*>.*<\/script>\n/g, '');
  const others = POLICIES.filter((p) => p !== policy)
    .map((p) => `<a href="/crowdfill/${p.id}/">${p.title.replace('Crowdfill ', '').replace(/^./, (c) => c.toUpperCase())}</a>`)
    .join('');
  const html = `${pageHead}</head>
${top}  <main id="main">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/#work">Work</a><span aria-hidden="true">/</span><a href="/crowdfill/">Crowdfill</a><span aria-hidden="true">/</span><span aria-current="page">${policy.crumb}</span>
    </nav>

    <article class="legal" aria-labelledby="legal-title">
      <header class="legal-head">
        <p class="eyebrow">Crowdfill &middot; Legal</p>
        <h1 id="legal-title">${policy.title}</h1>
        <p class="legal-meta">Effective ${effective}. Applies to Crowdfill, the Chrome extension published by dyrt.</p>
      </header>
      <div class="legal-body">
${body}
      </div>
      <nav class="legal-nav" aria-label="Crowdfill policies"><a href="/crowdfill/">About Crowdfill</a>${others}</nav>
    </article>
  </main>${bottom}`;
  mkdirSync(join(out, policy.id), { recursive: true });
  writeFileSync(join(out, policy.id, 'index.html'), html);
  console.log(`${policy.id}/index.html`);
}

/* --------------------------------------------------------- screenshots -- */
// Chrome does the WebP encoding, so no extra image tooling is needed.
const light = join(root, 'docs', 'screenshots');
const dark = join(root, '.cache', 'shots-dark');
const SHOTS = [
  { from: 'design', to: 'crowd', crop: 1180 },
  { from: 'ai-crowd', to: 'ai', crop: 1180 },
  { from: 'speed', to: 'speed', crop: 1180 },
  { from: 'preview-wide', to: 'preview', width: 1600 },
];

if (!existsSync(join(dark, 'design.png'))) {
  console.log('Skipping screenshots: run `npm run e2e -- --screenshots --dark` first.');
} else {
  const browser = await puppeteer.launch({ executablePath: await chromePath(root), headless: true });
  const tab = await browser.newPage();
  const webp = (file, { crop, width, quality = 0.9 }) =>
    tab.evaluate(
      async (src, crop, width, quality) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const sw = img.naturalWidth;
        const sh = Math.min(crop ?? img.naturalHeight, img.naturalHeight);
        const w = width ?? sw;
        const h = Math.round((sh / sw) * w);
        const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, sw, sh, 0, 0, w, h);
        return canvas.toDataURL('image/webp', quality).split(',')[1];
      },
      `data:image/png;base64,${readFileSync(file).toString('base64')}`,
      crop,
      width,
      quality,
    );
  mkdirSync(join(out, 'shots'), { recursive: true });
  for (const shot of SHOTS) {
    for (const [theme, dir] of [['light', light], ['dark', dark]]) {
      const name = `${shot.to}-${theme}.webp`;
      writeFileSync(join(out, 'shots', name), Buffer.from(await webp(join(dir, `${shot.from}.png`), shot), 'base64'));
      console.log(`shots/${name}`);
    }
  }
  const poster = join(light, 'results-frame.png');
  if (existsSync(poster)) {
    writeFileSync(join(out, 'showcase-poster.webp'), Buffer.from(await webp(poster, { width: 1600, quality: 0.86 }), 'base64'));
    console.log('showcase-poster.webp');
  }
  await browser.close();
}

/* ---------------------------------------------------------------- video -- */
const video = join(root, 'release', 'crowdfill-showcase.mp4');
const captions = join(root, 'release', 'crowdfill-showcase.srt');
if (!existsSync(video)) {
  console.log('Skipping the video: run `npm run video` first.');
} else {
  // 1080p at 30 fps is about a third of the size of the 60 fps master and looks the same in a page.
  execFileSync(ffmpeg.path, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', video,
    '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    join(out, 'showcase.mp4'),
  ]);
  console.log('showcase.mp4');
  const vtt = readFileSync(captions, 'utf8')
    .replace(/\r/g, '')
    .replace(/^\d+\n(?=\d\d:)/gm, '')
    .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
  writeFileSync(join(out, 'showcase.vtt'), `WEBVTT\n\n${vtt.trim()}\n`);
  console.log('showcase.vtt');
}

// The link preview image.
cpSync(join(root, 'docs', 'store', 'youtube-thumbnail-b-tendency.png'), join(out, 'og.png'));
console.log(`og.png\nCrowdfill files refreshed in ${out}`);

// Bundles the extension into dist/ (and optionally a store-ready zip).
//   node scripts/build.mjs           production build
//   node scripts/build.mjs --watch   rebuild on change (unminified, sourcemaps)
//   node scripts/build.mjs --zip     production build + release/crowdfill-<version>.zip
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { marked } from 'marked';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function copyStatic() {
  cpSync(join(root, 'static'), dist, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, 'static', 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Bundle the Inter font locally: extensions shouldn't load fonts from the network.
  const fonts = join(root, 'node_modules', '@fontsource-variable', 'inter', 'files');
  mkdirSync(join(dist, 'fonts'), { recursive: true });
  cpSync(join(fonts, 'inter-latin-wght-normal.woff2'), join(dist, 'fonts', 'inter-latin.woff2'));
  cpSync(join(fonts, 'inter-latin-ext-wght-normal.woff2'), join(dist, 'fonts', 'inter-latin-ext.woff2'));

  renderLegal();
}

const LEGAL = [
  ['terms', 'Terms of Use'],
  ['privacy', 'Privacy Policy'],
  ['acceptable-use', 'Acceptable Use'],
  ['licenses', 'Licenses'],
];

// Renders legal/*.md into standalone pages, shipped in the extension and ready to host on the website.
function renderLegal() {
  const out = join(dist, 'legal');
  mkdirSync(out, { recursive: true });
  const icon = readFileSync(join(root, 'static', 'icons', 'icon.svg'), 'utf8');
  for (const [id, title] of LEGAL) {
    const body = marked.parse(readFileSync(join(root, 'legal', `${id}.md`), 'utf8'));
    const nav = LEGAL.map(([other, label]) => `<a href="${other}.html"${other === id ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    writeFileSync(join(out, `${id}.html`), LEGAL_TEMPLATE.replace('{{title}}', title).replace('{{icon}}', icon).replace('{{nav}}', nav).replace('{{body}}', body));
  }
}

const LEGAL_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}} | Crowdfill</title>
<style>
  @font-face { font-family: 'Inter'; font-weight: 100 900; font-display: swap; src: url('../fonts/inter-latin.woff2') format('woff2-variations'); }
  :root { --bg: #f4f4f8; --surface: #fff; --text: #15151d; --text-2: #55556b; --text-3: #8b8ba0; --border: rgba(24,24,60,.09); --accent: #5b5bf6; --accent-text: #4545dc; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b0b10; --surface: #14141b; --text: #ececf4; --text-2: #a7a7bb; --text-3: #707088; --border: rgba(255,255,255,.08); --accent: #8486ff; --accent-text: #a8a9ff; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: radial-gradient(900px 340px at 50% -160px, rgba(91,91,246,.1), transparent 70%), var(--bg); background-repeat: no-repeat; color: var(--text); font: 15px/1.65 Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; letter-spacing: -0.006em; -webkit-font-smoothing: antialiased; }
  header { max-width: 760px; margin: 0 auto; padding: 28px 22px 0; display: flex; align-items: center; gap: 12px; }
  header svg { width: 34px; height: 34px; filter: drop-shadow(0 4px 10px rgba(91,91,246,.35)); }
  header b { font-size: 16px; letter-spacing: -0.02em; }
  header span { color: var(--text-3); font-size: 13px; }
  nav { max-width: 760px; margin: 18px auto 0; padding: 0 22px; display: flex; flex-wrap: wrap; gap: 6px; }
  nav a { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-2); text-decoration: none; font-size: 13px; font-weight: 550; }
  nav a[aria-current] { color: var(--accent-text); border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  main { max-width: 760px; margin: 22px auto 60px; padding: 34px 38px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
  h1 { margin: 0 0 4px; font-size: 30px; letter-spacing: -0.03em; line-height: 1.15; }
  h1 + p { margin-top: 0; color: var(--text-3); }
  h2 { margin: 30px 0 8px; font-size: 18px; letter-spacing: -0.02em; }
  p, li { color: var(--text-2); }
  strong { color: var(--text); }
  a { color: var(--accent-text); text-underline-offset: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--text); font-weight: 600; }
  footer { max-width: 760px; margin: 0 auto 40px; padding: 0 22px; color: var(--text-3); font-size: 13px; }
  @media (max-width: 600px) { main { padding: 24px 20px; border-radius: 14px; margin: 16px 12px 40px; } h1 { font-size: 25px; } }
</style>
</head>
<body>
<header>{{icon}}<div><b>Crowdfill</b><br><span>by dyrt.io</span></div></header>
<nav>{{nav}}</nav>
<main>{{body}}</main>
<footer>Crowdfill is made by dyrt.io. Questions? <a href="mailto:support@dyrt.io">support@dyrt.io</a></footer>
</body>
</html>
`;

const common = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: ['chrome116'],
  legalComments: 'none',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
    // Set "repository" in package.json to show a "Source" link in Settings.
    __REPO_URL__: JSON.stringify(typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '').replace(/^git\+|\.git$/g, '')),
  },
};

const builds = [
  { ...common, entryPoints: { background: join(root, 'src/background/index.ts') }, format: 'esm', outdir: dist },
  { ...common, entryPoints: { content: join(root, 'src/content/index.ts') }, format: 'iife', outdir: dist },
  {
    ...common,
    entryPoints: { app: join(root, 'src/ui/main.tsx') },
    format: 'esm',
    outdir: dist,
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.svg': 'text' },
    // Fonts are copied next to the bundle, not inlined.
    external: ['*.woff2'],
  },
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyStatic();

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('Watching for changes. Load dist/ as an unpacked extension.');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  if (zip) {
    const out = join(root, 'release');
    mkdirSync(out, { recursive: true });
    const file = join(out, `crowdfill-${pkg.version}.zip`);
    if (existsSync(file)) rmSync(file);
    execFileSync('zip', ['-qr', file, '.'], { cwd: dist, stdio: 'inherit' });
    console.log(`Packaged ${file}`);
  }
}

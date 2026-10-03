// Keeps the project's own text plain: straight quotes, regular hyphens, three dots.
// Fails the check if typographic characters slip into source, docs or legal pages.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', 'release', '.cache', '.git', 'package-lock.json']);
const EXT = /\.(ts|tsx|mjs|js|css|html|md|json|yml|svg)$/;
const BANNED = {
  '\u2014': 'em dash',
  '\u2013': 'en dash',
  '\u201C': 'curly quote',
  '\u201D': 'curly quote',
  '\u2018': 'curly apostrophe',
  '\u2019': 'curly apostrophe',
  '\u2026': 'ellipsis character',
  '\u2192': 'arrow',
  '\u2190': 'arrow',
  '\u2248': 'approx sign',
  '\u2265': 'greater-or-equal sign',
  '\u2264': 'less-or-equal sign',
  '\u00B7': 'middle dot',
};
const pattern = new RegExp(`[${Object.keys(BANNED).join('')}]`, 'g');

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXT.test(name)) yield path;
  }
}

let problems = 0;
for (const file of files(root)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(pattern)) {
        problems++;
        console.log(`${relative(root, file)}:${i + 1}: ${BANNED[m[0]]}`);
      }
    });
}
if (problems) {
  console.log(`\n${problems} typographic character(s) found. Use plain punctuation instead.`);
  process.exit(1);
}
console.log('Text check passed.');

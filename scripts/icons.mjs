// Renders static/icons/icon.svg to the PNG sizes Chrome needs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'static', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
for (const size of [16, 32, 48, 128, 256]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(dir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png`);
}

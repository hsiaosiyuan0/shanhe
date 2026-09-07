import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const svg = readFileSync('public/icon.svg', 'utf8');
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, render(size));
if (process.platform === 'darwin') {
  const iconset = resolve('test-results/Shanhe.iconset');
  mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${size}x${size}.png`), render(size));
    writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'desktop/Shanhe.icns']);
}
console.log('已从 public/icon.svg 生成网页与桌面图标。');

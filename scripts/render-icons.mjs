// Renders assets/icon.svg (and the simplified icon-small.svg for 16/32 px) to the PNG sizes
// the extension and website need, using Playwright's Chromium.
// Run: node scripts/render-icons.mjs   (first time: npx playwright install chromium)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const big = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const small = fs.readFileSync(path.join(root, 'assets/icon-small.svg'), 'utf8');

const targets = [
  ...[16, 32].map((s) => ({ size: s, svg: small, out: [`public/icon/${s}.png`] })),
  ...[48, 96, 128].map((s) => ({ size: s, svg: big, out: [`public/icon/${s}.png`] })),
  { size: 32, svg: small, out: ['website/assets/favicon-32.png'] },
  { size: 180, svg: big, out: ['website/assets/apple-touch-icon.png'] },
  { size: 512, svg: big, out: ['website/assets/icon-512.png'] },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { size, svg, out } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  const png = await page.locator('svg').screenshot({ omitBackground: true });
  for (const file of out) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), png);
  }
}
fs.mkdirSync(path.join(root, 'website/assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets/icon.svg'), path.join(root, 'website/assets/icon.svg'));
await browser.close();
console.log(`Rendered ${targets.length} icons.`);

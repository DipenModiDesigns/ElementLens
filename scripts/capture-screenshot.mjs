// Captures a 1280x800 product screenshot (website hero, store listings): the extension running
// on the ElementLens website itself, with a feature card selected.
// Run after `npm run build`: node scripts/capture-screenshot.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'website');
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'elementlens-shot-'));
fs.cpSync(path.join(root, '.output/chrome-mv3'), ext, { recursive: true });
// Screenshot-only: allow injecting without a real toolbar click.
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));

const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http
  .createServer((req, res) => {
    const file = path.join(site, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(site) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(file));
  })
  .listen(5588);

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  // 2x so the cropped hero image stays sharp on high-DPI screens.
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
await page.goto('http://localhost:5588/index.html#features');
await page.evaluate(() => document.querySelector('#features')?.scrollIntoView());

await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: 'http://localhost:5588/*' });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/picker.js'] });
});
await page.locator('element-lens .el-panel').waitFor();
const card = await page.locator('.card').nth(1).boundingBox();
await page.mouse.click(card.x + 6, card.y + 6);
await page.locator('element-lens .el-preview .el-code').waitFor();
// Hover the card again so the box model overlay is visible in the shot.
await page.locator('element-lens .el-crumb-current').hover();
await page.waitForTimeout(400);

// Website hero: a close-up of the selected card and the panel (880x800 CSS px, rendered at 2x).
const hero = path.join(site, 'assets/screenshot.png');
await page.screenshot({ path: hero, clip: { x: 400, y: 0, width: 880, height: 800 } });

// Website lightbox (zoom): the full view at 2x.
await page.screenshot({ path: path.join(site, 'assets/screenshot-full.png') });

// Store listings: the full view at exactly 1280x800, as the stores require.
const store = path.join(root, 'assets/store/screenshot-1280x800.png');
fs.mkdirSync(path.dirname(store), { recursive: true });
await page.screenshot({ path: store, scale: 'css' });
console.log(`Saved ${path.relative(root, hero)} and ${path.relative(root, store)}`);

server.close();
await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
fs.rmSync(ext, { recursive: true, force: true });
process.exit(0);

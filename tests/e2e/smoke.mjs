import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Smoke test: loads the production Chromium build into Playwright's Chromium and drives the picker.
// Run with `npm run test:e2e` (builds first). Screenshots and outputs land in tests/e2e/.artifacts/.
// Never hang CI or a terminal: fail hard if the run takes too long.
setTimeout(() => {
  console.log('FAIL  watchdog: test run exceeded 120s');
  process.exit(2);
}, 120_000).unref();

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../.output/chrome-mv3');
// Unique per run, so a lingering browser from an earlier run never shares the extension files.
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'elementlens-e2e-'));
const artifacts = path.join(here, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
fs.cpSync(src, ext, { recursive: true });
// Test-only: let the service worker inject without a real toolbar click (activeTab gesture).
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));

const html = fs.readFileSync(path.join(here, 'fixture.html'));
const server = http
  .createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(req.url === '/' ? html : `<h1>${req.url}</h1>`);
  })
  .listen(5577);

const results = [];
const check = (name, ok, extra = '') =>
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra && !ok ? '  -> ' + extra : ''}`);

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  acceptDownloads: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5577' });
const errors = [];
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`console: ${m.text()}`);
});
await page.goto('http://localhost:5577/');

// MV3 service workers can be restarted by the browser; always talk to the current one.
const inject = () =>
  (ctx.serviceWorkers().at(-1) ?? sw).evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url?.startsWith('http://localhost:5577'));
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/picker.js'] });
  });

const ui = (sel) => page.locator(`element-lens ${sel}`);
const clipboard = async () =>
  (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(String.fromCharCode(13), '');
const CARD_OPEN = '<div class="card md:flex" x-data="{ open: false }">';
/** Body of the first CSS rule with exactly this selector. */
const ruleBody = (css, selector) => {
  const start = css.indexOf(`${selector} {\n`);
  return start === -1 ? null : css.slice(start, css.indexOf('}', start));
};

try {
  await inject();
  const panel = ui('.el-panel');
  await panel.waitFor({ timeout: 5000 });
  check('panel opens after injection', await panel.isVisible());
  check('empty state hint shown', (await panel.textContent()).includes('Hover over the page'));
  const box = await panel.boundingBox();
  check('panel docked top-right', box.x > 800 && box.y < 40 && Math.round(box.width) === 360, JSON.stringify(box));

  const h2 = await page.locator('.card h2').boundingBox();
  await page.mouse.move(h2.x + 10, h2.y + 10);
  await page.waitForTimeout(150);
  const labelText = await ui('.el-label-name').textContent();
  check('hover overlay label', labelText === 'h2', labelText);

  // Click the card padding area: page handlers must not fire, no navigation.
  const card = await page.locator('.card').boundingBox();
  await page.mouse.click(card.x + 4, card.y + 4);
  await page.waitForTimeout(200);
  check('page click handlers blocked', (await page.evaluate(() => window.pageClicked)) === false);
  check('no navigation', page.url() === 'http://localhost:5577/', page.url());

  const current = ui('.el-crumb-current');
  check('breadcrumb current', (await current.textContent()) === 'div.card…', await current.textContent());

  // Preview: default output "Full" = <style> block + HTML, clipped with a gradient fade.
  const preview = ui('.el-preview .el-code');
  const fullOut = await preview.textContent();
  check('preview defaults to Full', fullOut.startsWith('<style>\ndiv.card {') && fullOut.includes(CARD_OPEN), fullOut.slice(0, 60));
  check('preview clipped with fade', (await ui('.el-preview-fade').count()) === 1);
  const previewBox = await preview.boundingBox();
  check('preview is compact', previewBox.height <= 152, JSON.stringify(previewBox));
  check('JSX option marked soon', await ui('.el-option').filter({ hasText: 'JSX' }).isDisabled());
  check('main copy label', (await ui('.el-copy-main').textContent()) === 'Copy HTML + CSS');

  await ui('.el-option').filter({ hasText: 'HTML only' }).click();
  const htmlOut = await preview.textContent();
  fs.writeFileSync(path.join(artifacts, 'html-output.txt'), htmlOut);
  check('HTML only output', htmlOut.startsWith(CARD_OPEN), htmlOut.slice(0, 60));
  check('HTML absolute img URL', htmlOut.includes('src="http://localhost:5577/img/logo.png"'));
  check('HTML keeps onclick attr', htmlOut.includes('onclick="window.pageClicked = true"'));

  await ui('.el-option').filter({ hasText: 'CSS only' }).click();
  check('CSS only output', (await preview.textContent()).startsWith('div.card {'));
  check('main copy label follows output', (await ui('.el-copy-main').textContent()) === 'Copy CSS');

  // "Show full" opens the popup on the current output (CSS).
  await ui('.el-preview-expand').click();
  const modal = ui('.el-modal');
  await modal.waitFor({ timeout: 3000 });
  check('Show full opens popup', await modal.isVisible());
  check('popup opens on current output', (await ui('.el-modal .el-tab-active').textContent()) === 'CSS');
  const cssOut = await ui('.el-modal .el-code').textContent();
  fs.writeFileSync(path.join(artifacts, 'css-output.txt'), cssOut);
  const want = [
    'div.card {', 'display: flex;', 'align-items: center;', 'gap: 12px;', 'width: 420px;',
    'padding: 16px 24px;', 'border: 1px solid rgb(221, 221, 221);', 'border-radius: 8px;',
    'background-color: rgb(255, 255, 255);', 'color: rgb(51, 51, 51);', 'div.card::before {', 'content: "★";',
  ];
  const missing = want.filter((w) => !cssOut.includes(w));
  check('CSS contains expected declarations', missing.length === 0, `missing: ${missing.join(' | ')}`);
  const noise = ['margin-block', 'inline-size', '-webkit-', 'border-top-color', 'start-radius', 'row-rule', 'visibility', 'pointer-events', 'min-width', 'aspect-ratio'].filter((n) => cssOut.includes(n));
  check('CSS free of noise', noise.length === 0, noise.join(','));
  const h2Rule = ruleBody(cssOut, 'div.card > h2');
  check('CSS child rule for h2', Boolean(h2Rule?.includes('font-size: 20px;') && h2Rule.includes('margin: 0px;')), h2Rule);
  check('CSS child skips inherited values', Boolean(h2Rule && !h2Rule.includes('font-family') && !h2Rule.includes('color:')), h2Rule);
  check('CSS child rule for button', Boolean(ruleBody(cssOut, 'div.card > button.btn')?.includes('background-color: rgb(9, 105, 218);')));
  check('CSS keeps size of replaced img', Boolean(ruleBody(cssOut, 'div.card > img')?.includes('width: 32px;')));
  check('flex children not blockified', !ruleBody(cssOut, 'div.card > img')?.includes('display: block'));

  const modalBox = await modal.boundingBox();
  check('popup is large', modalBox.width > 900 && modalBox.height > 600, JSON.stringify(modalBox));
  await page.screenshot({ path: path.join(artifacts, 'popup.png') });

  await ui('.el-modal .el-btn-primary').click();
  await page.waitForTimeout(150);
  check('popup copy', (await clipboard()) === cssOut);

  await ui('.el-modal .el-tab').filter({ hasText: 'JS' }).click();
  check('popup JS tab coming soon', (await ui('.el-modal .el-soon').textContent()).includes('coming soon'));
  check('popup copy disabled for JS', await ui('.el-modal .el-btn-primary').isDisabled());

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Esc closes popup, keeps panel', (await modal.count()) === 0 && (await panel.count()) === 1);

  await ui('.el-copy-main').click();
  await page.waitForTimeout(150);
  check('main copy button', (await clipboard()) === cssOut);
  check('main copy feedback', (await ui('.el-copy-main').textContent()) === 'Copied!');

  // Export actions
  await ui('.el-section-head').filter({ hasText: 'Export actions' }).click();
  await ui('.el-action').filter({ hasText: 'Copy as Markdown' }).click();
  await page.waitForTimeout(200);
  const md = await clipboard();
  const wantMd = ['## div.card', '### HTML\n\n```html\n<div class="card', '### CSS\n\n```css\ndiv.card {', 'div.card > h2 {'];
  const missingMd = wantMd.filter((w) => !md.includes(w));
  check('Copy as Markdown (HTML + CSS)', missingMd.length === 0 && !md.includes('### JavaScript'), `missing: ${missingMd.join(' | ')}`);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    ui('.el-action').filter({ hasText: 'Download .html' }).click(),
  ]);
  const doc = fs.readFileSync(await download.path(), 'utf8');
  check('download file name', download.suggestedFilename() === 'elementlens-div-card-md-flex.html', download.suggestedFilename());
  check('download is standalone page', doc.startsWith('<!doctype html>') && doc.includes('<style>') && doc.includes('div.card > h2 {') && doc.includes('<div class="card'));
  await page.screenshot({ path: path.join(artifacts, 'panel.png') });

  // Navigation
  await ui('button[title="Parent element"]').click();
  check('parent nav', (await current.textContent()) === 'a#link', await current.textContent());
  await ui('button[title="First child"]').click();
  await ui('button[title="First child"]').click();
  check('child nav', (await current.textContent()) === 'img', await current.textContent());
  await ui('button[title="Next sibling"]').click();
  check('sibling nav', (await current.textContent()) === 'h2', await current.textContent());

  // Children switch
  await ui('.el-crumb').filter({ hasText: 'div.card' }).click();
  await ui('.el-option').filter({ hasText: 'HTML only' }).click();
  await ui('.el-switch').click();
  check('children switch off', (await preview.textContent()) === `${CARD_OPEN}…</div>`, await preview.textContent());
  check('no fade for short output', (await ui('.el-preview-fade').count()) === 0);
  await ui('.el-switch').click();

  await ui('.el-header .el-btn').filter({ hasText: 'Pick' }).click();
  const sc = await page.locator('.scroller').boundingBox();
  await page.mouse.move(sc.x + 20, sc.y + 20);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(250);
  check('wheel scrolls inner container while picking', (await page.locator('.scroller').evaluate((e) => e.scrollTop)) > 0);
  await page.screenshot({ path: path.join(artifacts, 'picking.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Esc leaves pick mode, keeps panel', (await ui('.el-capture').count()) === 0 && (await panel.count()) === 1);

  await page.evaluate(() => (window.pageClicked = false));
  await page.locator('#outside').click();
  check('page interactive after pick mode', (await page.evaluate(() => window.pageClicked)) === true);
  await page.goto('http://localhost:5577/');

  await inject();
  await ui('.el-panel').waitFor();
  await inject();
  await page.waitForTimeout(200);
  check('second injection toggles off', (await page.locator('element-lens').count()) === 0);

  // Settings are remembered between sessions (output type chosen above: HTML only).
  await inject();
  await ui('.el-panel').waitFor();
  const card2 = await page.locator('.card').boundingBox();
  await page.mouse.click(card2.x + 4, card2.y + 4);
  await ui('.el-option-on').first().waitFor();
  const on = await ui('.el-option-on').allTextContents();
  check('settings remembered', on.includes('HTML only'), on.join(','));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Esc closes and removes host', (await page.locator('element-lens').count()) === 0);
} catch (e) {
  check('unexpected error', false, e.message);
}
check('no page/console errors', errors.length === 0, errors.join(' || '));
console.log(results.join('\n'));
server.closeAllConnections();
server.close();
// Chromium with extensions sometimes never acknowledges close; don't let that hang the run.
await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
fs.rmSync(ext, { recursive: true, force: true });
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);

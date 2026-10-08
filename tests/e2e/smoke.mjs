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
  await page.waitForFunction(
    () => [...document.fonts].filter((f) => f.family.includes('ElementLens') && f.status === 'loaded').length === 2,
    null,
    { timeout: 5000 },
  ).catch(() => {});
  const fontStatus = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.family.includes('ElementLens')).map((f) => `${f.family}:${f.status}`),
  );
  check('panel fonts loaded', fontStatus.length === 2 && fontStatus.every((s) => s.endsWith(':loaded')), fontStatus.join(', '));
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

  // Tailwind is the default style format and listed first.
  const preview = ui('.el-preview .el-code');
  const styleGroup = ui('.el-group[aria-label="Style format"] .el-option');
  check('Tailwind listed first', (await styleGroup.first().textContent()) === 'Tailwind', await styleGroup.first().textContent());
  check('Tailwind is the default', (await ui('.el-option-on').allTextContents()).includes('Tailwind'));
  const twDefault = await preview.textContent();
  check('default output uses Tailwind classes', twDefault.includes('class="flex items-center gap-3') && !twDefault.includes('<style>'), twDefault.slice(0, 120));
  // The rest of the run starts from computed CSS.
  await ui('.el-option').filter({ hasText: /^CSS$/ }).click();

  // Preview: output "Full" = HTML followed by a <style> block, clipped with a gradient fade.
  const fullOut = await preview.textContent();
  check(
    'preview defaults to Full (HTML, then CSS)',
    fullOut.startsWith(CARD_OPEN) && fullOut.includes('</div>\n\n<style>\ndiv.card {') && fullOut.endsWith('</style>'),
    fullOut.slice(0, 60),
  );
  check('preview clipped with fade', (await ui('.el-preview-fade').count()) === 1);
  const previewBox = await preview.boundingBox();
  check('preview is compact', previewBox.height <= 152, JSON.stringify(previewBox));
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

  const downloadEvent = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await ui('.el-action').filter({ hasText: 'Download .html' }).click();
  // "Downloaded!" means our code ran; a missing event then points at the browser side.
  const buttonAfter = await ui('.el-action').nth(1).textContent();
  const download = await downloadEvent;
  if (!download) throw new Error(`no download event for .html (button shows "${buttonAfter}")`);
  const doc = fs.readFileSync(await download.path(), 'utf8');
  check('download file name', download.suggestedFilename() === 'elementlens-div-card-md-flex.html', download.suggestedFilename());
  check('download is standalone page', doc.startsWith('<!doctype html>') && doc.includes('<style>') && doc.includes('div.card > h2 {') && doc.includes('<div class="card'));
  await page.screenshot({ path: path.join(artifacts, 'panel.png') });

  // ---------- Phase 2: formats ----------
  const option = (text) => ui('.el-option').filter({ hasText: new RegExp(`^${text}$`) });
  const missingIn = (text, list) => list.filter((w) => !text.includes(w));
  await option('Full').click();

  // JSX component + CSS file
  await option('JSX').click();
  const jsxFull = await preview.textContent();
  fs.writeFileSync(path.join(artifacts, 'jsx-output.txt'), jsxFull);
  const jsxMissing = missingIn(jsxFull, [
    "/* Card.jsx */\nimport './styles.css';", 'export default function Card() {', '}\n\n/* styles.css */\ndiv.card {',
    `<div className="card md:flex" x-data="{ open: false }">`, '<img src="http://localhost:5577/img/logo.png" alt="" width="32" height="32" />',
  ]);
  check('JSX full output', jsxMissing.length === 0 && !jsxFull.includes('onclick'), `missing: ${jsxMissing.join(' | ')}`);
  check('JSX labels', (await ui('.el-copy-main').textContent()) === 'Copy JSX + CSS' && (await option('JSX only').count()) === 1);
  await option('HTML').click();

  // Tailwind (page does not use Tailwind -> converted from computed styles)
  await option('Tailwind').click();
  const twOut = await preview.textContent();
  fs.writeFileSync(path.join(artifacts, 'tailwind-output.txt'), twOut);
  const twMissing = missingIn(twOut, ['flex', 'items-center', 'gap-3', 'w-105', 'px-6', 'py-4', 'rounded-lg', 'bg-white', 'cursor-pointer', "before:content-['★']", 'border-[#dddddd]']);
  check('Tailwind v4 classes', twMissing.length === 0 && !twOut.includes('<style>'), `missing: ${twMissing.join(' | ')}`);
  check('Tailwind copy label', (await ui('.el-copy-main').textContent()) === 'Copy HTML');
  await option('v3').click();
  const tw3 = await preview.textContent();
  check('Tailwind v3 scale', tw3.includes('w-[420px]') && !tw3.includes('w-105'), tw3.slice(0, 160));
  await option('v4').click();

  // Inline CSS: styles in attributes, pseudo-elements stay as CSS
  await option('Inline CSS').click();
  const inlineOut = await preview.textContent();
  check('Inline CSS in style attributes', inlineOut.includes('style="display: flex; align-items: center; gap: 12px;'), inlineOut.slice(0, 200));
  check('Inline CSS keeps pseudo rule', inlineOut.includes('div.card::before {') && !inlineOut.includes('div.card {'));

  // Site rules: the page's own CSS, states, media queries, variables
  await option('Site rules').click();
  await option('CSS only').click();
  const siteCss = await preview.textContent();
  fs.writeFileSync(path.join(artifacts, 'site-rules.txt'), siteCss);
  const siteMissing = missingIn(siteCss, ['.card {', '.card:hover {', '.card::before {', '@media (max-width: 600px) {', '.btn {', ':root {\n  --brand: #0969da;']);
  check('Site rules', siteMissing.length === 0, `missing: ${siteMissing.join(' | ')}`);
  await ui('button[aria-label="Media queries"]').click();
  check('Site rules without media queries', !(await preview.textContent()).includes('@media'));
  await ui('button[aria-label="Media queries"]').click();
  check('Site rules note', (await ui('.el-notes').textContent()).includes('matching rule'));

  // Back to defaults for the rest of the run.
  await option('CSS').click();
  await option('Full').click();

  // Element info: box model + selectors
  await ui('.el-section-head').filter({ hasText: 'Element info' }).click();
  check('box model content size', (await ui('.el-box-content').textContent()).replace(/\s+/g, ' ').trim() === '420 × 32', await ui('.el-box-content').textContent());
  const cssSelector = await ui('.el-locator').filter({ hasText: 'CSS selector' }).locator('code').textContent();
  check('unique CSS selector', (await page.evaluate((s) => document.querySelectorAll(s).length, cssSelector)) === 1, cssSelector);
  await ui('.el-locator').filter({ hasText: 'CSS selector' }).locator('button').click();
  await page.waitForTimeout(150);
  check('copy selector', (await clipboard()) === cssSelector);
  const playwright = await ui('.el-locator').filter({ hasText: 'Playwright' }).locator('code').textContent();
  check('Playwright locator', playwright.startsWith('page.'), playwright);
  await page.screenshot({ path: path.join(artifacts, 'element-info.png') });
  await ui('.el-section-head').filter({ hasText: 'Element info' }).click();

  // ---------- Phase 3: assets + JSON ----------
  await ui('.el-section-head').filter({ hasText: 'Assets' }).click();
  const hexes = await ui('.el-swatch-hex').allTextContents();
  const wantHex = ['#333333', '#dddddd', '#ffffff', '#0969da', '#ffd700'];
  const missingHex = wantHex.filter((h) => !hexes.includes(h));
  check('asset colors', missingHex.length === 0, `missing ${missingHex.join(',')} in ${hexes.join(',')}`);
  const fontNames = await ui('.el-asset-meta strong').allTextContents();
  check('asset fonts', fontNames.includes('Arial, sans-serif'), fontNames.join(','));
  check('no phantom svg fill', !hexes.includes('#000000'), hexes.join(','));
  check('asset images', fontNames.includes('logo.png') && fontNames.includes('bg.png'), fontNames.join(','));
  check('asset svg preview', (await ui('.el-svg-preview svg path').count()) === 1);
  await ui('.el-asset-row').filter({ hasText: 'svg.icon' }).locator('button').first().click();
  await page.waitForTimeout(150);
  const svgCopy = await clipboard();
  check('copy SVG (cleaned)', svgCopy.includes('xmlns="http://www.w3.org/2000/svg"') && svgCopy.includes('<path') && !svgCopy.includes('onclick'), svgCopy);
  await ui('.el-swatch').filter({ hasText: '#0969da' }).click();
  await page.waitForTimeout(150);
  check('copy color', (await clipboard()) === '#0969da');
  await page.screenshot({ path: path.join(artifacts, 'assets.png') });
  await ui('.el-section-head').filter({ hasText: 'Assets' }).click();

  const jsonEvent = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  const jsonClick = await ui('.el-action')
    .filter({ hasText: 'Download JSON' })
    .click({ timeout: 8000 })
    .then(
      () => 'ok',
      (e) => e.message.split('\n').slice(0, 8).join(' | '),
    );
  // Read right away: the label resets 1.5 s after a successful run of the handler.
  const jsonLabel = await ui('.el-action').nth(2).textContent();
  const jsonDownload = await jsonEvent;
  if (!jsonDownload) {
    // Seen ~1 in 3 runs: our handler ran, but headless Chromium did not start a second
    // download from the same page (likely its multiple-downloads protection).
    throw new Error(`no download event for JSON (click: ${jsonClick}; button showed "${jsonLabel}")`);
  }
  const json = JSON.parse(fs.readFileSync(await jsonDownload.path(), 'utf8'));
  check('JSON file name', jsonDownload.suggestedFilename() === 'elementlens-div-card-md-flex.json', jsonDownload.suggestedFilename());
  check(
    'JSON export content',
    json.root.tag === 'div' && json.root.styles.display === 'flex' && json.root.children.length === 3 &&
      json.root.pseudos?.['::before']?.content === '"★"' && json.root.box.width === 470 &&
      json.url === 'http://localhost:5577/' && json.generator.startsWith('ElementLens'),
    JSON.stringify(json).slice(0, 300),
  );

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

  // Drag the panel; its position should survive closing and reopening.
  const head = await ui('.el-header').boundingBox();
  await page.mouse.move(head.x + 120, head.y + 15);
  await page.mouse.down();
  await page.mouse.move(head.x - 180, head.y + 75, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const dragged = await panel.boundingBox();
  check('panel can be dragged', Math.abs(dragged.x - (box.x - 300)) <= 2 && Math.abs(dragged.y - (box.y + 60)) <= 2, JSON.stringify(dragged));

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
  const reopened = await ui('.el-panel').boundingBox();
  check('panel position remembered', Math.abs(reopened.x - dragged.x) <= 2 && Math.abs(reopened.y - dragged.y) <= 2, JSON.stringify(reopened));

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

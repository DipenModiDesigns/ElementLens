// Renders all store listing images into assets/store/:
//   screenshot-1..5.png  1280x800 captioned screenshots (Chrome, Edge, Firefox)
//   promo-small.png      440x280 small promo tile (Chrome, required; Edge optional)
//   promo-marquee.png    1400x560 marquee tile (Chrome, optional)
//   logo-300.png         300x300 logo (Edge, required)
// Run after `npm run build`: node scripts/render-store-assets.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'website');
const outDir = path.join(root, 'assets/store');
fs.mkdirSync(outDir, { recursive: true });

// ---------- 1. Raw captures: the extension running on the ElementLens website ----------

const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'elementlens-store-'));
fs.cpSync(path.join(root, '.output/chrome-mv3'), ext, { recursive: true });
// Capture-only: allow injecting without a real toolbar click.
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));

const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.js': 'text/javascript' };
const server = http
  .createServer((req, res) => {
    const file = path.join(site, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(site) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(file));
  })
  .listen(5590);

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
const ui = (sel) => page.locator(`element-lens ${sel}`);
const option = (text) => ui('.el-option').filter({ hasText: new RegExp(`^${text}$`) });
const settle = () => page.waitForTimeout(400);
const raw = {};
const snap = async (name) => {
  await settle();
  raw[name] = await page.screenshot();
};

await page.goto('http://localhost:5590/index.html');
await page.evaluate(() => document.querySelector('#features')?.scrollIntoView());
await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: 'http://localhost:5590/*' });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/picker.js'] });
});
await ui('.el-panel').waitFor();

// Picking: hover a card, overlay with box model and label.
const card = await page.locator('.card').nth(1).boundingBox();
// The card's padding area, so the whole card (not its icon) is highlighted.
await page.mouse.move(card.x + 10, card.y + card.height - 10);
await snap('picking');

// Selected, Tailwind preview (the default).
await page.mouse.click(card.x + 6, card.y + 6);
await ui('.el-preview .el-code').waitFor();
await ui('.el-crumb-current').hover();
await snap('tailwind');

// JSX + CSS in the large popup.
await option('JSX').click();
await option('CSS').click();
await ui('.el-preview-expand').click();
await ui('.el-modal').waitFor();
await snap('popup');
await page.keyboard.press('Escape');
await option('HTML').click();
await option('Tailwind').click();

// Element info: box model and selectors.
await ui('.el-section-head').filter({ hasText: 'Copy settings' }).click();
await ui('.el-section-head').filter({ hasText: 'Element info' }).click();
await ui('.el-crumb-current').hover();
await snap('info');
await ui('.el-section-head').filter({ hasText: 'Element info' }).click();

// Assets of the selected card.
await ui('.el-section-head').filter({ hasText: 'Assets' }).click();
await ui('.el-crumb-current').hover();
await snap('assets');

server.close();
await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
fs.rmSync(ext, { recursive: true, force: true });

// ---------- 2. Compose captioned images in the website's design ----------

const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const font = (file) => `data:font/woff2;base64,${fs.readFileSync(path.join(site, 'assets/fonts', file)).toString('base64')}`;
const iconSvg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');

const base = `
  @font-face { font-family: Archivo; src: url(${font('Archivo-latin.woff2')}); font-weight: 400 800; }
  @font-face { font-family: 'Space Grotesk'; src: url(${font('SpaceGrotesk-latin.woff2')}); font-weight: 300 700; }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: var(--w); height: var(--h); overflow: hidden; color: #f0f0f5;
    font-family: 'Space Grotesk', sans-serif;
    background:
      radial-gradient(600px 360px at 85% 20%, #14b8a62e, transparent 70%),
      radial-gradient(420px 260px at 0% 0%, #fbbf2418, transparent 70%),
      linear-gradient(#ffffff0d 1px, transparent 1px) 0 0 / 48px 48px,
      linear-gradient(90deg, #ffffff0d 1px, transparent 1px) 0 0 / 48px 48px,
      #030304;
  }
  .eyebrow { color: #14b8a6; font-size: 13px; font-weight: 700; letter-spacing: .3em; text-transform: uppercase; }
  h1, h2 { font-family: Archivo, sans-serif; font-weight: 700; letter-spacing: -.03em; line-height: 1.05; }
  .dot { color: #fbbf24; }
  .brand { display: flex; align-items: center; gap: 12px; font: 700 24px Archivo, sans-serif; letter-spacing: -.02em; }
  .brand svg { width: 40px; height: 40px; }
`;

const shots = [
  ['picking', 'Pick any element', 'Hover to see the box model. Click to select.'],
  ['tailwind', 'Tailwind in one click', 'Utility classes for v4 or v3, ready to paste.'],
  ['popup', 'HTML or JSX, with CSS', 'A ready React component and only the CSS that matters.'],
  ['info', 'Selectors and box model', 'Unique CSS selector, XPath, Playwright and Cypress.'],
  ['assets', 'Colors, fonts, images, icons', 'Every asset an element uses, copy or download.'],
];

const browser = await chromium.launch();
const render = async (file, w, h, html) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<html><head><style>:root{--w:${w}px;--h:${h}px}${base}</style></head><body>${html}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(outDir, file) });
  await p.close();
};

for (const [i, [key, title, sub]] of shots.entries()) {
  await render(
    `screenshot-${i + 1}.png`,
    1280,
    800,
    `<div style="padding:44px 64px 0;display:flex;justify-content:space-between;align-items:flex-end">
       <div><p class="eyebrow">ElementLens</p>
         <h2 style="font-size:46px;margin-top:10px">${title}<span class="dot">.</span></h2>
         <p style="color:#8b8b9e;font-size:20px;margin-top:8px">${sub}</p></div>
     </div>
     <img src="${b64(raw[key])}" style="position:absolute;left:64px;right:64px;top:210px;width:1152px;border-radius:18px 18px 0 0;border:1px solid #ffffff26;box-shadow:0 0 0 1px #14b8a61a,0 30px 80px #000,0 0 90px #14b8a626">`,
  );
}

await render(
  'promo-small.png',
  440,
  280,
  `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 34px">
     <div class="brand">${iconSvg}<span>ElementLens<span class="dot">.</span></span></div>
     <h1 style="font-size:31px;margin-top:20px">Copy any element<span class="dot">.</span></h1>
     <p style="color:#8b8b9e;font-size:15px;margin-top:8px">HTML, CSS, Tailwind or JSX in one click.</p>
   </div>`,
);

await render(
  'promo-marquee.png',
  1400,
  560,
  `<div style="position:absolute;left:84px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center">
     <div class="brand">${iconSvg}<span>ElementLens<span class="dot">.</span></span></div>
     <h1 style="font-size:64px;margin-top:26px">Copy any element<span class="dot">.</span></h1>
     <p style="color:#8b8b9e;font-size:22px;margin-top:14px">Clean HTML, CSS, Tailwind or JSX from any web page. Free and private.</p>
   </div>
   <img src="${b64(raw.tailwind)}" style="position:absolute;left:700px;top:56px;width:820px;border-radius:18px;border:1px solid #ffffff26;box-shadow:0 30px 80px #000,0 0 90px #14b8a626">`,
);

await render(
  'logo-300.png',
  300,
  300,
  `<div style="position:absolute;inset:0;background:#030304">${iconSvg.replace('<svg ', '<svg width="300" height="300" ')}</div>`,
);

await browser.close();
console.log(`Rendered store assets into ${path.relative(root, outDir)}`);
process.exit(0);

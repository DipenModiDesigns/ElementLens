# ElementLens

Free browser extension by **Dipen Modi, JupiterNexa**. Click the icon, pick any element on a page, and get its HTML, CSS, Tailwind, JSX, selectors and assets in a floating panel. Everything runs locally: no account, no tracking, no network calls.

Support: [extension@jupiternexa.com](mailto:extension@jupiternexa.com)

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Implementation plan: [docs/PLAN.md](docs/PLAN.md)

## Status

Phases 1 to 3 done; next is Phase 4 (cross-browser QA and store release). Click the icon (or Alt+Shift+E), hover to highlight, click to pick. The panel shows a compact preview of the code (Show full opens a large popup) and copies it with one button. Copy settings:

- **Component format:** HTML or JSX (React component)
- **Style format:** Tailwind (default; v4 or v3), CSS (computed), Inline CSS, or Site rules (the page's own CSS, incl. `:hover` and `@media`)
- **Output:** Full, markup only or CSS only, with or without children

Element info shows the box model and copyable selectors (CSS, XPath, Playwright, Cypress). Assets lists the colors, fonts, images and SVG icons used. Export actions: Copy as Markdown, Download .html, Download JSON. The panel remembers its position and width (reset it on the settings page). Move through the tree with the arrow buttons or the breadcrumb. Esc exits.

The Tailwind color palettes come from the official packages: `node scripts/generate-tailwind-palette.mjs` regenerates `src/core/convert/tailwind-palette.ts`.

JavaScript extraction is built but switched off ("Coming soon") via `FEATURES.jsTab` in `src/shared/features.ts`.

## Requirements

- Node.js 20+ (developed on 22)
- Chrome / Edge / Brave for Chromium builds, Firefox 140+ for the Firefox build

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (also generates WXT types) |
| `npm run dev` | Start Chrome with the extension loaded and hot reload |
| `npm run dev:firefox` | Same for Firefox |
| `npm run build` | Production build for Chromium browsers in `.output/chrome-mv3` |
| `npm run build:firefox` | Production build for Firefox in `.output/firefox-mv3` |
| `npm run build:all` | Both builds |
| `npm run zip` / `npm run zip:firefox` | Store-ready zip files in `.output/` |
| `npm run compile` | Type check |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Build, then browser smoke test with Playwright Chromium (first time: `npx playwright install chromium`) |

## Load a build manually

- **Chrome / Edge / Brave / Opera:** open `chrome://extensions` (or `edge://extensions`), enable Developer mode, "Load unpacked", choose `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", choose `.output/firefox-mv3/manifest.json`.

## Project layout

```
src/
  entrypoints/
    background.ts        toolbar click / Alt+Shift+E -> inject picker into the active tab
    picker.content/      content script (runtime-injected), Preact UI in Shadow DOM
    options/             settings page
  core/                  pure, unit-tested extract/convert logic
  shared/                brand constants, settings storage
tests/unit/              Vitest tests
tests/e2e/               Playwright smoke test + fixture page
public/icon/             extension icons (rendered from assets/)
assets/                  icon sources (icon.svg, icon-small.svg for 16/32 px)
scripts/                 palette generator, icon renderer, screenshot capture
website/                 static website (GitHub Pages)
```

## Website

Static site in `website/` (no build step, no web fonts, no trackers): home, download, support, privacy, and `about.html`, which redirects to the author's site.

- **Publish:** repo Settings > Pages > Source: **GitHub Actions**. Every push to `main` that changes `website/` deploys it to https://dipenmodidesigns.github.io/ElementLens/ (`.github/workflows/pages.yml`).
- **Preview locally:** open `website/index.html` in a browser.
- **Screenshot:** `npm run build && node scripts/capture-screenshot.mjs` refreshes `website/assets/screenshot.png` (1280x800, also usable for store listings).
- **Icons:** edit `assets/icon.svg` / `assets/icon-small.svg`, then `node scripts/render-icons.mjs`.

## Store listings

Texts, permission justifications and per-store steps: [docs/store-listing.md](docs/store-listing.md). Images (screenshots, promo tiles, Edge logo) in `assets/store/`, regenerated with `npm run build && node scripts/render-store-assets.mjs`.

## Releases

Push a version tag to build the Chrome and Firefox zips and attach them to a GitHub release (`.github/workflows/release.yml`). The website's download button points at the latest release.

```
git tag v0.1.0
git push origin v0.1.0
```

## Permissions

Only `activeTab`, `scripting` and `storage`. The extension gets access to a tab only after you click it, and never declares host permissions.

## License

MIT, see [LICENSE](LICENSE). Bundled fonts (Archivo, Space Grotesk) are under the SIL Open Font License 1.1.

# ElementLens: Implementation Plan

Companion to [PRD.md](PRD.md). Phases are ordered by dependency; each ends with something usable.

## Target folder structure

```
ElementLens/
├─ docs/                     PRD, plan, research notes
├─ src/
│  ├─ entrypoints/
│  │  ├─ background.ts       toolbar click + shortcut -> inject scripts
│  │  ├─ picker.content/     content script (injected on demand)
│  │  │  ├─ index.ts         boot, pick mode lifecycle
│  │  │  ├─ overlay.ts       hover highlight + box model boxes
│  │  │  └─ panel/           Preact UI inside Shadow DOM
│  │  ├─ main-world.ts       framework detection (page context)
│  │  └─ options/            settings page
│  ├─ core/                  pure, unit-tested logic
│  │  ├─ extract/            html.ts, css-computed.ts, css-authored.ts,
│  │  │                      assets.ts, selectors.ts, box.ts
│  │  ├─ convert/            tailwind/ (v3, v4 scales), jsx.ts, standalone-html.ts
│  │  └─ format/             prettier wrapper (lazy)
│  └─ shared/                types, messaging, storage helpers
├─ tests/
│  ├─ unit/                  Vitest + happy-dom
│  ├─ fixtures/              sample pages (Tailwind, Bootstrap, CSS-in-JS, iframes)
│  └─ e2e/                   Playwright with extension loaded
├─ public/icons/
├─ wxt.config.ts
└─ package.json
```

## Phase 0: Setup (done 2026-10-08)
- [x] WXT 0.21 + Preact 11 + TypeScript project (WXT dropped its Preact template, so set up by hand)
- [x] Prettier, Vitest + happy-dom (Playwright deferred to Phase 4)
- [x] `wxt.config.ts`: permissions `activeTab`, `scripting`, `storage`; command `Alt+Shift+E`; Firefox `gecko.id`, min version 140, `data_collection_permissions: none`
- [x] Background toggles a runtime-injected content script; restricted pages show a red `!` badge
- [x] Placeholder Shadow DOM panel, options page with settings storage, placeholder icons
- [x] README with dev instructions, git repo initialised
- Verified: type check clean, unit tests green, Chrome and Firefox MV3 builds succeed, `web-ext lint` 0 errors
- Note: WXT builds Firefox as MV2 by default; scripts pass `--mv3` explicitly
- Note: no `matches` on the content script (it would add an `<all_urls>` host permission); a build hook makes the stylesheet web-accessible instead

## Phase 1: MVP (done 2026-10-08)
- [x] Background: on action click, inject content script into active tab; handle restricted pages (badge + message)
- [x] Pick mode: transparent capture layer + window-capture listeners, so page click handlers never fire; hover overlay with box model and label; click to select; Esc to exit
- [x] Shadow DOM panel (Preact): draggable header, resizable, close and re-pick buttons, light/dark/system theme from settings
- [x] HTML tab: clean indented HTML, absolute URLs (incl. srcset), scripts/comments stripped, "Children" toggle, size cap
- [x] CSS tab, computed mode: diff against browser defaults measured in our Shadow DOM, noise filters, shorthand merging (margin, padding, border, radius, overflow, gap, flex), `::before`/`::after`
- [x] Copy button (async clipboard, execCommand fallback on http pages)
- [x] Parent / child / sibling navigation + clickable breadcrumb with hover preview
- [x] Wheel scrolling forwarded to inner scroll containers while picking
- Verified: 24 unit tests + 24-check browser smoke test (`npm run test:e2e`, Playwright Chromium with the production build)
- Note: Preact 11 no longer adds `px` to numeric styles; always pass units
- Not covered yet: manual test in Firefox, keyboard arrow navigation (buttons only for now), cross-origin iframes

## Phase 1.5: Requested additions (done 2026-10-09)
- [x] JS tab built but **shipped as "Coming soon"** (decision 2026-10-09). Switch: `FEATURES.jsTab` in `src/shared/features.ts`. Before enabling: harden the background handshake (seen unresponsive under heavy CPU load in tests; the 2 s fallback already degrades gracefully). What it does: inline handlers, `javascript:` links, framework attributes (Alpine, Livewire, htmx, Stimulus, Bootstrap...), inline scripts; via a page-context helper: React props handlers + component chain, Vue listeners + components, jQuery direct and delegated handlers (with source), page library detection. Clear note that `addEventListener` listeners are unreadable.
- [x] "Copy all": HTML + CSS (+ JS once enabled) as one Markdown document
- [x] CSS for children: "Children" toggle now applies to HTML, CSS and JS; child selectors relative to the root, identical siblings share a rule, inherited values not repeated, flex/grid blockification and layout sizes filtered
- Verified: 32 unit tests, 31-check browser smoke test

## Phase 1.6: Panel redesign (done 2026-10-09)
- [x] Settings-driven layout like the reference screenshot: breadcrumb + navigation cross, collapsible "Copy settings" (component format, style format, output Full / HTML only / CSS only, include-children switch), collapsible "Export actions" (Copy as Markdown, Download .html), big Copy button
- [x] Compact code preview with gradient fade and "Show full"; opens a large popup with Full / HTML / CSS / JS tabs and its own Copy; Esc closes the popup first
- [x] Options that depend on later work (JSX, Tailwind, Inline CSS, Site rules, JavaScript) shown disabled with a "Soon" badge
- [x] Panel settings remembered between sessions (extension storage)
- Left out on purpose until Phase 2: "Copy mode" and "Media query" (only meaningful with authored CSS rules)
- Verified: 36 unit tests, 48-check browser smoke test (2 consecutive green runs)

## Phase 2: Core converters
- [ ] Authored CSS: walk `document.styleSheets`, match rules incl. `@media`, `:hover`, pseudo-elements; handle cross-origin `SecurityError`
- [ ] Tailwind detection (existing classes, grouping by category and variant)
- [ ] Tailwind converter: computed CSS -> utilities, v4 + v3 scales, nearest-color mapping, arbitrary-value fallback
- [ ] JSX converter
- [ ] Selectors tab (unique CSS, XPath, Playwright/Cypress)
- [ ] Box model tab
- [ ] Unit tests for all converters with fixtures
- **Done when:** converter test suite green; Tailwind output of 10 fixture elements renders close to the original.

## Phase 3: Depth and export
- [x] Main-world script + message bridge; framework detection (moved to Phase 1.5)
- [x] JS tab with clear "partial info" labelling (moved to Phase 1.5)
- [x] "Copy all" as Markdown (moved to Phase 1.5); light/dark panel theme (Phase 1)
- [ ] Assets tab (colors, fonts, images, SVG, CSS variables)
- [ ] Standalone HTML download (inlined styles), JSON download
- [ ] Persisted panel position/size
- **Done when:** feature-complete for v1 on Chrome.

## Phase 4: Cross-browser and release
- [ ] Firefox build + manual QA pass (event page background, `world: MAIN`, clipboard)
- [ ] QA on Edge, Brave, Opera (same Chromium zip)
- [ ] Extend the Playwright smoke test (started in Phase 1) with more fixture pages
- [ ] Edge cases: iframes (same-origin), open shadow DOM, SVG, very large elements, pages with strict CSP
- [ ] Performance check: content script size, hover fps
- [ ] Store assets: icons, screenshots, description, privacy policy page
- [ ] Submit: Chrome Web Store, Edge Add-ons, Firefox AMO (Opera optional)
- **Done when:** listed or in review on the three stores.

## Phase 5: Safari (optional)
- [ ] `wxt build -b safari`, convert with `xcrun safari-web-extension-converter` on a Mac
- [ ] Verify `scripting` + `world: MAIN` support; degrade JS tab if missing
- [ ] Apple Developer account, App Store submission

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Authored-CSS matching is complex (specificity, cascade, layers) | Wrong or noisy CSS | Start with computed mode (reliable); show authored as "matched rules", not a full cascade engine |
| Tailwind conversion quality | Users lose trust | Exact arbitrary values over wrong guesses; tests on fixtures |
| Host pages that fight overlays (huge z-index, `pointer-events` tricks) | Picker unusable on some sites | Overlay on top-level host with max z-index, use `elementsFromPoint` instead of event target |
| Store review delays | Late release | Minimal permissions, no remote code, clear privacy statement |
| Safari API gaps | Feature loss on Safari | Last phase, graceful degradation |

## First next step

Manually test the Phase 1 build in Chrome and Firefox (see README), then start Phase 2.

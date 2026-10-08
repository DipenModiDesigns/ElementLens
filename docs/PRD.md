# ElementLens: Product Requirements Document

> Working name. Rename freely before store submission.

| Field | Value |
|---|---|
| Status | Draft v0.1 |
| Date | 2026-10-08 |
| Author | Dipen Modi |
| Company | JupiterNexa |
| Support | extension@jupiternexa.com |
| License / price | Free |
| Type | Cross-browser extension (Manifest V3) |

---

## 1. Summary

ElementLens is a browser extension for developers and designers. Click the toolbar icon, hover over any element on a page, click it, and a floating panel shows that element's structure in several ready-to-copy formats:

- **HTML** (clean, prettified)
- **CSS** (authored rules + computed styles, minimal and deduplicated)
- **Tailwind** (existing classes detected, or computed styles converted to Tailwind utilities)
- **JSX / React** (className, style objects, self-closing tags)
- **JS info** (inline handlers, detected framework, data attributes)
- **Assets & tokens** (colors, fonts, images, CSS variables)
- **Selectors** (unique CSS selector, XPath)

Everything runs locally in the browser. No account, no server, no tracking.

## 2. Problem

Inspecting and reusing a UI element today means:

1. Opening DevTools, digging through the Elements and Styles panes.
2. Manually copying HTML, then hunting for the CSS rules that actually apply (spread over many stylesheets, overridden, inherited).
3. Rewriting it by hand to Tailwind or JSX.

This is slow and error-prone. DevTools shows everything, so it is hard to see what matters.

## 3. Goals and non-goals

### Goals
- G1: Pick any element in 2 clicks (icon, then element).
- G2: Produce copy-ready output in at least 5 formats from one pick.
- G3: Work on Chrome, Edge, Brave, Opera, Vivaldi and Firefox from one codebase. Safari as a later phase.
- G4: Never break or restyle the host page (full style isolation).
- G5: Zero data leaves the browser.

### Non-goals (v1)
- Cloning full pages or whole sites.
- Live editing of the page (like VisBug). Possible v2.
- Listing **all** JS event listeners of an element. Browsers do not expose this to extensions (see section 9).
- AI-based code conversion. Possible v2 as an opt-in feature.

## 4. Target users

| Persona | Need |
|---|---|
| Frontend developer | Grab a component's HTML/CSS/Tailwind to rebuild it quickly. |
| Designer | See exact colors, fonts, spacing, sizes. |
| Agency team | Audit client sites, reproduce elements, check Tailwind usage. |
| Learner | Understand how a nice element is built. |

## 5. Market research

Existing tools in this space (paid and free):

| Tool | Strengths | Gaps we can fill |
|---|---|---|
| DivMagic | Element to CSS / Tailwind / React/JSX in one click | Paid, closed |
| cssPicker.dev | Copy HTML/CSS, convert to JSX / Tailwind | Paid tiers |
| DivCat | Convert to React, Vue, Tailwind | Limited free tier |
| CSS Peeper | Great designer view: colors, fonts, assets | No code export to Tailwind/JSX |
| Hoverify | Hover inspect + live edit | Broad suite, subscription |
| CSS Scan Pro, SnipCSS | Copy CSS of element | CSS focus only |
| VisBug (Google, open source) | Visual editing | Not an export tool |
| Pesticide (open source) | Layout outlines | Visual only |

**Positioning:** a free/internal-first, privacy-first, cross-browser tool that combines the "designer view" (CSS Peeper) with "code export" (DivMagic), and is honest about JS limits. Note: competitor feature details are based on their public listings, not hands-on testing.

## 6. User stories

1. As a user, I click the extension icon and the page enters **pick mode**: elements get a highlight box with a tag/size label on hover.
2. As a user, I click an element and a **floating, draggable, resizable panel** opens with tabs per format.
3. As a user, I can move to the **parent / child / sibling** element with buttons or arrow keys, without re-picking.
4. As a user, I click **Copy** on any tab and get the code on my clipboard.
5. As a user, I can **download** the element as a standalone `.html` file that renders the same as on the page.
6. As a user, I press **Esc** (or the close button) to leave pick mode, and the page is exactly as before.
7. As a user, I can use a **keyboard shortcut** (default `Alt+Shift+E`) instead of the icon.
8. As a user, I can set preferences: Tailwind version (v4 default, v3 optional), include children yes/no, CSS mode (authored vs computed), theme (light/dark).

## 7. Functional requirements

### 7.1 Activation and pick mode
- FR1: Toolbar click toggles pick mode on the active tab.
- FR2: Keyboard command toggles pick mode.
- FR3: Hover highlight overlay shows margin / border / padding / content boxes (DevTools-style colors) and a label: `div.card  320 x 180`.
- FR4: Click selects; the click must **not** trigger the page's own handlers (capture-phase `preventDefault` + `stopPropagation`).
- FR5: Esc exits. Clicking the icon again exits.
- FR6: On restricted pages (`chrome://`, `about:`, Chrome Web Store, addons.mozilla.org, built-in PDF viewer) show a friendly "not available on this page" message via the badge/popup.

### 7.2 Floating panel ("clickable window")
- FR7: Rendered inside a **Shadow DOM** root attached to a host element at the top of `<html>`, max z-index, so host CSS cannot leak in and our CSS cannot leak out.
- FR8: Draggable by header, resizable, can dock left/right/bottom, minimizable.
- FR9: Remembers position and size per user (extension storage).
- FR10: Tabs: HTML, CSS, Tailwind, JSX, JS, Assets, Selectors, Box model.
- FR11: Syntax highlighting, line wrap toggle, Copy and Download buttons per tab.
- FR12: Breadcrumb of the element path (`body > main > section.hero > div.card`), each item clickable.

### 7.3 Output formats

| Tab | Content | Notes |
|---|---|---|
| HTML | `outerHTML`, prettified, optional "strip children", remove our own injected attributes, optional strip of `data-*`, scripts, comments | Relative URLs (`src`, `href`, `srcset`) converted to absolute |
| CSS | **Authored mode:** matching rules from page stylesheets (via `element.matches(selectorText)`), including `:hover`, `::before/::after` and `@media` blocks. **Computed mode:** `getComputedStyle`, filtered against browser defaults so only meaningful properties remain | Cross-origin stylesheets are unreadable (`cssRules` throws). Fall back to computed mode for those rules |
| Tailwind | (a) If the page uses Tailwind, show the element's existing classes, grouped (layout, spacing, color, typography, responsive variants). (b) Otherwise convert computed CSS to utilities: map to nearest scale value, else arbitrary value (`p-[13px]`, `bg-[#1a2b3c]`) | Default target v4, v3 selectable in settings. v4 uses 0.25rem spacing base and OKLCH palette |
| JSX | HTML converted: `class` to `className`, `for` to `htmlFor`, inline style string to object, self-closing void tags, `on*` attrs camelCased | Optional: wrap as a React component |
| JS | Inline handlers (`onclick` etc.), detected framework (React, Vue, Svelte, Angular, Alpine, Livewire, jQuery), component name when available, `data-*`, ARIA attributes | Requires main-world script (see 8.3) |
| Assets | Colors used (text, bg, border, shadow) with swatches, font families/weights/sizes, background images, `<img>`/`<svg>` sources, CSS variables used and their resolved values | Download SVG inline |
| Selectors | Unique CSS selector, short selector, XPath, `document.querySelector` snippet, Playwright/Cypress locator | Useful for testers |
| Box model | Width/height, margin/border/padding, position, display, z-index | Visual diagram |

### 7.4 Export
- FR13: Copy to clipboard (per tab, plus "Copy all" as Markdown).
- FR14: Download standalone `.html` (element + inlined computed styles), so it renders the same outside the site.
- FR15: Download JSON (structured element tree with styles) for tooling.
- FR16 (v1.1): "Open in CodePen" via its prefill POST form.

### 7.5 Settings (options page)
- Tailwind version, default tab, CSS mode, include children depth, panel theme, shortcut info, reset position.

## 8. Technical approach

### 8.1 Stack (recommended)

| Choice | Why |
|---|---|
| **WXT** (Vite-based extension framework) | One codebase, builds per browser (Chrome MV3, Firefox MV3, Safari), auto-generates the correct manifest per target, HMR in dev |
| **TypeScript** | Safety in a codebase with lots of DOM/CSS parsing |
| **Preact** for the panel UI | Small (~4 KB), React-like, keeps the content script light. Vanilla TS is the fallback if bundle size becomes an issue |
| **Shadow DOM + constructable stylesheets** | Style isolation in both directions |
| **Prism or Shiki (light build)** | Syntax highlighting |
| **Prettier standalone** (lazy-loaded) | Formatting HTML/CSS/JSX output |
| **Vitest + Playwright** | Unit tests for converters; E2E with the extension loaded |

### 8.2 Architecture

```
Toolbar click / shortcut
        |
        v
background (service worker on Chromium, event page on Firefox)
        |  scripting.executeScript (activeTab, on demand)
        v
content script (isolated world)
  - pick mode overlay
  - Shadow DOM panel (Preact)
  - extractors: html, css, assets, selectors, box
  - converters: tailwind, jsx
        |  postMessage bridge
        v
main-world script (page context, on demand)
  - framework / component detection
  - jQuery event data, React fiber props names
```

- **On-demand injection** with `activeTab` + `scripting`. No `<all_urls>` host permission, so the store review is simpler and users see no scary "read all your data" warning.
- Extractors and converters are **pure functions** (element/data in, string out) so they are unit-testable without a browser.

### 8.3 Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab only after the user clicks |
| `scripting` | Inject content and main-world scripts on demand |
| `storage` | Settings, panel position |

No host permissions, no remote code, no network requests.

### 8.4 Cross-browser compatibility matrix

| Browser | Engine | Build | Notes |
|---|---|---|---|
| Chrome | Chromium | `chrome-mv3` | Primary target. Background = service worker |
| Edge, Brave, Opera, Vivaldi, Arc | Chromium | same `chrome-mv3` zip | Edge has its own store (Edge Add-ons); Opera has its own add-ons site; Brave/Vivaldi install from Chrome Web Store |
| Firefox (140+, current ESR) | Gecko | `firefox-mv3` | Firefox MV3 does **not** support `background.service_worker`; it uses event pages (`background.scripts`). WXT handles this. Needs `browser_specific_settings.gecko.id` |
| Safari (macOS/iOS) | WebKit | `safari-mv3` + Xcode wrapper | Requires a Mac, Xcode and `safari-web-extension-converter`; distribution needs an Apple Developer account (paid). Planned as last phase |

Compatibility rules for our code:
- Use the `browser.*` namespace via WXT (promise-based, polyfilled for Chromium).
- Avoid Chrome-only APIs for core features (`sidePanel`, `offscreen`, `chrome.debugger`). This is why the panel lives **in the page**, not in a browser side panel.
- `scripting.executeScript` with `world: "MAIN"`: supported in Chromium and recent Firefox; Safari support must be verified in phase 5. The JS tab must degrade gracefully when the main world is unavailable.

## 9. Known limitations (be honest in the UI)

| Limitation | Reason | Mitigation |
|---|---|---|
| Cannot list all JS event listeners | `getEventListeners()` exists only in the DevTools console, not for extensions | Show inline handlers, framework hints, jQuery `$._data` events; label clearly as "partial" |
| Cross-origin stylesheet rules unreadable | Browser security (CORS) | Use computed styles for those; mark them |
| Cross-origin iframes | Separate origin | Inject in all frames on demand; picking inside cross-origin iframes is v1.1 |
| Closed shadow roots | Not accessible by design | Show host element only |
| Canvas / WebGL content | Pixels, not DOM | Show the canvas element only |
| Restricted pages | Browser policy | Clear message |
| Tailwind conversion is approximate | Computed values do not map 1:1 to utilities | Prefer exact arbitrary values over wrong guesses |
| Minified / obfuscated class names (CSS-in-JS) | Generated names like `css-1x2y3z` | Offer computed mode / Tailwind conversion instead |

## 10. Non-functional requirements

- **Performance:** panel opens < 300 ms after click on a typical element; hover highlight at 60 fps (use `requestAnimationFrame`, no layout thrashing).
- **Bundle size:** content script < 150 KB gzipped (Prettier lazy-loaded).
- **Isolation:** zero visual change to the host page when pick mode is off.
- **Accessibility:** panel fully keyboard-navigable, ARIA roles on tabs.
- **Privacy:** no network calls. Store privacy declaration: "does not collect data".
- **Security:** never `eval` page content; escape all output rendered in the panel; no remote code (MV3 rule).

## 11. Success metrics

- Adoption: 1,000 active users within 3 months after public launch (target, not a forecast).
- Store rating of 4.5 or higher.
- Output quality: on a test set of 30 elements from 10 real sites, the downloaded standalone HTML renders visually the same in at least 90% of cases.
- Store: published on Chrome Web Store, Edge Add-ons and Firefox AMO without rejection.

## 12. Release phases

See [PLAN.md](PLAN.md) for the detailed plan.

| Phase | Scope |
|---|---|
| 0 | Project setup (WXT, TS, Preact, lint, tests) |
| 1 | MVP: pick mode, panel, HTML + computed CSS, copy |
| 2 | Authored CSS, Tailwind, JSX, selectors, box model |
| 3 | JS tab, assets, export (HTML/JSON), settings |
| 4 | Firefox build, cross-browser QA, store listings |
| 5 | Safari |

## 13. Decisions

| Topic | Decision |
|---|---|
| Distribution | Free public extension. No paid tier, no account, no ads |
| Publisher | JupiterNexa, author Dipen Modi |
| Support | extension@jupiternexa.com (shown in store listings, options page and privacy policy) |
| Tailwind | v4 by default, v3 selectable in settings |

## 14. Open questions

1. **Final name and icon** (ElementLens is a working name). Check store name availability before submission.
2. Is a **Vue** output tab needed next to JSX? (Default: v1.1, not v1.)
3. Where will the **privacy policy** be hosted? (Suggestion: a page on jupiternexa.com. All stores require a public URL.)

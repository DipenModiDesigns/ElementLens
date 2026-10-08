# Store listings

Copy-paste texts and answers for the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). Version 0.1.1, MIT licensed. Images are in `assets/store/` (regenerate: `npm run build && node scripts/render-store-assets.mjs`).

Upload packages from the [v0.1.1 release](https://github.com/DipenModiDesigns/ElementLens/releases/tag/v0.1.1) or run `npm run zip` / `npm run zip:firefox`:

| Store | Package |
|---|---|
| Chrome Web Store, Edge Add-ons | `element-lens-0.1.1-chrome.zip` |
| Firefox Add-ons | `element-lens-0.1.1-firefox.zip` + `element-lens-0.1.1-sources.zip` |

## Decisions

| Topic | Decision |
|---|---|
| Listing name | `ElementLens: Copy HTML, CSS & Tailwind` (manifest `name`); `short_name` and the panel use `ElementLens` |
| License | MIT (`LICENSE` in the repo) |
| Version for the first store submission | 0.1.1 |

---

## Shared texts

### Name
ElementLens: Copy HTML, CSS & Tailwind

### Short description (Chrome summary, max 132 characters; this is the manifest `description`)
Pick any element and copy clean HTML, CSS, Tailwind or JSX. Free and private: no account, no tracking, nothing leaves your browser.

### Summary (Firefox, max 250 characters)
Pick any element on a web page and copy it as clean HTML or JSX with Tailwind classes, CSS, inline styles or the site's own CSS rules. Includes selectors, box model and assets. Free, no account, no tracking.

### Detailed description (Chrome, Edge and Firefox)

```
ElementLens turns any element on a web page into clean, paste-ready code.

Click the ElementLens icon (or press Alt+Shift+E), hover over the page and click an element. A panel shows its code in the format you choose, with a preview and a one-click Copy button.

WHAT YOU CAN COPY
• HTML or JSX: clean, indented markup with absolute URLs, or a ready React component with className and style objects.
• Tailwind CSS (v4 or v3): utility classes generated from the element's styles. On sites that already use Tailwind, the original classes are kept, including responsive and hover variants.
• CSS: only the styles that matter. Browser defaults and noise are filtered out and shorthands are merged.
• Inline CSS: styles written into style attributes.
• Site rules: the page's own CSS rules for the element, including :hover, ::before and @media.
• With or without child elements.

MORE TOOLS
• Box model and selectors: unique CSS selector, XPath, Playwright and Cypress locators.
• Assets: the colors (with hex values), fonts, images and SVG icons an element uses.
• Export: copy as Markdown, download a standalone .html file, or JSON.
• Move through the page structure with the breadcrumb and arrow buttons.
• Light and dark theme.

PRIVATE BY DESIGN
• No account, no analytics, no tracking.
• ElementLens only accesses the tab you click it on, and only after you click.
• Everything runs locally in your browser. Nothing is sent anywhere.
• Permissions: activeTab, scripting and storage. No access to all websites.

GOOD TO KNOW
• Browsers do not let extensions read stylesheets loaded from other domains. ElementLens tells you when that happens; the CSS format always shows the full computed result.
• Copying JavaScript (event handlers, framework components) is coming soon.

Free, made by Dipen Modi (JupiterNexa).
Website: https://dipenmodidesigns.github.io/ElementLens/
Support: extension@jupiternexa.com
```

### Links

| Field | Value |
|---|---|
| Website / homepage | https://dipenmodidesigns.github.io/ElementLens/ |
| Support URL | https://dipenmodidesigns.github.io/ElementLens/support.html |
| Support email | extension@jupiternexa.com |
| Privacy policy | https://dipenmodidesigns.github.io/ElementLens/privacy.html |

### Images (`assets/store/`)

| File | Size | Chrome | Edge | Firefox |
|---|---|---|---|---|
| `public/icon/128.png` | 128×128 | Store icon (required) | | (from the package) |
| `logo-300.png` | 300×300 | | Logo (required) | |
| `promo-small.png` | 440×280 | Small promo tile (required) | Small tile (optional) | |
| `promo-marquee.png` | 1400×560 | Marquee (optional) | Large tile (optional) | |
| `screenshot-1.png` … `screenshot-5.png` | 1280×800 | 1 to 5 (at least 1) | up to 10 | Screenshots |

Screenshot captions (in the images): 1 Pick any element, 2 Tailwind in one click, 3 HTML or JSX with CSS, 4 Selectors and box model, 5 Colors, fonts, images, icons.

---

## Chrome Web Store

Dashboard: https://chrome.google.com/webstore/devconsole (one-time developer registration fee).

**Store listing tab**
- Description: the detailed description above.
- Category: Developer Tools.
- Language: English.
- Images: store icon, small promo tile, screenshots 1 to 5, marquee (optional).
- Homepage URL and support URL: see Links.

**Privacy practices tab**

- Single purpose:
  > ElementLens has one purpose: let the user pick an element on the current web page and copy its code (HTML or JSX with Tailwind classes, CSS, inline styles or the site's own CSS rules), together with related details such as selectors, box model and the assets it uses.
- Permission justification, `activeTab`:
  > Gives temporary access to the tab the user clicked ElementLens on (toolbar icon or keyboard shortcut), so the element picker can run there. No access to other tabs or sites.
- Permission justification, `scripting`:
  > Injects the element picker and code panel into the active tab after the user clicks the toolbar icon or presses the shortcut. Nothing is injected without that user action.
- Permission justification, `storage`:
  > Saves the user's settings (output formats, theme, open sections) and the panel position, so they persist between sessions.
- Host permissions: none requested.
- Remote code: **No, I am not using remote code.** All code is in the package.
- Data usage: tick **none** of the data types. ElementLens does not collect or transmit any user data.
- Certify all three statements (no selling of data, no use unrelated to the single purpose, no use for creditworthiness or lending).
- Privacy policy URL: see Links.

---

## Microsoft Edge Add-ons

Dashboard: https://partner.microsoft.com/dashboard/microsoftedge (free developer account).

- Package: the Chrome zip (same build).
- Description: the detailed description above (Edge requires 250 to 5,000 characters).
- Category: Developer tools.
- Logo: `logo-300.png`. Small/large promo tiles optional.
- Screenshots: `screenshot-1.png` to `screenshot-5.png`.
- Search terms (max 21 words in total):
  `css inspector`, `copy html`, `tailwind`, `html to jsx`, `css viewer`, `element inspector`, `web developer tools`
- Privacy policy: required, use the link above. "Does your extension access personal information?" No.
- Website, support contact: see Links.
- Notes for certification:
  > No account needed. To test: open any website, click the ElementLens toolbar icon (or press Alt+Shift+E), hover and click an element, then press Copy. The extension makes no network requests.

---

## Firefox Add-ons (AMO)

Dashboard: https://addons.mozilla.org/developers/ (free account).

- Distribution: **On this site** (listed).
- Package: `element-lens-0.1.1-firefox.zip`.
- Source code: **Yes**, upload `element-lens-0.1.1-sources.zip` (the extension is built and minified by Vite, so AMO reviewers need the source).
- Summary: the Firefox summary above.
- Description: the detailed description above.
- Categories: Web Development.
- Tags: choose from AMO's predefined list, for example "web development" and "developer tools" if offered.
- Support email, support website, homepage, privacy policy: see Links.
- License: **MIT License**.
- Notes to reviewer:
  > Built with WXT (Vite) and TypeScript. To reproduce the package from the attached source:
  > 1. Node.js 22 and npm 10 or newer.
  > 2. `npm ci`
  > 3. `npm run zip:firefox`
  > The output is `.output/element-lens-0.1.1-firefox.zip`.
  >
  > No remote code and no network requests. Bundled fonts (Archivo, Space Grotesk, SIL Open Font License) are web-accessible only so the panel can register them with FontFace. To test: open any website, click the toolbar icon (or Alt+Shift+E), click an element, press Copy.

---

## After approval

1. Replace "Coming soon" on `website/download.html` with the store links.
2. Add the store links to `README.md`.
3. For every update: raise `version` in `package.json`, push a new tag (for example `v0.1.2`), upload the new zips to each store.

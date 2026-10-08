import { browser } from '#imports';

// Unique family names, so the bundled fonts never replace a page's own Archivo/Space Grotesk.
const FONTS = [
  { family: 'ElementLens Grotesk', file: '/fonts/SpaceGrotesk-latin.woff2', weight: '300 700' },
  { family: 'ElementLens Archivo', file: '/fonts/Archivo-latin.woff2', weight: '400 800' },
] as const;

/**
 * Registers the panel fonts with the page's FontFaceSet (@font-face does not work inside a
 * shadow root). Fire and forget: until loaded, or if a strict page CSP blocks them, the panel
 * falls back to system fonts.
 */
export function loadPanelFonts() {
  const registered = new Set(Array.from(document.fonts, (f) => f.family.replace(/["']/g, '')));
  for (const { family, file, weight } of FONTS) {
    if (registered.has(family)) continue;
    const face = new FontFace(family, `url("${browser.runtime.getURL(file)}") format("woff2")`, {
      weight,
      display: 'swap',
    });
    document.fonts.add(face);
    face.load().catch(() => {
      // Blocked or unavailable: system font fallback.
    });
  }
}

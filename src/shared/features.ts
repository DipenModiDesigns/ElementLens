/**
 * Feature switches for work that is built but not shipped yet.
 * jsTab: the JS extraction (src/core/extract/js.ts + entrypoints/main-world.ts) works, but the
 * page-context handshake needs more hardening before release, so the tab shows "Coming soon".
 */
export const FEATURES = {
  jsTab: false,
} as const;

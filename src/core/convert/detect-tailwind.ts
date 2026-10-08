let cached: boolean | null = null;

/**
 * True when the page's own (readable) stylesheets come from Tailwind: v3 and v4 output both
 * define `--tw-*` custom properties. Checked once per page and cached.
 */
export function pageUsesTailwind(maxRules = 4000): boolean {
  if (cached !== null) return cached;
  let seen = 0;
  const scan = (rules: CSSRuleList): boolean => {
    for (const rule of Array.from(rules)) {
      if (++seen > maxRules) return false;
      if (rule.cssText.includes('--tw-')) return true;
      if ('cssRules' in rule && scan((rule as CSSGroupingRule).cssRules)) return true;
    }
    return false;
  };
  cached = false;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (scan(sheet.cssRules)) {
        cached = true;
        break;
      }
    } catch {
      // cross-origin stylesheet
    }
    if (seen > maxRules) break;
  }
  return cached;
}

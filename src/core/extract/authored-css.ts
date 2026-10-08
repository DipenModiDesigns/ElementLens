import { parseDeclarations, splitTopLevel } from './css-text';
import { formatRule, type Declaration } from './styles';

/**
 * "Site rules": the page's own CSS rules that match the element (and optionally its children),
 * as written by the site, including :hover/:focus states, ::before/::after and @media blocks.
 * Cross-origin stylesheets cannot be read (browser security) and are counted instead.
 */

export interface AuthoredOptions {
  includeChildren?: boolean;
  /** true: keep @media blocks (all breakpoints). false: only rules active right now, flattened. */
  mediaQueries?: boolean;
}

export interface AuthoredResult {
  css: string;
  matchedRules: number;
  skippedSheets: number;
}

// State pseudo-classes and pseudo-elements: removed before matching, so `.btn:hover` and
// `.card::before` count as rules for `.btn` / `.card`. Structural ones (:first-child) stay.
const STATE_PSEUDO =
  /::?(?:hover|focus-visible|focus-within|focus|active|visited|link|any-link|checked|disabled|enabled|placeholder-shown|target|before|after|placeholder|marker|selection|first-letter|first-line|file-selector-button|backdrop|-webkit-[\w-]+|-moz-[\w-]+)(?:\([^)]*\))?/g;

// Resets that match everything (`*`, `html`, `body`, `:root`) would drown the useful rules.
const GENERIC = /^(?:\*|html|body|:root|:host)$/;

export function stripStates(selector: string): string {
  const stripped = selector.replace(STATE_PSEUDO, '').trim();
  if (!stripped) return '*';
  // A trailing combinator (".a > ::before" -> ".a >") needs a subject.
  return /[>+~]$/.test(stripped) ? `${stripped} *` : stripped;
}

export function isGeneric(selector: string): boolean {
  return GENERIC.test(stripStates(selector));
}

const indentBlock = (text: string) =>
  text
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n');

function conditionOf(rule: CSSRule): string {
  return rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
}

export function authoredCss(root: Element, options: AuthoredOptions = {}): AuthoredResult {
  const { includeChildren = false, mediaQueries = true } = options;
  const isPageRoot = root === document.documentElement || root === document.body;
  let matchedRules = 0;
  let skippedSheets = 0;
  const matchedDecls: Declaration[] = [];

  const matches = (selector: string): boolean => {
    if (!isPageRoot && isGeneric(selector)) return false;
    const subject = stripStates(selector);
    try {
      return root.matches(subject) || (includeChildren && root.querySelector(subject) !== null);
    } catch {
      return false; // vendor-specific or unsupported selector syntax
    }
  };

  const walk = (rules: CSSRuleList): string[] => {
    const blocks: string[] = [];
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const parts = splitTopLevel(rule.selectorText, ',').filter(matches);
        if (parts.length === 0) continue;
        const decls = parseDeclarations(rule.style.cssText);
        matchedRules++;
        matchedDecls.push(...decls);
        blocks.push(formatRule(parts.join(',\n'), decls));
      } else if (rule instanceof CSSMediaRule) {
        const inner = walk(rule.cssRules);
        if (inner.length === 0) continue;
        if (mediaQueries) blocks.push(`${conditionOf(rule)} {\n${indentBlock(inner.join('\n\n'))}\n}`);
        else if (matchMedia(rule.media.mediaText).matches) blocks.push(...inner);
      } else if (rule instanceof CSSImportRule) {
        try {
          if (rule.styleSheet) blocks.push(...walk(rule.styleSheet.cssRules));
        } catch {
          skippedSheets++;
        }
      } else if ('cssRules' in rule && !(rule instanceof CSSKeyframesRule)) {
        // @supports, @container, @layer and other grouping rules: keep the wrapper.
        const inner = walk((rule as CSSGroupingRule).cssRules);
        if (inner.length) blocks.push(`${conditionOf(rule)} {\n${indentBlock(inner.join('\n\n'))}\n}`);
      }
    }
    return blocks;
  };

  const sheets = [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets ?? [])];
  const blocks: string[] = [];
  const keyframes: CSSKeyframesRule[] = [];
  for (const sheet of sheets) {
    if (sheet.disabled) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      skippedSheets++;
      continue;
    }
    blocks.push(...walk(rules));
    for (const rule of Array.from(rules)) if (rule instanceof CSSKeyframesRule) keyframes.push(rule);
  }

  // Keyframes referenced by matched animations.
  const animationText = matchedDecls
    .filter(([prop]) => prop === 'animation' || prop === 'animation-name')
    .map(([, value]) => value)
    .join(' ');
  for (const rule of keyframes) {
    if (new RegExp(`(^|[\\s,])${rule.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s,]|$)`).test(animationText)) {
      blocks.push(rule.cssText);
    }
  }

  // CSS variables used by the matched rules, resolved on this element.
  const css = blocks.join('\n\n');
  const names = [...new Set(Array.from(css.matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1]!))];
  const computed = getComputedStyle(root);
  const vars: Declaration[] = names
    .map((name): Declaration => [name, computed.getPropertyValue(name).trim()])
    .filter(([, value]) => value !== '');
  const variables = vars.length
    ? `/* CSS variables used below, with their values on this page */\n${formatRule(':root', vars)}\n\n`
    : '';

  return { css: variables + css, matchedRules, skippedSheets };
}

import { cssEscape } from './describe';

/** Selectors and test locators for an element, preferring stable hooks (test ids, ids, roles). */

const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
// Generated or state-like class names make brittle selectors: CSS-in-JS hashes, Tailwind
// variants (contain ":"), long hex/number runs.
const UNSTABLE_CLASS = /^(css|sc|jsx|emotion|svelte|chakra|mui)-|[0-9a-f]{6,}|\d{3,}|[:[\]/]/;
const SVG_NS = 'http://www.w3.org/2000/svg';

const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const jsQuote = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function unique(selector: string, doc: Document): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function testAttr(el: Element): [string, string] | null {
  for (const attr of TEST_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) return [attr, value];
  }
  return null;
}

function step(el: Element): string {
  const classes = Array.from(el.classList)
    .filter((c) => !UNSTABLE_CLASS.test(c))
    .slice(0, 2);
  let s = el.localName + classes.map((c) => `.${cssEscape(c)}`).join('');
  const parent = el.parentElement;
  if (parent) {
    const sameTag = Array.from(parent.children).filter((c) => c.localName === el.localName);
    const ambiguous = Array.from(parent.children).filter((c) => c.matches(s)).length > 1;
    if (ambiguous) s += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
  }
  return s;
}

/** Shortest unique CSS selector we can find, falling back to a full nth-of-type path. */
export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  const attr = testAttr(el);
  if (attr && unique(`[${attr[0]}=${quote(attr[1])}]`, doc)) return `[${attr[0]}=${quote(attr[1])}]`;
  if (el.id && unique(`#${cssEscape(el.id)}`, doc)) return `#${cssEscape(el.id)}`;

  const steps: string[] = [];
  for (let cur: Element | null = el; cur && cur !== doc.documentElement; cur = cur.parentElement) {
    steps.unshift(step(cur));
    const selector = steps.join(' > ');
    if (unique(selector, doc)) return selector;
    const parent = cur.parentElement;
    if (parent?.id && unique(`#${cssEscape(parent.id)}`, doc)) {
      const anchored = `#${cssEscape(parent.id)} > ${selector}`;
      if (unique(anchored, doc)) return anchored;
    }
  }
  return steps.join(' > ');
}

export function xpath(el: Element): string {
  if (el.id && el.ownerDocument.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) {
    return `//*[@id=${quote(el.id)}]`;
  }
  const parts: string[] = [];
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const name = cur.namespaceURI === SVG_NS ? `*[local-name()=${quote(cur.localName)}]` : cur.localName;
    const parent = cur.parentElement;
    const same = parent ? Array.from(parent.children).filter((c) => c.localName === cur!.localName) : [cur];
    parts.unshift(same.length > 1 ? `${name}[${same.indexOf(cur) + 1}]` : name);
  }
  return `/${parts.join('/')}`;
}

const INPUT_ROLES: Record<string, string> = {
  button: 'button', submit: 'button', reset: 'button', checkbox: 'checkbox', radio: 'radio', range: 'slider',
  search: 'searchbox', email: 'textbox', tel: 'textbox', text: 'textbox', url: 'textbox', number: 'spinbutton',
};

/** Implicit ARIA role for common elements (enough for test locators, not a full a11y tree). */
export function implicitRole(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.split(/\s+/)[0]!;
  const tag = el.localName;
  if (tag === 'button') return 'button';
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'input') return INPUT_ROLES[el.getAttribute('type') ?? 'text'] ?? null;
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'img' && el.getAttribute('alt')) return 'img';
  return null;
}

export function accessibleName(el: Element): string {
  const label =
    el.getAttribute('aria-label') ||
    el.getAttribute('alt') ||
    el.getAttribute('title') ||
    (el.localName === 'input' ? el.getAttribute('placeholder') || el.getAttribute('value') : null) ||
    el.textContent;
  const name = (label ?? '').replace(/\s+/g, ' ').trim();
  return name.length > 60 ? '' : name;
}

export interface Locator {
  label: string;
  value: string;
}

export function locators(el: Element): Locator[] {
  const css = uniqueSelector(el);
  const attr = testAttr(el);
  const role = implicitRole(el);
  const name = role ? accessibleName(el) : '';

  let playwright = `page.locator(${jsQuote(css)})`;
  if (attr?.[0] === 'data-testid') playwright = `page.getByTestId(${jsQuote(attr[1])})`;
  else if (role && name) playwright = `page.getByRole(${jsQuote(role)}, { name: ${jsQuote(name)} })`;

  let cypress = `cy.get(${jsQuote(css)})`;
  if (attr) cypress = `cy.get(${jsQuote(`[${attr[0]}=${quote(attr[1])}]`)})`;
  else if ((role === 'button' || role === 'link') && name) cypress = `cy.contains(${jsQuote(el.localName)}, ${jsQuote(name)})`;

  return [
    { label: 'CSS selector', value: css },
    { label: 'XPath', value: xpath(el) },
    { label: 'Playwright', value: playwright },
    { label: 'Cypress', value: cypress },
  ];
}

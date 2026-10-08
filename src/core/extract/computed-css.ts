import { shortSelector } from './describe';
import { cleanStyles, formatRule, type Declaration, type StyleMap } from './styles';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PSEUDOS = ['::before', '::after'] as const;

export function readStyleMap(decl: CSSStyleDeclaration): StyleMap {
  const map: StyleMap = {};
  for (let i = 0; i < decl.length; i++) {
    const prop = decl.item(i);
    map[prop] = decl.getPropertyValue(prop);
  }
  return map;
}

export interface DefaultStyleProvider {
  /** Browser default computed styles for an element of the same kind as `el`. */
  get(el: Element, pseudo?: string): StyleMap;
  dispose(): void;
}

/**
 * Measures browser defaults with reference elements inside `container` (our Shadow DOM),
 * where page stylesheets cannot reach. `all: initial` on the wrapper also stops inheritance.
 */
export function createDefaultStyleProvider(container: Node & ParentNode): DefaultStyleProvider {
  const wrapper = document.createElement('div');
  wrapper.setAttribute(
    'style',
    // No visibility/pointer-events here: those inherit and would skew the measured defaults.
    'all: initial; position: fixed; top: 0; left: -99999px; width: 0; height: 0; overflow: hidden; opacity: 0;',
  );
  container.append(wrapper);
  const cache = new Map<string, StyleMap>();

  const createReference = (el: Element): Element => {
    if (el.namespaceURI === SVG_NS) return document.createElementNS(SVG_NS, el.localName);
    // Never create the page's own custom elements: that could run its constructors.
    if (el.localName.includes('-')) return document.createElement('elementlens-ref');
    const ref = document.createElement(el.localName);
    const type = el.getAttribute('type');
    if (type && (el.localName === 'input' || el.localName === 'button')) ref.setAttribute('type', type);
    return ref;
  };

  return {
    get(el, pseudo = '') {
      const key = `${el.namespaceURI}|${el.localName}|${el.getAttribute('type') ?? ''}|${pseudo}`;
      let styles = cache.get(key);
      if (!styles) {
        const ref = createReference(el);
        wrapper.append(ref);
        styles = readStyleMap(getComputedStyle(ref, pseudo || null));
        ref.remove();
        cache.set(key, styles);
      }
      return styles;
    },
    dispose() {
      wrapper.remove();
      cache.clear();
    },
  };
}

export interface CssOptions {
  /** Also emit rules for descendants. Default false. */
  includeChildren?: boolean;
  /** Nodes to leave out entirely (e.g. our own UI host). */
  skip?: (node: Node) => boolean;
  /** Safety cap for huge subtrees. */
  maxElements?: number;
}

export interface CssResult {
  css: string;
  truncated: boolean;
}

interface Rule {
  /** Selector steps below the root element. */
  path: string[];
  pseudo: string;
  decls: Declaration[];
}

// Their size is intrinsic, so width/height stay meaningful on children.
const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'input', 'textarea', 'select', 'object', 'embed', 'audio']);
/**
 * Flex and grid items are "blockified": an inline <img> or <span> reports display: block.
 * That is the container's doing, not the item's style, so drop it.
 */
function withoutBlockified(decls: Declaration[], parent: StyleMap | undefined): Declaration[] {
  if (!parent || !/flex|grid/.test(parent.display ?? '')) return decls;
  return decls.filter(([prop, value]) => !(prop === 'display' && value === 'block'));
}

const NO_STYLE = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'title', 'br', 'wbr']);

export interface PseudoStyle {
  pseudo: string;
  decls: Declaration[];
}

/** Cleaned declarations for one element and its ::before/::after. */
export interface ElementStyle {
  decls: Declaration[];
  pseudos: PseudoStyle[];
}

export interface StylesResult {
  root: Element;
  /** In document order; only elements that were styled (scripts etc. are skipped). */
  styles: Map<Element, ElementStyle>;
  includeChildren: boolean;
  truncated: boolean;
}

/**
 * Cleaned computed declarations per element: values that differ from browser defaults, with
 * children only listing inherited values that differ from their parent, flex/grid blockification
 * and layout-derived child sizes removed. Shared by CSS, Tailwind and inline-style output.
 */
export function collectStyles(root: Element, defaults: DefaultStyleProvider, options: CssOptions = {}): StylesResult {
  const { includeChildren = false, skip, maxElements = 300 } = options;
  const styles = new Map<Element, ElementStyle>();
  let truncated = false;

  const visit = (el: Element, parent: StyleMap | undefined) => {
    const own = readStyleMap(getComputedStyle(el));
    const isSvg = el.namespaceURI === SVG_NS;
    let decls = withoutBlockified(cleanStyles(own, defaults.get(el), { isSvg, inheritFrom: parent }), parent);
    if (el !== root && !isSvg && !REPLACED.has(el.localName)) {
      // Computed sizes of children come from layout; repeating them as fixed px is misleading.
      decls = decls.filter(([prop]) => prop !== 'width' && prop !== 'height');
    }

    const pseudos: PseudoStyle[] = [];
    for (const pseudo of PSEUDOS) {
      const pseudoStyles = getComputedStyle(el, pseudo);
      if (!pseudoStyles.content || pseudoStyles.content === 'none' || pseudoStyles.content === 'normal') continue;
      const pseudoDecls = cleanStyles(readStyleMap(pseudoStyles), defaults.get(el, pseudo), {
        isSvg,
        keep: ['content'],
        inheritFrom: own,
      });
      // A text ::before/::after is sized by its text; only empty decorative ones need a size.
      const hasText = /^["'].+["']$/.test(pseudoStyles.content);
      const sized = hasText ? pseudoDecls.filter(([prop]) => prop !== 'width' && prop !== 'height') : pseudoDecls;
      pseudos.push({ pseudo, decls: withoutBlockified(sized, own) });
    }
    styles.set(el, { decls, pseudos });

    if (!includeChildren) return;
    for (const child of Array.from(el.children)) {
      if (skip?.(child) || NO_STYLE.has(child.localName)) continue;
      if (styles.size >= maxElements) {
        truncated = true;
        return;
      }
      visit(child, own);
    }
  };

  visit(root, undefined);
  return { root, styles, includeChildren, truncated };
}

/**
 * CSS rules from collected styles. Child selectors are relative to the root (`div.card > h2`);
 * siblings with identical styles share one rule, others get `:nth-child()`.
 * `pseudoOnly` emits just ::before/::after rules (used next to inline styles).
 */
export function stylesToCss({ root, styles, includeChildren }: StylesResult, options: { pseudoOnly?: boolean } = {}): string {
  const { pseudoOnly = false } = options;

  const rulesFor = (el: Element): Rule[] => {
    const style = styles.get(el);
    if (!style) return [];
    const rules: Rule[] = [];
    if (!pseudoOnly && (style.decls.length > 0 || el === root)) rules.push({ path: [], pseudo: '', decls: style.decls });
    for (const p of style.pseudos) rules.push({ path: [], pseudo: p.pseudo, decls: p.decls });
    if (!includeChildren) return rules;

    const groups = new Map<string, { child: Element; index: number }[]>();
    Array.from(el.children).forEach((child, i) => {
      if (!styles.has(child)) return;
      const step = shortSelector(child);
      const group = groups.get(step) ?? [];
      group.push({ child, index: i + 1 });
      groups.set(step, group);
    });

    for (const [step, members] of groups) {
      const subtrees = members.map(({ child }) => rulesFor(child));
      const signature = JSON.stringify(subtrees[0]);
      if (subtrees.every((r) => JSON.stringify(r) === signature)) {
        rules.push(...subtrees[0]!.map((r) => ({ ...r, path: [step, ...r.path] })));
      } else {
        subtrees.forEach((sub, i) => {
          const nth = `${step}:nth-child(${members[i]!.index})`;
          rules.push(...sub.map((r) => ({ ...r, path: [nth, ...r.path] })));
        });
      }
    }
    return rules;
  };

  const rootSelector = shortSelector(root);
  return rulesFor(root)
    .map((r) => formatRule([rootSelector, ...r.path].join(' > ') + r.pseudo, r.decls))
    .join('\n\n');
}

/** CSS from computed styles that differ from browser defaults (element, pseudos, children). */
export function computedCss(root: Element, defaults: DefaultStyleProvider, options: CssOptions = {}): CssResult {
  const collected = collectStyles(root, defaults, options);
  return { css: stylesToCss(collected), truncated: collected.truncated };
}

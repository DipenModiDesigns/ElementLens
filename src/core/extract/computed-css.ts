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

/**
 * CSS from computed styles that differ from browser defaults, for the element, its
 * ::before/::after and optionally all descendants. Child selectors are relative to the root
 * (`div.card > h2`); siblings with identical styles share one rule, others get `:nth-child()`.
 */
export function computedCss(root: Element, defaults: DefaultStyleProvider, options: CssOptions = {}): CssResult {
  const { includeChildren = false, skip, maxElements = 300 } = options;
  let count = 0;
  let truncated = false;

  const ownRules = (el: Element, styles: StyleMap, parent: StyleMap | undefined): Rule[] => {
    const isRoot = el === root;
    const isSvg = el.namespaceURI === SVG_NS;
    // Children only list inherited values (color, font...) when they differ from the parent.
    let decls = withoutBlockified(cleanStyles(styles, defaults.get(el), { isSvg, inheritFrom: parent }), parent);
    if (!isRoot && !isSvg && !REPLACED.has(el.localName)) {
      // Computed sizes of children come from layout; repeating them as fixed px is misleading.
      decls = decls.filter(([prop]) => prop !== 'width' && prop !== 'height');
    }
    const rules: Rule[] = decls.length > 0 || isRoot ? [{ path: [], pseudo: '', decls }] : [];

    for (const pseudo of PSEUDOS) {
      const pseudoStyles = getComputedStyle(el, pseudo);
      if (!pseudoStyles.content || pseudoStyles.content === 'none' || pseudoStyles.content === 'normal') continue;
      const pseudoDecls = cleanStyles(readStyleMap(pseudoStyles), defaults.get(el, pseudo), {
        isSvg,
        keep: ['content'],
        inheritFrom: styles,
      });
      rules.push({ path: [], pseudo, decls: withoutBlockified(pseudoDecls, styles) });
    }
    return rules;
  };

  const walk = (el: Element, parent: StyleMap | undefined): Rule[] => {
    count++;
    const styles = readStyleMap(getComputedStyle(el));
    const rules = ownRules(el, styles, parent);
    if (!includeChildren) return rules;

    const siblings = Array.from(el.children);
    const groups = new Map<string, { child: Element; index: number }[]>();
    siblings.forEach((child, i) => {
      if (skip?.(child) || NO_STYLE.has(child.localName)) return;
      const step = shortSelector(child);
      const group = groups.get(step) ?? [];
      group.push({ child, index: i + 1 });
      groups.set(step, group);
    });

    for (const [step, members] of groups) {
      const subtrees: Rule[][] = [];
      for (const { child } of members) {
        if (count >= maxElements) {
          truncated = true;
          break;
        }
        subtrees.push(walk(child, styles));
      }
      const [first] = subtrees;
      if (!first) continue;
      const signature = JSON.stringify(first);
      const shared = subtrees.length === members.length && subtrees.every((r) => JSON.stringify(r) === signature);
      if (shared) {
        rules.push(...first.map((r) => ({ ...r, path: [step, ...r.path] })));
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
  const css = walk(root, undefined)
    .map((r) => formatRule([rootSelector, ...r.path].join(' > ') + r.pseudo, r.decls))
    .join('\n\n');
  return { css, truncated };
}

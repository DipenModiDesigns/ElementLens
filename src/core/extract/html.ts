import { toAbsoluteSrcset, toAbsoluteUrl } from './url';

export interface HtmlOptions {
  /** Base for resolving relative URLs, usually `document.baseURI`. */
  baseUrl: string;
  /** Serialize descendants of the root element. Default true. */
  includeChildren?: boolean;
  /** Drop `<script>` and `<noscript>` elements. Default true. */
  stripScripts?: boolean;
  /** Drop HTML comments. Default true. */
  stripComments?: boolean;
  /** Nodes to leave out entirely (e.g. our own UI host). */
  skip?: (node: Node) => boolean;
  indent?: string;
  /** Safety cap for huge subtrees. */
  maxNodes?: number;
}

export interface HtmlResult {
  html: string;
  truncated: boolean;
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
const URL_ATTRS = new Set(['src', 'href', 'xlink:href', 'poster', 'action', 'formaction', 'cite', 'background']);
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset']);
const INLINE_MAX = 100;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Serialize an element to clean, indented HTML with absolute URLs. */
export function serializeHtml(root: Element, options: HtmlOptions): HtmlResult {
  const {
    baseUrl,
    includeChildren = true,
    stripScripts = true,
    stripComments = true,
    skip,
    indent = '  ',
    maxNodes = 5000,
  } = options;

  const lines: string[] = [];
  let count = 0;
  let truncated = false;

  const attrs = (el: Element) => {
    let out = '';
    for (const name of el.getAttributeNames()) {
      let value = el.getAttribute(name) ?? '';
      const lower = name.toLowerCase();
      if (URL_ATTRS.has(lower)) value = toAbsoluteUrl(value, baseUrl);
      else if (SRCSET_ATTRS.has(lower)) value = toAbsoluteSrcset(value, baseUrl);
      out += value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
    }
    return out;
  };

  const keep = (node: Node): boolean => {
    if (skip?.(node)) return false;
    switch (node.nodeType) {
      case ELEMENT_NODE: {
        const tag = (node as Element).localName;
        return !(stripScripts && (tag === 'script' || tag === 'noscript'));
      }
      case TEXT_NODE:
        return collapse(node.textContent ?? '') !== '';
      case COMMENT_NODE:
        return !stripComments;
      default:
        return false;
    }
  };

  const walk = (node: Node, depth: number) => {
    if (truncated) return;
    const pad = indent.repeat(depth);
    if (++count > maxNodes) {
      truncated = true;
      lines.push(`${pad}<!-- truncated: element too large -->`);
      return;
    }

    if (node.nodeType === TEXT_NODE) {
      lines.push(pad + escapeText(collapse(node.textContent ?? '')));
      return;
    }
    if (node.nodeType === COMMENT_NODE) {
      lines.push(`${pad}<!--${(node as Comment).data}-->`);
      return;
    }

    const el = node as Element;
    const tag = el.localName;
    const open = `<${tag}${attrs(el)}>`;
    const close = `</${tag}>`;

    if (VOID.has(tag)) {
      lines.push(pad + open);
      return;
    }
    // Whitespace-sensitive or raw-text content is kept as is.
    if (tag === 'pre') {
      lines.push(pad + open + el.innerHTML + close);
      return;
    }
    if (tag === 'textarea') {
      lines.push(pad + open + escapeText(el.textContent ?? '') + close);
      return;
    }
    if (tag === 'script' || tag === 'style') {
      lines.push(pad + open + (el.textContent ?? '') + close);
      return;
    }

    const children = Array.from(el.childNodes).filter(keep);
    if (children.length === 0) {
      lines.push(pad + open + close);
      return;
    }
    if (depth === 0 && !includeChildren) {
      lines.push(`${pad}${open}…${close}`);
      return;
    }
    const [only] = children;
    if (only && children.length === 1 && only.nodeType === TEXT_NODE) {
      const inline = pad + open + escapeText(collapse(only.textContent ?? '')) + close;
      if (inline.length <= INLINE_MAX) {
        lines.push(inline);
        return;
      }
    }

    lines.push(pad + open);
    for (const child of children) walk(child, depth + 1);
    lines.push(pad + close);
  };

  walk(root, 0);
  return { html: lines.join('\n'), truncated };
}

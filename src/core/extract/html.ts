import { parseDeclarations, reactStyleKey } from './css-text';
import type { Declaration } from './styles';
import { toAbsoluteSrcset, toAbsoluteUrl } from './url';

export type Dialect = 'html' | 'jsx';

export interface HtmlOptions {
  /** Base for resolving relative URLs, usually `document.baseURI`. */
  baseUrl: string;
  /** Output HTML (default) or JSX. */
  dialect?: Dialect;
  /** Serialize descendants of the root element. Default true. */
  includeChildren?: boolean;
  /** Drop `<script>` and `<noscript>` elements. Default true. */
  stripScripts?: boolean;
  /** Drop HTML comments. Default true. */
  stripComments?: boolean;
  /** Nodes to leave out entirely (e.g. our own UI host). */
  skip?: (node: Node) => boolean;
  /** Replace an element's class list (e.g. with Tailwind utilities). `undefined` keeps the original. */
  classFor?: (el: Element) => string | undefined;
  /** Replace an element's style attribute with these declarations. `undefined` keeps the original. */
  styleFor?: (el: Element) => Declaration[] | undefined;
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
const SVG_NS = 'http://www.w3.org/2000/svg';

// HTML attribute -> React prop, where React does not use the HTML name.
const JSX_NAMES: Record<string, string> = {
  class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength',
  minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', contenteditable: 'contentEditable',
  crossorigin: 'crossOrigin', autocomplete: 'autoComplete', autofocus: 'autoFocus', autoplay: 'autoPlay',
  enctype: 'encType', novalidate: 'noValidate', srcset: 'srcSet', srcdoc: 'srcDoc', srclang: 'srcLang',
  hreflang: 'hrefLang', frameborder: 'frameBorder', allowfullscreen: 'allowFullScreen', datetime: 'dateTime',
  'http-equiv': 'httpEquiv', 'accept-charset': 'acceptCharset', charset: 'charSet', spellcheck: 'spellCheck',
  cellpadding: 'cellPadding', cellspacing: 'cellSpacing', usemap: 'useMap', inputmode: 'inputMode',
  enterkeyhint: 'enterKeyHint', playsinline: 'playsInline', referrerpolicy: 'referrerPolicy',
  formaction: 'formAction', accesskey: 'accessKey', marginwidth: 'marginWidth', marginheight: 'marginHeight',
  'xlink:href': 'xlinkHref', 'xml:lang': 'xmlLang', 'xml:space': 'xmlSpace', popovertarget: 'popoverTarget',
};
// React props that may be written bare (`disabled`). Any other empty attribute needs `=""`,
// because a bare prop means `true` (`alt` would become alt={true}).
const JSX_BOOLEAN = new Set([
  'allowFullScreen', 'async', 'autoFocus', 'autoPlay', 'checked', 'controls', 'default', 'defaultChecked',
  'defer', 'disabled', 'formNoValidate', 'hidden', 'inert', 'itemScope', 'loop', 'multiple', 'muted',
  'noValidate', 'open', 'playsInline', 'readOnly', 'required', 'reversed', 'selected',
]);
// Uncontrolled equivalents, so pasted markup does not trigger React's controlled-input warnings.
const JSX_FORM_DEFAULTS: Record<string, string> = { value: 'defaultValue', checked: 'defaultChecked' };

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const jsxText = (s: string) => escapeText(s).replace(/[{}]/g, (c) => `{'${c}'}`);
const templateLiteral = (s: string) => `{\`${s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`}`;
const jsString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function styleObject(decls: Declaration[]): string {
  const entries = decls.map(([prop, value]) => {
    const key = reactStyleKey(prop);
    return `${/^[A-Za-z]\w*$/.test(key) ? key : jsString(key)}: ${jsString(value)}`;
  });
  return `{{ ${entries.join(', ')} }}`;
}

function jsxName(el: Element, name: string): string {
  const lower = name.toLowerCase();
  if (JSX_NAMES[lower]) return JSX_NAMES[lower];
  if ((el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select') && JSX_FORM_DEFAULTS[lower]) {
    return JSX_FORM_DEFAULTS[lower];
  }
  // SVG presentation attributes are camelCase in React (stroke-width -> strokeWidth).
  if (el.namespaceURI === SVG_NS && name.includes('-') && !/^(data|aria)-/.test(name)) {
    return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  }
  return name;
}

/** Serialize an element to clean, indented HTML or JSX with absolute URLs. */
export function serializeHtml(root: Element, options: HtmlOptions): HtmlResult {
  const {
    baseUrl,
    dialect = 'html',
    includeChildren = true,
    stripScripts = true,
    stripComments = true,
    skip,
    classFor,
    styleFor,
    indent = '  ',
    maxNodes = 5000,
  } = options;
  const jsx = dialect === 'jsx';

  const lines: string[] = [];
  let count = 0;
  let truncated = false;

  /** Final attribute list after URL fixing and class/style replacement. */
  const attributeList = (el: Element): [string, string][] => {
    const list: [string, string][] = [];
    for (const name of el.getAttributeNames()) {
      let value = el.getAttribute(name) ?? '';
      const lower = name.toLowerCase();
      if (URL_ATTRS.has(lower)) value = toAbsoluteUrl(value, baseUrl);
      else if (SRCSET_ATTRS.has(lower)) value = toAbsoluteSrcset(value, baseUrl);
      list.push([name, value]);
    }
    const replace = (attr: string, value: string | undefined) => {
      if (value === undefined) return;
      const i = list.findIndex(([n]) => n === attr);
      if (i >= 0) list.splice(i, 1);
      if (value) list.splice(i >= 0 ? i : list.length, 0, [attr, value]);
    };
    replace('class', classFor?.(el));
    const decls = styleFor?.(el);
    replace('style', decls && decls.map(([p, v]) => `${p}: ${v}`).join('; '));
    return list;
  };

  const attrs = (el: Element) => {
    let out = '';
    for (const [name, value] of attributeList(el)) {
      if (!jsx) {
        out += value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
        continue;
      }
      // String event handlers are not valid JSX.
      if (/^on[a-z]+$/i.test(name)) continue;
      const prop = jsxName(el, name);
      if (name === 'style') out += ` style=${styleObject(parseDeclarations(value))}`;
      else if (value === '') out += JSX_BOOLEAN.has(prop) ? ` ${prop}` : ` ${prop}=""`;
      else out += ` ${prop}="${escapeAttr(value)}"`;
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

  const text = (s: string) => (jsx ? jsxText(collapse(s)) : escapeText(collapse(s)));

  const walk = (node: Node, depth: number) => {
    if (truncated) return;
    const pad = indent.repeat(depth);
    if (++count > maxNodes) {
      truncated = true;
      lines.push(jsx ? `${pad}{/* truncated: element too large */}` : `${pad}<!-- truncated: element too large -->`);
      return;
    }

    if (node.nodeType === TEXT_NODE) {
      lines.push(pad + text(node.textContent ?? ''));
      return;
    }
    if (node.nodeType === COMMENT_NODE) {
      const data = (node as Comment).data;
      lines.push(jsx ? `${pad}{/*${data.replace(/\*\//g, '* /')}*/}` : `${pad}<!--${data}-->`);
      return;
    }

    const el = node as Element;
    const tag = el.localName;
    const attributes = attrs(el);
    const open = `<${tag}${attributes}>`;
    const close = `</${tag}>`;
    const selfClosing = `<${tag}${attributes} />`;

    if (VOID.has(tag)) {
      lines.push(pad + (jsx ? selfClosing : open));
      return;
    }
    // Whitespace-sensitive or raw-text content is kept as is.
    if (tag === 'pre') {
      lines.push(pad + open + (jsx ? templateLiteral(el.textContent ?? '') : el.innerHTML) + close);
      return;
    }
    if (tag === 'textarea') {
      lines.push(
        pad +
          (jsx
            ? `<${tag}${attributes} defaultValue=${templateLiteral(el.textContent ?? '')} />`
            : open + escapeText(el.textContent ?? '') + close),
      );
      return;
    }
    if (tag === 'script' || tag === 'style') {
      const raw = el.textContent ?? '';
      if (!jsx) lines.push(pad + open + raw + close);
      else if (tag === 'style') lines.push(pad + open + templateLiteral(raw) + close);
      else lines.push(`${pad}<script${attributes} dangerouslySetInnerHTML={{ __html: ${templateLiteral(raw).slice(1, -1)} }} />`);
      return;
    }

    const children = Array.from(el.childNodes).filter(keep);
    if (children.length === 0) {
      lines.push(pad + (jsx ? selfClosing : open + close));
      return;
    }
    if (depth === 0 && !includeChildren) {
      lines.push(`${pad}${open}${jsx ? '{/* … */}' : '…'}${close}`);
      return;
    }
    const [only] = children;
    if (only && children.length === 1 && only.nodeType === TEXT_NODE) {
      const inline = pad + open + text(only.textContent ?? '') + close;
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

/** PascalCase component name from an element: first class, else id, else "Element". */
export function componentName(el: Element): string {
  const source = el.classList[0] ?? el.id ?? '';
  const words = source.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
  return /^[A-Z]/.test(name) ? name : 'Element';
}

/** Wrap JSX markup in a default-exported React function component. */
export function wrapComponent(jsx: string, name: string): string {
  const body = jsx
    .split('\n')
    .map((line) => (line ? `    ${line}` : line))
    .join('\n');
  return `export default function ${name}() {\n  return (\n${body}\n  );\n}`;
}

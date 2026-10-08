import type { StylesResult } from '../extract/computed-css';
import type { Declaration } from '../extract/styles';

/** Structured element tree for tooling (design handoff, AI prompts, scripts). */

export interface JsonNode {
  tag: string;
  attributes: Record<string, string>;
  /** Direct text of this element (children's text is in their own nodes). */
  text?: string;
  /** Cleaned computed styles, same as the CSS output. */
  styles: Record<string, string>;
  pseudos?: Record<string, Record<string, string>>;
  /** Border box in page coordinates, rounded to whole pixels. */
  box: { x: number; y: number; width: number; height: number };
  children: JsonNode[];
}

export interface JsonExport {
  generator: string;
  url: string;
  title: string;
  capturedAt: string;
  selector: string;
  truncated: boolean;
  root: JsonNode;
}

const toRecord = (decls: Declaration[]) => Object.fromEntries(decls);

export function elementToJson(
  collected: StylesResult,
  meta: { generator: string; url: string; title: string; selector: string; capturedAt?: string },
): JsonExport {
  const { root, styles } = collected;

  const node = (el: Element): JsonNode => {
    const style = styles.get(el);
    const rect = el.getBoundingClientRect();
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const result: JsonNode = {
      tag: el.localName,
      attributes: Object.fromEntries(el.getAttributeNames().map((n) => [n, el.getAttribute(n) ?? ''])),
      ...(text && { text }),
      styles: toRecord(style?.decls ?? []),
      ...(style?.pseudos.length && {
        pseudos: Object.fromEntries(style.pseudos.map((p) => [p.pseudo, toRecord(p.decls)])),
      }),
      box: {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      children: Array.from(el.children)
        .filter((c) => styles.has(c))
        .map(node),
    };
    return result;
  };

  return {
    generator: meta.generator,
    url: meta.url,
    title: meta.title,
    capturedAt: meta.capturedAt ?? new Date().toISOString(),
    selector: meta.selector,
    truncated: collected.truncated,
    root: node(root),
  };
}

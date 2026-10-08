import type { Declaration } from './styles';

/** Split on a separator at the top level only (not inside (), [], or quotes). */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && ch === separator) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** "color: red; margin: 0 auto !important" -> [["color", "red"], ["margin", "0 auto !important"]] */
export function parseDeclarations(cssText: string): Declaration[] {
  const decls: Declaration[] = [];
  for (const part of splitTopLevel(cssText, ';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    decls.push([part.slice(0, colon).trim(), part.slice(colon + 1).trim()]);
  }
  return decls;
}

/** CSS property -> React style key: margin-top -> marginTop, -webkit-x -> WebkitX, --var kept. */
export function reactStyleKey(prop: string): string {
  if (prop.startsWith('--')) return prop;
  const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return prop.startsWith('-ms-') ? camel.charAt(0).toLowerCase() + camel.slice(1) : camel;
}

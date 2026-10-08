/** Parent element, crossing open shadow root boundaries (shadow child -> its host). */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Ancestors from the document root down to (and including) the element. */
export function elementPath(el: Element): Element[] {
  const path: Element[] = [];
  for (let cur: Element | null = el; cur; cur = parentOf(cur)) path.unshift(cur);
  return path;
}

/** Human label like `div#main.card.shadow…`, used in the overlay and breadcrumb. */
export function describeElement(el: Element, maxClasses = 2): string {
  let out = el.localName;
  if (el.id) out += `#${el.id}`;
  const classes = Array.from(el.classList);
  for (const cls of classes.slice(0, maxClasses)) out += `.${cls}`;
  if (classes.length > maxClasses) out += '…';
  return out;
}

export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/([^\w-])/g, '\\$1');
}

/** Short, readable selector for generated CSS: `#id`, `tag.first-class` or `tag`. */
export function shortSelector(el: Element): string {
  if (el.id) return `#${cssEscape(el.id)}`;
  const cls = el.classList[0];
  return cls ? `${el.localName}.${cssEscape(cls)}` : el.localName;
}

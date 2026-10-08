import { parentOf } from '@/core/extract/describe';

/** Topmost page element at a point, ignoring our own UI and drilling into open shadow roots. */
export function elementAt(x: number, y: number, host: Element): Element | null {
  let el = document.elementsFromPoint(x, y).find((e) => e !== host) ?? null;
  while (el?.shadowRoot) {
    const shadow = el.shadowRoot;
    const inner = shadow.elementsFromPoint(x, y).find((e) => e.getRootNode() === shadow);
    if (!inner) break;
    el = inner;
  }
  return el;
}

/** Nearest scrollable ancestor below the document root (the page itself scrolls natively). */
export function scrollableAncestor(el: Element): Element | null {
  for (let cur: Element | null = el; cur; cur = parentOf(cur)) {
    if (cur === document.documentElement || cur === document.body) return null;
    const { overflowX, overflowY } = getComputedStyle(cur);
    const canY = /auto|scroll|overlay/.test(overflowY) && cur.scrollHeight > cur.clientHeight;
    const canX = /auto|scroll|overlay/.test(overflowX) && cur.scrollWidth > cur.clientWidth;
    if (canY || canX) return cur;
  }
  return null;
}

/** Element neighbours for tree navigation, skipping our own UI host. */
export function neighbours(el: Element, host: Element) {
  const skipHost = (e: Element | null, step: (e: Element) => Element | null) => {
    while (e === host) e = step(e);
    return e;
  };
  return {
    parent: parentOf(el),
    child: skipHost(el.firstElementChild, (e) => e.nextElementSibling),
    prev: skipHost(el.previousElementSibling, (e) => e.previousElementSibling),
    next: skipHost(el.nextElementSibling, (e) => e.nextElementSibling),
  };
}

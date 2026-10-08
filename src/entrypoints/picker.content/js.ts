import { browser } from '#imports';
import { mergeReports, scanAttributes, type JsReport } from '@/core/extract/js';
import { MAIN_WORLD_MESSAGE } from '@/shared/messages';

// The JS tab falls back to the DOM-only report instead of waiting forever.
const MAIN_WORLD_TIMEOUT = 2000;

let mainWorld: Promise<boolean> | null = null;

/** Ask the background to inject the page-context helper once per page. */
function ensureMainWorld(): Promise<boolean> {
  mainWorld ??= Promise.race([
    browser.runtime
      .sendMessage({ type: MAIN_WORLD_MESSAGE })
      .then((ok) => ok === true)
      .catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), MAIN_WORLD_TIMEOUT)),
  ]).then((ok) => {
    if (!ok) mainWorld = null; // allow a retry on the next request
    return ok;
  });
  return mainWorld;
}

/** Ask the page-context helper about the element. The exchange is synchronous DOM events. */
function askPage(el: Element, includeChildren: boolean): Partial<JsReport> | null {
  let detail: string | null = null;
  const onResult = (e: Event) => {
    detail = String((e as CustomEvent).detail);
  };
  document.addEventListener('elementlens:result', onResult, { once: true });
  el.dispatchEvent(
    new CustomEvent('elementlens:inspect', { detail: JSON.stringify({ includeChildren }), composed: true }),
  );
  document.removeEventListener('elementlens:result', onResult);
  if (detail === null) return null;
  try {
    return JSON.parse(detail) as Partial<JsReport>;
  } catch {
    return null;
  }
}

export async function collectJs(
  el: Element,
  includeChildren: boolean,
  skip: (node: Node) => boolean,
): Promise<JsReport> {
  const dom = scanAttributes(el, { includeChildren, skip });
  const page = (await ensureMainWorld()) ? askPage(el, includeChildren) : null;
  return mergeReports(dom, page);
}

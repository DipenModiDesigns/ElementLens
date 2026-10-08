import { describeElement } from './describe';

/**
 * What JavaScript we can attribute to an element. Browsers do not expose listeners added with
 * addEventListener() to extensions, so this is always partial and the report says so.
 */

export type HandlerSource = 'inline' | 'react' | 'vue' | 'jquery' | 'jquery-delegated';

export interface HandlerInfo {
  element: string;
  event: string;
  source: HandlerSource;
  code: string;
}

export interface DirectiveInfo {
  element: string;
  name: string;
  value: string;
}

export interface JsReport {
  /** Libraries detected on the page, e.g. "React", "jQuery 3.7.1". */
  libraries: string[];
  /** Component chain from outer to inner, e.g. ["App", "ProductCard"]. */
  components: string[];
  handlers: HandlerInfo[];
  directives: DirectiveInfo[];
  scripts: string[];
  /** False when the page-context helper could not run (framework data then missing). */
  pageContext: boolean;
  truncated: boolean;
}

export interface JsScanOptions {
  includeChildren?: boolean;
  skip?: (node: Node) => boolean;
  maxElements?: number;
}

// Framework attributes that wire up behaviour: Alpine, Livewire, htmx, Vue/petite-vue, AngularJS,
// Phoenix LiveView, Stimulus, Bootstrap, Turbo.
const DIRECTIVE =
  /^(x-|@|wire:|hx-|v-|ng-|phx-|data-(action|controller|turbo|toggle|dismiss|target|bs-[\w-]+)$|data-[\w-]+-target$)/;

export const MAX_CODE = 2000;

export function clip(code: string): string {
  return code.length > MAX_CODE ? `${code.slice(0, MAX_CODE)}\n/* … truncated */` : code;
}

/** Elements to inspect: the root and, optionally, its descendants (capped). */
export function scanTargets(root: Element, options: JsScanOptions): { elements: Element[]; truncated: boolean } {
  const { includeChildren = false, skip, maxElements = 300 } = options;
  if (!includeChildren) return { elements: [root], truncated: false };
  const elements: Element[] = [];
  const walk = (el: Element) => {
    if (elements.length >= maxElements || skip?.(el)) return;
    elements.push(el);
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  const total = root.querySelectorAll('*').length + 1;
  return { elements, truncated: total > elements.length && elements.length >= maxElements };
}

/** Everything readable from the DOM alone: inline handlers, directives, inline scripts. */
export function scanAttributes(root: Element, options: JsScanOptions = {}): JsReport {
  const { elements, truncated } = scanTargets(root, options);
  const report: JsReport = {
    libraries: [],
    components: [],
    handlers: [],
    directives: [],
    scripts: [],
    pageContext: false,
    truncated,
  };

  for (const el of elements) {
    const label = describeElement(el);
    if (el.localName === 'script') {
      const src = el.getAttribute('src');
      report.scripts.push(src ? `// external: ${src}` : clip((el.textContent ?? '').trim()));
      continue;
    }
    for (const name of el.getAttributeNames()) {
      const value = el.getAttribute(name) ?? '';
      if (/^on[a-z]+$/.test(name)) {
        report.handlers.push({ element: label, event: name.slice(2), source: 'inline', code: clip(value) });
      } else if (name === 'href' && /^\s*javascript:/i.test(value)) {
        report.handlers.push({ element: label, event: 'click (href)', source: 'inline', code: clip(value) });
      } else if (DIRECTIVE.test(name)) {
        report.directives.push({ element: label, name, value });
      }
    }
  }
  return report;
}

/** Combine the DOM scan with what the page-context helper found. */
export function mergeReports(dom: JsReport, page: Partial<JsReport> | null): JsReport {
  if (!page) return dom;
  return {
    ...dom,
    libraries: page.libraries ?? [],
    components: page.components ?? [],
    handlers: [...dom.handlers, ...(page.handlers ?? [])],
    pageContext: true,
    truncated: dom.truncated || Boolean(page.truncated),
  };
}

const SOURCE_LABEL: Record<HandlerSource, string> = {
  inline: 'inline attribute',
  react: 'React prop',
  vue: 'Vue listener',
  jquery: 'jQuery handler',
  'jquery-delegated': 'jQuery delegated handler',
};

export function formatJsReport(report: JsReport, target: string): string {
  const out: string[] = [`// JavaScript for ${target}`];
  if (report.libraries.length) out.push(`// Page uses: ${report.libraries.join(', ')}`);
  if (report.components.length) out.push(`// Component: ${report.components.join(' > ')}`);

  if (report.handlers.length) {
    out.push('', '// Event handlers');
    for (const h of report.handlers) {
      out.push('', `// ${h.element} | ${h.event} | ${SOURCE_LABEL[h.source]}`, h.code);
    }
  }
  if (report.directives.length) {
    out.push('', '// Framework attributes (Alpine, Livewire, htmx, Stimulus, Bootstrap...)');
    for (const d of report.directives) {
      out.push(`// ${d.element}  ${d.name}${d.value ? `="${d.value}"` : ''}`);
    }
  }
  if (report.scripts.length) {
    out.push('', '// Inline scripts');
    for (const s of report.scripts) out.push('', s);
  }

  const found = report.handlers.length + report.directives.length + report.scripts.length > 0;
  if (!found) out.push('', '// No JavaScript found on this element.');
  if (report.truncated) out.push('', '// Scan stopped early: this element is very large.');
  if (!report.pageContext) out.push('', '// Framework data (React, Vue, jQuery) unavailable on this page.');
  out.push(
    '',
    '// Note: listeners added with addEventListener() cannot be read by extensions (browser',
    '// security limit). DevTools > Elements > Event Listeners shows those.',
  );
  return out.join('\n');
}

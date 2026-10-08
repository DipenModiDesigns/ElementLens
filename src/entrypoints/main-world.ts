import { defineUnlistedScript } from '#imports';
import { describeElement } from '@/core/extract/describe';
import { clip, scanTargets, type HandlerInfo, type JsReport } from '@/core/extract/js';

/**
 * Runs in the page's own JS world (injected on demand with world: 'MAIN'), where framework
 * internals such as React props, Vue listeners and jQuery's event store are visible.
 * Protocol: the content script dispatches `elementlens:inspect` on the element; we answer
 * synchronously with `elementlens:result` on document, carrying a JSON string.
 */

// Framework internals are untyped.
type Loose = any;

declare global {
  interface Window {
    __elementLensMain?: boolean;
  }
}

const w = window as Loose;

function source(fn: unknown): string {
  if (typeof fn !== 'function') return String(fn);
  try {
    const code = Function.prototype.toString.call(fn);
    if (/\{\s*\[native code\]\s*\}$/.test(code)) {
      return `/* ${fn.name || 'anonymous'}: native or bound function, source unavailable */`;
    }
    return clip(code);
  } catch {
    return '/* source unavailable */';
  }
}

const keyWith = (el: Element, prefix: string) => Object.keys(el).find((k) => k.startsWith(prefix));
const version = (v: unknown) => (typeof v === 'string' ? v : undefined);
// Production bundles minify component names to one or two letters; those are useless.
const readableName = (n: unknown): n is string => typeof n === 'string' && n.length >= 3;

function componentName(type: Loose): string | null {
  if (!type || typeof type === 'string') return null;
  if (typeof type === 'function') return type.displayName || type.name || null;
  if (typeof type === 'object') return type.displayName || componentName(type.type) || componentName(type.render);
  return null;
}

function reactComponents(el: Element): string[] {
  const key = keyWith(el, '__reactFiber$');
  if (!key) return [];
  const names: string[] = [];
  for (let fiber = (el as Loose)[key]; fiber && names.length < 6; fiber = fiber.return) {
    const name = componentName(fiber.type);
    if (readableName(name) && names.at(-1) !== name) names.push(name);
  }
  return names.reverse();
}

function vueComponents(el: Element): string[] {
  const names: string[] = [];
  for (let c = (el as Loose).__vueParentComponent; c && names.length < 6; c = c.parent) {
    const name = c.type?.name || c.type?.__name;
    if (readableName(name)) names.push(name);
  }
  for (let vm = (el as Loose).__vue__; vm && names.length < 6; vm = vm.$parent) {
    const name = vm.$options?.name;
    if (readableName(name)) names.push(name);
  }
  return names.reverse();
}

function hasKeyOnSomeElement(prefix: string): boolean {
  const els = document.querySelectorAll('body, body *');
  for (let i = 0; i < Math.min(els.length, 300); i++) if (keyWith(els[i]!, prefix)) return true;
  return false;
}

function detectLibraries(): string[] {
  const libs: string[] = [];
  const add = (name: string, v?: unknown) => libs.push(version(v) ? `${name} ${v}` : name);

  if (w.React?.version) add('React', w.React.version);
  else if (document.querySelector('[data-reactroot]') || hasKeyOnSomeElement('__reactFiber$')) add('React');
  if (w.__NEXT_DATA__ || w.next) add('Next.js', w.next?.version);
  if (w.Vue?.version) add('Vue', w.Vue.version);
  else if (w.__VUE__ || document.querySelector('[data-v-app]')) add('Vue');
  if (w.__NUXT__ || w.$nuxt) add('Nuxt');
  if (w.jQuery?.fn?.jquery) add('jQuery', w.jQuery.fn.jquery);
  if (w.Alpine) add('Alpine.js', w.Alpine.version);
  if (w.Livewire) add('Livewire');
  if (w.htmx) add('htmx', w.htmx.version);
  if (w.Stimulus) add('Stimulus');
  const ng = document.querySelector('[ng-version]');
  if (ng) add('Angular', ng.getAttribute('ng-version'));
  if (w.angular?.version) add('AngularJS', w.angular.version.full);
  if (w.__svelte || document.querySelector('[class*="svelte-"]')) add('Svelte');
  if (w.bootstrap) add('Bootstrap JS', w.bootstrap.Tooltip?.VERSION);
  if (w.gsap) add('GSAP', w.gsap.version);
  if (w.Shopify) add('Shopify');
  if (w.Webflow) add('Webflow');
  return libs;
}

function inspect(root: Element, includeChildren: boolean): Partial<JsReport> {
  const { elements, truncated } = scanTargets(root, { includeChildren });
  const handlers: HandlerInfo[] = [];
  const jq = w.jQuery?._data ? w.jQuery : null;

  for (const el of elements) {
    const element = describeElement(el);

    const propsKey = keyWith(el, '__reactProps$');
    const props = propsKey ? (el as Loose)[propsKey] : null;
    for (const [event, value] of Object.entries(props ?? {})) {
      if (/^on[A-Z]/.test(event) && typeof value === 'function') {
        handlers.push({ element, event, source: 'react', code: source(value) });
      }
    }

    for (const [event, invoker] of Object.entries((el as Loose)._vei ?? {})) {
      const value = (invoker as Loose)?.value;
      for (const fn of Array.isArray(value) ? value : [value]) {
        if (typeof fn === 'function') handlers.push({ element, event, source: 'vue', code: source(fn) });
      }
    }

    const events = jq?._data(el, 'events') ?? {};
    for (const [event, list] of Object.entries(events)) {
      for (const h of list as Loose[]) {
        if (!h.selector) handlers.push({ element, event, source: 'jquery', code: source(h.handler) });
      }
    }
  }

  // jQuery delegation: handlers on ancestors whose selector matches the picked element.
  if (jq) {
    const element = describeElement(root);
    for (let anc: Node | null = root.parentNode; anc; anc = anc.parentNode) {
      const events = jq._data(anc, 'events') ?? {};
      for (const [event, list] of Object.entries(events)) {
        for (const h of list as Loose[]) {
          let matches = false;
          try {
            matches = Boolean(h.selector) && root.matches(h.selector);
          } catch {
            // jQuery-only selector syntax (e.g. :visible) that matches() rejects.
          }
          if (!matches) continue;
          const from = anc instanceof Element ? describeElement(anc) : 'document';
          handlers.push({
            element,
            event: `${event} (on ${from}, selector "${h.selector}")`,
            source: 'jquery-delegated',
            code: source(h.handler),
          });
        }
      }
    }
  }

  const react = reactComponents(root);
  return {
    libraries: detectLibraries(),
    components: react.length ? react : vueComponents(root),
    handlers,
    truncated,
  };
}

export default defineUnlistedScript(() => {
  if (window.__elementLensMain) return;
  window.__elementLensMain = true;

  window.addEventListener(
    'elementlens:inspect',
    (e) => {
      const target = e.composedPath()[0];
      if (!(target instanceof Element)) return;
      e.stopImmediatePropagation();
      let includeChildren = false;
      try {
        includeChildren = Boolean(JSON.parse(String((e as CustomEvent).detail)).includeChildren);
      } catch {
        // malformed detail: inspect the element only
      }
      let result: Partial<JsReport>;
      try {
        result = inspect(target, includeChildren);
      } catch {
        result = { libraries: [], components: [], handlers: [], truncated: false };
      }
      document.dispatchEvent(new CustomEvent('elementlens:result', { detail: JSON.stringify(result) }));
    },
    true,
  );
});

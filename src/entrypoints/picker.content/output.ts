import { authoredCss } from '@/core/extract/authored-css';
import { collectStyles, stylesToCss, type DefaultStyleProvider } from '@/core/extract/computed-css';
import { componentName, serializeHtml, wrapComponent } from '@/core/extract/html';
import { pageUsesTailwind } from '@/core/convert/detect-tailwind';
import { toTailwind } from '@/core/convert/tailwind';
import { fullSnippet } from '@/core/export/snippet';
import type { Settings } from '@/shared/settings';

export interface Outputs {
  /** HTML, or a JSX component. */
  markup: string;
  css: string;
  /** Paste-ready combination of markup and CSS. */
  full: string;
  notes: string[];
}

type OutputSettings = Pick<
  Settings,
  'componentFormat' | 'styleFormat' | 'tailwindVersion' | 'includeChildren' | 'mediaQueries'
>;

/** Build markup + CSS for an element according to the panel's copy settings. */
export function buildOutputs(
  el: Element,
  settings: OutputSettings,
  { host, defaults }: { host: Element; defaults: DefaultStyleProvider },
): Outputs {
  const { componentFormat, styleFormat, tailwindVersion: version, includeChildren, mediaQueries } = settings;
  const skip = (n: Node) => n === host;
  const notes: string[] = [];
  let classFor: ((e: Element) => string | undefined) | undefined;
  let styleFor: ((e: Element) => [string, string][] | undefined) | undefined;
  let css = '';

  if (styleFormat === 'authored') {
    const result = authoredCss(el, { includeChildren, mediaQueries });
    css = result.css;
    notes.push(`Site rules: ${result.matchedRules} matching rule${result.matchedRules === 1 ? '' : 's'} from this page's stylesheets.`);
    if (result.skippedSheets) {
      notes.push(`${result.skippedSheets} stylesheet${result.skippedSheets === 1 ? '' : 's'} from other domains could not be read (browser security). Use CSS for the full computed result.`);
    }
  } else {
    const collected = collectStyles(el, defaults, { includeChildren, skip });
    if (collected.truncated) notes.push('Output truncated: this element is very large.');

    if (styleFormat === 'computed') {
      css = stylesToCss(collected);
      notes.push('CSS: computed styles that differ from browser defaults.');
    } else if (styleFormat === 'inline') {
      styleFor = (e) => collected.styles.get(e)?.decls;
      css = stylesToCss(collected, { pseudoOnly: true });
      notes.push(css ? 'Inline CSS: ::before/::after cannot be inline, so they stay as CSS.' : 'Inline CSS: computed styles written into style attributes.');
    } else if (pageUsesTailwind()) {
      notes.push(`This page already uses Tailwind, so the original classes are kept (including responsive and hover variants).`);
    } else {
      classFor = (e) => {
        const style = collected.styles.get(e);
        if (!style) return undefined;
        return [
          ...toTailwind(style.decls, { version }),
          ...style.pseudos.flatMap((p) => toTailwind(p.decls, { version, variant: p.pseudo === '::before' ? 'before:' : 'after:' })),
        ].join(' ');
      };
      // The computed styles already include any inline style; the classes replace it.
      styleFor = (e) => (collected.styles.has(e) ? [] : undefined);
      notes.push(`Tailwind ${version}: classes generated from computed styles. Hover and responsive variants are not visible in computed styles.`);
    }
  }

  const html = serializeHtml(el, {
    baseUrl: document.baseURI,
    dialect: componentFormat,
    includeChildren,
    skip,
    classFor,
    styleFor,
  });
  if (html.truncated && !notes.some((n) => n.startsWith('Output truncated'))) notes.push('Output truncated: this element is very large.');

  if (componentFormat === 'html') {
    return { markup: html.html, css, full: fullSnippet(html.html, css), notes };
  }
  const name = componentName(el);
  const component = wrapComponent(html.html, name);
  const markup = css ? `import './styles.css';\n\n${component}` : component;
  const full = css ? `/* styles.css */\n${css}\n\n/* ${name}.jsx */\n${markup}` : markup;
  return { markup, css, full, notes };
}

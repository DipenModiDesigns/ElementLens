import { describe, expect, it } from 'vitest';
import { formatJsReport, mergeReports, scanAttributes, MAX_CODE } from '@/core/extract/js';
import { toMarkdown } from '@/core/export/markdown';
import { tokenizeJs } from '@/entrypoints/picker.content/highlight';

function el(markup: string): Element {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild!;
}

describe('scanAttributes', () => {
  const root = el(`
    <div class="card" x-data="{ open: false }" onclick="track('card')">
      <button @click="open = !open" data-bs-toggle="modal">Open</button>
      <a href="javascript:void(0)" wire:click="save">Save</a>
      <script>console.log('inline')</script>
      <script src="/app.js"></script>
    </div>`);

  it('reads only the element itself by default', () => {
    const report = scanAttributes(root);
    expect(report.handlers).toEqual([
      { element: 'div.card', event: 'click', source: 'inline', code: "track('card')" },
    ]);
    expect(report.directives).toEqual([{ element: 'div.card', name: 'x-data', value: '{ open: false }' }]);
    expect(report.pageContext).toBe(false);
  });

  it('includes children: directives, javascript: links and scripts', () => {
    const report = scanAttributes(root, { includeChildren: true });
    expect(report.directives.map((d) => d.name)).toEqual(['x-data', '@click', 'data-bs-toggle', 'wire:click']);
    expect(report.handlers.map((h) => h.event)).toEqual(['click', 'click (href)']);
    expect(report.scripts).toEqual(["console.log('inline')", '// external: /app.js']);
  });

  it('respects skip and the element cap', () => {
    const report = scanAttributes(root, { includeChildren: true, skip: (n) => (n as Element).localName === 'a' });
    expect(report.directives.map((d) => d.name)).not.toContain('wire:click');

    const big = el(`<ul>${'<li onclick="x()">x</li>'.repeat(20)}</ul>`);
    const capped = scanAttributes(big, { includeChildren: true, maxElements: 5 });
    expect(capped.handlers).toHaveLength(4);
    expect(capped.truncated).toBe(true);
  });

  it('clips very long handler code', () => {
    const long = document.createElement('button');
    long.setAttribute('onclick', 'x'.repeat(MAX_CODE + 50));
    expect(scanAttributes(long).handlers[0]!.code).toContain('truncated');
  });
});

describe('mergeReports + formatJsReport', () => {
  it('merges page-context data and formats a readable report', () => {
    const dom = scanAttributes(el('<button class="btn" onclick="buy()">Buy</button>'));
    const merged = mergeReports(dom, {
      libraries: ['React 18.3.1'],
      components: ['App', 'ProductCard'],
      handlers: [{ element: 'button.btn', event: 'onClick', source: 'react', code: 'function handleBuy() {}' }],
      truncated: false,
    });
    const text = formatJsReport(merged, 'button.btn');
    expect(text).toContain('// Page uses: React 18.3.1');
    expect(text).toContain('// Component: App > ProductCard');
    expect(text).toContain('// button.btn | click | inline attribute\nbuy()');
    expect(text).toContain('// button.btn | onClick | React prop\nfunction handleBuy() {}');
    expect(text).not.toContain('unavailable on this page');
    expect(text).toContain('addEventListener() cannot be read');
  });

  it('says so when nothing is found and page context is missing', () => {
    const text = formatJsReport(mergeReports(scanAttributes(el('<p>hi</p>')), null), 'p');
    expect(text).toContain('No JavaScript found');
    expect(text).toContain('Framework data (React, Vue, jQuery) unavailable');
  });
});

describe('toMarkdown', () => {
  it('builds fenced sections and skips empty ones', () => {
    const md = toMarkdown('div.card', [
      { label: 'HTML', language: 'html', code: '<div></div>' },
      { label: 'CSS', language: 'css', code: '' },
      { label: 'JavaScript', language: 'js', code: 'const a = "```";' },
    ]);
    expect(md).toBe(
      '## div.card\n\n### HTML\n\n```html\n<div></div>\n```\n\n### JavaScript\n\n````js\nconst a = "```";\n````\n',
    );
  });
});

describe('tokenizeJs', () => {
  it('round-trips and classifies comments, strings, keywords and numbers', () => {
    const code = '// note\nconst n = 42; if (n) return "a\\"b" + `t`; /* c */';
    const tokens = tokenizeJs(code);
    expect(tokens.map((t) => t.text).join('')).toBe(code);
    const of = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
    expect(of('comment')).toEqual(['// note', '/* c */']);
    expect(of('keyword')).toEqual(['const', 'if', 'return']);
    expect(of('value')).toEqual(['"a\\"b"', '`t`']);
    expect(of('number')).toEqual(['42']);
  });
});

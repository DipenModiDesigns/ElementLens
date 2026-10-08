import { describe, expect, it } from 'vitest';
import { serializeHtml } from '@/core/extract/html';

const BASE = 'https://example.com/shop/';

function el(markup: string): Element {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild!;
}

describe('serializeHtml', () => {
  it('indents nested elements and inlines short text', () => {
    const { html } = serializeHtml(el('<div class="card"><h2>Title</h2><p>Body <b>bold</b></p></div>'), {
      baseUrl: BASE,
    });
    expect(html).toBe(
      [
        '<div class="card">',
        '  <h2>Title</h2>',
        '  <p>',
        '    Body',
        '    <b>bold</b>',
        '  </p>',
        '</div>',
      ].join('\n'),
    );
  });

  it('makes URLs absolute, including srcset', () => {
    const { html } = serializeHtml(el('<a href="item/1"><img src="/a.png" srcset="a.png 1x, b.png 2x"></a>'), {
      baseUrl: BASE,
    });
    expect(html).toContain('href="https://example.com/shop/item/1"');
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('srcset="https://example.com/shop/a.png 1x, https://example.com/shop/b.png 2x"');
  });

  it('writes void elements without closing tags and empty attributes bare', () => {
    const { html } = serializeHtml(el('<p><input type="checkbox" checked><br></p>'), { baseUrl: BASE });
    expect(html).toBe('<p>\n  <input type="checkbox" checked>\n  <br>\n</p>');
  });

  it('strips scripts and comments by default', () => {
    const { html } = serializeHtml(el('<div><!-- note --><script>alert(1)</script><span>ok</span></div>'), {
      baseUrl: BASE,
    });
    expect(html).toBe('<div>\n  <span>ok</span>\n</div>');
  });

  it('escapes text and attribute values', () => {
    const div = document.createElement('div');
    div.setAttribute('title', 'a "quote" & more');
    div.textContent = '<b>not a tag</b>';
    const { html } = serializeHtml(div, { baseUrl: BASE });
    expect(html).toBe('<div title="a &quot;quote&quot; &amp; more">&lt;b&gt;not a tag&lt;/b&gt;</div>');
  });

  it('can leave out children', () => {
    const { html } = serializeHtml(el('<ul class="menu"><li>a</li><li>b</li></ul>'), {
      baseUrl: BASE,
      includeChildren: false,
    });
    expect(html).toBe('<ul class="menu">…</ul>');
  });

  it('skips nodes and truncates huge trees', () => {
    const root = el('<div><span id="skip">x</span><i>keep</i></div>');
    const skipped = serializeHtml(root, { baseUrl: BASE, skip: (n) => (n as Element).id === 'skip' });
    expect(skipped.html).not.toContain('skip');

    const big = el(`<ul>${'<li>x</li>'.repeat(50)}</ul>`);
    const result = serializeHtml(big, { baseUrl: BASE, maxNodes: 10 });
    expect(result.truncated).toBe(true);
    expect(result.html).toContain('<!-- truncated');
  });
});

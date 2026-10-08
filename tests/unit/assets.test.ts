import { describe, expect, it } from 'vitest';
import { cleanSvg, colorsIn, cssUrls } from '@/core/extract/assets';
import { elementToJson } from '@/core/export/json';
import type { StylesResult } from '@/core/extract/computed-css';

describe('asset helpers', () => {
  it('extracts every url() from a CSS value', () => {
    expect(cssUrls('url("a.png"), linear-gradient(red, blue), url(b.jpg)')).toEqual(['a.png', 'b.jpg']);
    expect(cssUrls('none')).toEqual([]);
  });

  it('finds colors inside compound values', () => {
    expect(colorsIn('rgba(0, 0, 0, 0.1) 0px 1px 2px 0px, rgb(255, 0, 0) 0px 0px 4px')).toEqual([
      'rgba(0, 0, 0, 0.1)',
      'rgb(255, 0, 0)',
    ]);
    expect(colorsIn('0 0 0 1px #fff')).toEqual(['#fff']);
  });

  it('cleans inline SVG for standalone use', () => {
    // Built with DOM calls: the test DOM parses <script> inside SVG markup differently from browsers.
    const ns = 'http://www.w3.org/2000/svg';
    const source = document.createElementNS(ns, 'svg');
    source.setAttribute('viewBox', '0 0 10 10');
    source.setAttribute('onclick', 'x()');
    const script = document.createElementNS(ns, 'script');
    script.textContent = 'alert(1)';
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M0 0');
    path.setAttribute('onmouseover', 'y()');
    source.append(script, path);
    const svg = cleanSvg(source);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/script|onclick|onmouseover/);
    expect(svg).toContain('<path d="M0 0"');
  });
});

describe('elementToJson', () => {
  it('builds a tree with attributes, text, styles and pseudos', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="card">Hello <b>world</b><script></script></div>';
    document.body.append(wrap);
    const root = wrap.firstElementChild!;
    const b = root.querySelector('b')!;
    const collected: StylesResult = {
      root,
      includeChildren: true,
      truncated: false,
      styles: new Map([
        [root, { decls: [['display', 'flex']], pseudos: [{ pseudo: '::before', decls: [['content', '"*"']] }] }],
        [b, { decls: [['font-weight', '700']], pseudos: [] }],
      ]),
    };
    const json = elementToJson(collected, { generator: 'ElementLens test', url: 'https://x', title: 'T', selector: 'div.card', capturedAt: 'now' });
    expect(json).toMatchObject({ generator: 'ElementLens test', selector: 'div.card', capturedAt: 'now', truncated: false });
    expect(json.root).toMatchObject({
      tag: 'div',
      attributes: { class: 'card' },
      text: 'Hello',
      styles: { display: 'flex' },
      pseudos: { '::before': { content: '"*"' } },
    });
    // The script was not styled, so it is not in the tree.
    expect(json.root.children).toHaveLength(1);
    expect(json.root.children[0]).toMatchObject({ tag: 'b', text: 'world', styles: { 'font-weight': '700' }, children: [] });
    wrap.remove();
  });
});

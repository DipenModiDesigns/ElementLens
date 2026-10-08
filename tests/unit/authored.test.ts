import { afterEach, describe, expect, it } from 'vitest';
import { authoredCss, isGeneric, stripStates } from '@/core/extract/authored-css';

describe('selector helpers', () => {
  it('strips state pseudo-classes and pseudo-elements, keeps structural ones', () => {
    expect(stripStates('.btn:hover')).toBe('.btn');
    expect(stripStates('.card::before')).toBe('.card');
    expect(stripStates('a:focus-visible > span')).toBe('a > span');
    expect(stripStates('li:first-child:hover')).toBe('li:first-child');
    expect(stripStates('::selection')).toBe('*');
    expect(stripStates('.a > ::before')).toBe('.a > *');
  });

  it('detects generic resets', () => {
    expect(isGeneric('*')).toBe(true);
    expect(isGeneric('::before')).toBe(true);
    expect(isGeneric('body')).toBe(true);
    expect(isGeneric('.card')).toBe(false);
    expect(isGeneric('div')).toBe(false);
  });
});

describe('authoredCss', () => {
  let style: HTMLStyleElement;
  let root: HTMLElement;

  const setup = (css: string, html: string) => {
    style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    root = wrap.firstElementChild as HTMLElement;
    document.body.append(wrap);
  };
  afterEach(() => {
    style?.remove();
    root?.parentElement?.remove();
  });

  it('collects matching rules incl. states, skips resets and other elements', () => {
    setup(
      `* { box-sizing: border-box; }
       .card { padding: 16px; }
       .card:hover { color: red; }
       .other, .card.big { margin: 0; }
       .unrelated { color: blue; }
       .card h2 { font-size: 20px; }`,
      '<div class="card big"><h2>T</h2></div>',
    );
    const own = authoredCss(root);
    expect(own.css).toContain('.card {\n  padding: 16px;\n}');
    expect(own.css).toContain('.card:hover {\n  color: red;\n}');
    expect(own.css).toContain('.card.big {\n  margin: 0');
    expect(own.css).not.toContain('.other');
    expect(own.css).not.toContain('box-sizing');
    expect(own.css).not.toContain('.unrelated');
    expect(own.css).not.toContain('h2');

    const withChildren = authoredCss(root, { includeChildren: true });
    expect(withChildren.css).toContain('.card h2 {\n  font-size: 20px;\n}');
  });

  it('keeps @media blocks when asked', () => {
    setup('@media (min-width: 9000px) { .card { padding: 40px; } }', '<div class="card"></div>');
    expect(authoredCss(root, { mediaQueries: true }).css).toContain('@media (min-width: 9000px) {\n  .card {\n    padding: 40px;\n  }\n}');
    // Not active at the test viewport, so dropped when flattening.
    expect(authoredCss(root, { mediaQueries: false }).css).not.toContain('padding: 40px');
  });
});

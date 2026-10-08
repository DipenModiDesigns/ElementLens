import { describe, expect, it } from 'vitest';
import { componentName, serializeHtml, wrapComponent } from '@/core/extract/html';
import { parseDeclarations, reactStyleKey, splitTopLevel } from '@/core/extract/css-text';

const BASE = 'https://example.com/';

function el(markup: string): Element {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild!;
}
const jsx = (markup: string) => serializeHtml(el(markup), { baseUrl: BASE, dialect: 'jsx' }).html;

describe('css-text', () => {
  it('splits only at the top level', () => {
    expect(splitTopLevel('a, b(c, d), "e, f"', ',')).toEqual(['a', 'b(c, d)', '"e, f"']);
    expect(parseDeclarations('color: red; background: url("a;b.png"); --x: 1')).toEqual([
      ['color', 'red'],
      ['background', 'url("a;b.png")'],
      ['--x', '1'],
    ]);
  });

  it('builds React style keys', () => {
    expect(reactStyleKey('margin-top')).toBe('marginTop');
    expect(reactStyleKey('-webkit-line-clamp')).toBe('WebkitLineClamp');
    expect(reactStyleKey('-ms-transform')).toBe('msTransform');
    expect(reactStyleKey('--brand')).toBe('--brand');
  });
});

describe('JSX dialect', () => {
  it('renames attributes and self-closes void and empty elements', () => {
    expect(jsx('<label for="a" class="lbl" tabindex="0">Name<input id="a" readonly maxlength="5"><span class="x"></span></label>')).toBe(
      [
        '<label htmlFor="a" className="lbl" tabIndex="0">',
        '  Name',
        '  <input id="a" readOnly maxLength="5" />',
        '  <span className="x" />',
        '</label>',
      ].join('\n'),
    );
  });

  it('turns style strings into objects and drops string event handlers', () => {
    expect(jsx('<div style="margin-top: 4px; --brand: red" onclick="go()">x</div>')).toBe(
      "<div style={{ marginTop: '4px', '--brand': 'red' }}>x</div>",
    );
  });

  it('writes empty non-boolean attributes as ="" (a bare prop means true)', () => {
    expect(jsx('<img src="a.png" alt="">')).toBe('<img src="https://example.com/a.png" alt="" />');
    expect(jsx('<button disabled>x</button>')).toBe('<button disabled>x</button>');
  });

  it('uses uncontrolled props for form values', () => {
    expect(jsx('<input type="checkbox" checked value="1">')).toBe('<input type="checkbox" defaultChecked defaultValue="1" />');
  });

  it('escapes braces in text and camelCases SVG attributes', () => {
    expect(jsx('<p>{ a }</p>')).toBe("<p>{'{'} a {'}'}</p>");
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('data-x', '1');
    svg.append(path);
    expect(serializeHtml(svg, { baseUrl: BASE, dialect: 'jsx' }).html).toBe('<svg>\n  <path strokeWidth="2" data-x="1" />\n</svg>');
  });

  it('keeps whitespace of pre as a template literal', () => {
    expect(jsx('<pre>a  `b`\n  c</pre>')).toBe('<pre>{`a  \\`b\\`\n  c`}</pre>');
  });

  it('wraps a component with a name from the element', () => {
    expect(componentName(el('<div class="product-card big"></div>'))).toBe('ProductCard');
    expect(componentName(el('<div></div>'))).toBe('Element');
    expect(wrapComponent('<div />', 'Card')).toBe('export default function Card() {\n  return (\n    <div />\n  );\n}');
  });
});

describe('class and style hooks', () => {
  it('replaces classes and inline styles', () => {
    const root = el('<div class="card" style="color: red"><b class="old">x</b></div>');
    const out = serializeHtml(root, {
      baseUrl: BASE,
      classFor: (e) => (e.localName === 'b' ? 'font-bold' : 'p-4 flex'),
      styleFor: (e) => (e === root ? [['display', 'flex'], ['gap', '8px']] : undefined),
    }).html;
    expect(out).toBe('<div class="p-4 flex" style="display: flex; gap: 8px">\n  <b class="font-bold">x</b>\n</div>');
  });

  it('removes the attribute when the replacement is empty', () => {
    const out = serializeHtml(el('<i class="a" style="b: c">x</i>'), { baseUrl: BASE, classFor: () => '', styleFor: () => [] }).html;
    expect(out).toBe('<i>x</i>');
  });
});

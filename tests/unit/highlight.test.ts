import { describe, expect, it } from 'vitest';
import { tokenizeCss, tokenizeHtml } from '@/entrypoints/picker.content/highlight';

const join = (tokens: { text: string }[]) => tokens.map((t) => t.text).join('');

describe('tokenizeHtml', () => {
  it('round-trips and classifies tags, attributes and values', () => {
    const code = '<a href="x" hidden>\n  Hi &lt;b&gt;\n</a><!-- c -->';
    const tokens = tokenizeHtml(code);
    expect(join(tokens)).toBe(code);
    expect(tokens.filter((t) => t.kind === 'tag').map((t) => t.text)).toEqual(['<a', '>', '</a', '>']);
    expect(tokens.find((t) => t.kind === 'attr')?.text).toBe('href');
    expect(tokens.find((t) => t.kind === 'value')?.text).toBe('"x"');
    expect(tokens.at(-1)).toEqual({ text: '<!-- c -->', kind: 'comment' });
  });
});

describe('tokenizeCss', () => {
  it('round-trips and classifies selectors, properties and values', () => {
    const code = '.card::before {\n  content: "";\n  margin: 0 auto;\n}\n\n.x {\n  /* only browser defaults */\n}';
    const tokens = tokenizeCss(code);
    expect(join(tokens)).toBe(code);
    expect(tokens.filter((t) => t.kind === 'selector').map((t) => t.text)).toEqual(['.card::before', '.x']);
    expect(tokens.filter((t) => t.kind === 'prop').map((t) => t.text)).toEqual(['content', 'margin']);
    expect(tokens.some((t) => t.kind === 'comment')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { describeElement, elementPath, parentOf, shortSelector } from '@/core/extract/describe';

describe('describe helpers', () => {
  it('labels elements with id and up to N classes', () => {
    const el = document.createElement('div');
    el.id = 'main';
    el.className = 'card shadow rounded';
    expect(describeElement(el)).toBe('div#main.card.shadow…');
    expect(describeElement(el, 3)).toBe('div#main.card.shadow.rounded');
  });

  it('builds short selectors and escapes Tailwind-style classes', () => {
    const el = document.createElement('button');
    expect(shortSelector(el)).toBe('button');
    el.className = 'md:flex px-4';
    expect(shortSelector(el)).toBe('button.md\\:flex');
    el.id = 'buy';
    expect(shortSelector(el)).toBe('#buy');
  });

  it('walks up through open shadow roots', () => {
    const host = document.createElement('my-widget');
    document.body.append(host);
    const inner = document.createElement('span');
    host.attachShadow({ mode: 'open' }).append(inner);

    expect(parentOf(inner)).toBe(host);
    const path = elementPath(inner);
    expect(path[0]).toBe(document.documentElement);
    expect(path.at(-2)).toBe(host);
    expect(path.at(-1)).toBe(inner);
    host.remove();
  });
});

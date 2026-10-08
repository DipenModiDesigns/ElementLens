import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessibleName, implicitRole, locators, uniqueSelector, xpath } from '@/core/extract/selector';
import { boxModel } from '@/core/extract/box';

describe('selectors', () => {
  let wrap: HTMLDivElement;
  beforeEach(() => {
    wrap = document.createElement('div');
    wrap.innerHTML = `
      <main id="app">
        <ul class="menu">
          <li class="item"><a href="/a">Home</a></li>
          <li class="item"><a href="/b" class="css-1x2y3z">Shop</a></li>
        </ul>
        <button data-testid="buy">Buy now</button>
        <section><div class="card md:flex"><h2>Title</h2></div></section>
      </main>`;
    document.body.append(wrap);
  });
  afterEach(() => wrap.remove());

  it('prefers test ids and ids', () => {
    expect(uniqueSelector(wrap.querySelector('button')!)).toBe('[data-testid="buy"]');
    expect(uniqueSelector(wrap.querySelector('main')!)).toBe('#app');
  });

  it('builds short paths, skipping unstable classes and adding nth-of-type when needed', () => {
    const shop = wrap.querySelectorAll('a')[1]!;
    const sel = uniqueSelector(shop);
    expect(sel).not.toContain('css-1x2y3z');
    expect(document.querySelectorAll(sel)).toHaveLength(1);
    expect(document.querySelector(sel)).toBe(shop);
    expect(sel).toContain('li.item:nth-of-type(2)');

    const h2 = wrap.querySelector('h2')!;
    expect(document.querySelector(uniqueSelector(h2))).toBe(h2);
    expect(uniqueSelector(h2)).not.toContain('md');
  });

  it('builds XPath', () => {
    expect(xpath(wrap.querySelector('main')!)).toBe('//*[@id="app"]');
    expect(xpath(wrap.querySelectorAll('li')[1]!)).toMatch(/\/main\/ul\/li\[2\]$/);
  });

  it('infers roles and names', () => {
    expect(implicitRole(wrap.querySelector('a')!)).toBe('link');
    expect(implicitRole(wrap.querySelector('h2')!)).toBe('heading');
    expect(implicitRole(wrap.querySelector('section')!)).toBeNull();
    expect(accessibleName(wrap.querySelector('button')!)).toBe('Buy now');
  });

  it('produces Playwright and Cypress locators', () => {
    const byId = Object.fromEntries(locators(wrap.querySelector('button')!).map((l) => [l.label, l.value]));
    expect(byId.Playwright).toBe("page.getByTestId('buy')");
    expect(byId.Cypress).toBe(`cy.get('[data-testid="buy"]')`);

    const link = Object.fromEntries(locators(wrap.querySelector('a')!).map((l) => [l.label, l.value]));
    expect(link.Playwright).toBe("page.getByRole('link', { name: 'Home' })");
    expect(link.Cypress).toBe("cy.contains('a', 'Home')");
  });
});

describe('boxModel', () => {
  it('derives the content size from the border box', () => {
    const values: Record<string, string> = {
      'padding-top': '10px', 'padding-right': '20px', 'padding-bottom': '10px', 'padding-left': '20px',
      'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px',
      'margin-top': '0px', 'margin-right': 'auto', 'margin-bottom': '8px', 'margin-left': '0px',
      position: 'relative', 'box-sizing': 'border-box', display: 'flex',
    };
    const box = boxModel({ getPropertyValue: (p: string) => values[p] ?? '' }, { width: 300, height: 100 });
    expect(box.width).toBe(258);
    expect(box.height).toBe(78);
    expect(box.padding).toEqual([10, 20, 10, 20]);
    expect(box.margin).toEqual([0, 0, 8, 0]);
    expect(box.display).toBe('flex');
  });
});

import { describe, expect, it } from 'vitest';
import { boxShorthand, cleanStyles, formatRule, tidyValue, type StyleMap } from '@/core/extract/styles';

const SIDES = ['top', 'right', 'bottom', 'left'];

/** Minimal "browser default" map for a div. */
function defaults(): StyleMap {
  const map: StyleMap = {
    display: 'block',
    color: 'rgb(0, 0, 0)',
    'overflow-x': 'visible',
    'overflow-y': 'visible',
    'row-gap': 'normal',
    'column-gap': 'normal',
    'outline-style': 'none',
    'outline-color': 'rgb(0, 0, 0)',
    'text-decoration-line': 'none',
    'text-decoration-color': 'rgb(0, 0, 0)',
    transform: 'none',
    'transform-origin': '50% 50%',
  };
  for (const s of SIDES) {
    map[`margin-${s}`] = '0px';
    map[`padding-${s}`] = '0px';
    map[`border-${s}-width`] = '0px';
    map[`border-${s}-style`] = 'none';
    map[`border-${s}-color`] = 'rgb(0, 0, 0)';
  }
  for (const c of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) map[`border-${c}-radius`] = '0px';
  return map;
}

describe('boxShorthand', () => {
  it('produces the shortest form', () => {
    expect(boxShorthand(['1px', '1px', '1px', '1px'])).toBe('1px');
    expect(boxShorthand(['1px', '2px', '1px', '2px'])).toBe('1px 2px');
    expect(boxShorthand(['1px', '2px', '3px', '2px'])).toBe('1px 2px 3px');
    expect(boxShorthand(['1px', '2px', '3px', '4px'])).toBe('1px 2px 3px 4px');
  });
});

describe('cleanStyles', () => {
  it('drops values equal to defaults', () => {
    const target = { ...defaults(), display: 'flex' };
    expect(cleanStyles(target, defaults())).toEqual([['display', 'flex']]);
  });

  it('merges margin and padding, reading untouched sides from the full map', () => {
    const target = { ...defaults(), 'padding-top': '8px', 'padding-bottom': '8px' };
    expect(cleanStyles(target, defaults())).toEqual([['padding', '8px 0px']]);
  });

  it('merges identical visible borders into one shorthand', () => {
    const target = defaults();
    for (const s of SIDES) {
      target[`border-${s}-width`] = '1px';
      target[`border-${s}-style`] = 'solid';
      target[`border-${s}-color`] = 'rgb(200, 0, 0)';
    }
    expect(cleanStyles(target, defaults())).toEqual([['border', '1px solid rgb(200, 0, 0)']]);
  });

  it('writes per-side borders when only some sides are visible', () => {
    const target = { ...defaults(), 'border-bottom-width': '2px', 'border-bottom-style': 'dashed' };
    expect(cleanStyles(target, defaults())).toEqual([['border-bottom', '2px dashed rgb(0, 0, 0)']]);
  });

  it('drops noise: logical, vendor, custom props and currentColor copies', () => {
    const target = {
      ...defaults(),
      color: 'rgb(10, 10, 10)',
      'outline-color': 'rgb(10, 10, 10)',
      'text-decoration-color': 'rgb(10, 10, 10)',
      'margin-block-start': '4px',
      'inline-size': '100px',
      '-webkit-font-smoothing': 'antialiased',
      '--brand': 'red',
      'transform-origin': '10px 10px',
    };
    expect(cleanStyles(target, defaults())).toEqual([['color', 'rgb(10, 10, 10)']]);
  });

  it('keeps forced properties and sorts layout before visuals', () => {
    const target = { ...defaults(), color: 'rgb(1, 2, 3)', display: 'grid', content: 'none' };
    expect(cleanStyles(target, { ...defaults(), content: 'none' }, { keep: ['content'] })).toEqual([
      ['content', 'none'],
      ['display', 'grid'],
      ['color', 'rgb(1, 2, 3)'],
    ]);
  });

  it('merges overflow, gap and radius', () => {
    const target = {
      ...defaults(),
      'overflow-x': 'hidden',
      'overflow-y': 'hidden',
      'row-gap': '8px',
      'column-gap': '16px',
      'border-top-left-radius': '6px',
      'border-top-right-radius': '6px',
      'border-bottom-right-radius': '6px',
      'border-bottom-left-radius': '6px',
    };
    expect(cleanStyles(target, defaults())).toEqual([
      ['gap', '8px 16px'],
      ['border-radius', '6px'],
      ['overflow', 'hidden'],
    ]);
  });
});

describe('tidyValue', () => {
  it('rounds layout sizes to whole px and other px values to 2 decimals', () => {
    expect(tidyValue('width', '361.328px')).toBe('361px');
    expect(tidyValue('max-height', '0.6px')).toBe('1px');
    expect(tidyValue('line-height', '26.4px')).toBe('26.4px');
    expect(tidyValue('letter-spacing', '-0.3333px')).toBe('-0.33px');
    expect(tidyValue('box-shadow', 'rgba(0, 0, 0, 0.5) 0px 1.234px 2.5px')).toBe('rgba(0, 0, 0, 0.5) 0px 1.23px 2.5px');
    expect(tidyValue('opacity', '0.333')).toBe('0.333');
  });

  it('is applied by cleanStyles', () => {
    const target = { ...defaults(), display: 'flex', width: '361.328px' };
    expect(cleanStyles(target, { ...defaults(), width: 'auto' })).toEqual([['display', 'flex'], ['width', '361px']]);
  });
});

describe('formatRule', () => {
  it('formats declarations and handles empty rules', () => {
    expect(formatRule('.a', [['display', 'flex']])).toBe('.a {\n  display: flex;\n}');
    expect(formatRule('.a', [])).toContain('only browser defaults');
  });
});

import { describe, expect, it } from 'vitest';
import { arbitrary, toTailwind } from '@/core/convert/tailwind';
import { parseColor, toHex } from '@/core/convert/color';
import type { Declaration } from '@/core/extract/styles';

const v4 = (decls: Declaration[], variant?: string) => toTailwind(decls, { version: 'v4', variant });
const v3 = (decls: Declaration[]) => toTailwind(decls, { version: 'v3' });

describe('color parsing', () => {
  it('parses hex, rgb (both syntaxes), oklch and transparent', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080')?.a).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(9, 105, 218)')).toEqual({ r: 9, g: 105, b: 218, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)')?.a).toBe(0.5);
    expect(parseColor('rgb(0 0 0 / 25%)')?.a).toBe(0.25);
    expect(parseColor('transparent')?.a).toBe(0);
    // Tailwind v4 red-500 is oklch(63.7% 0.237 25.331), roughly #fb2c36 in sRGB.
    expect(toHex(parseColor('oklch(63.7% 0.237 25.331)')!)).toMatch(/^#f[a-f0-9]2[a-f0-9]3[a-f0-9]$/);
    expect(parseColor('color(display-p3 1 0 0)')).toBeNull();
  });
});

describe('toTailwind', () => {
  it('maps layout keywords', () => {
    expect(v4([['display', 'flex'], ['flex-direction', 'column'], ['align-items', 'center'], ['justify-content', 'space-between']]))
      .toEqual(['flex', 'flex-col', 'items-center', 'justify-between']);
    expect(v4([['display', 'none'], ['position', 'absolute']])).toEqual(['hidden', 'absolute']);
  });

  it('uses the spacing scale, with arbitrary values off-scale', () => {
    expect(v4([['padding', '16px 24px']])).toEqual(['px-6', 'py-4']);
    expect(v4([['padding', '8px']])).toEqual(['p-2']);
    expect(v4([['margin', '0px auto']])).toEqual(['mx-auto', 'my-0']);
    expect(v4([['padding', '1px 2px 3px 4px']])).toEqual(['pt-px', 'pr-0.5', 'pb-[3px]', 'pl-1']);
    expect(v4([['top', '-8px']])).toEqual(['-top-2']);
    expect(v4([['gap', '12px']])).toEqual(['gap-3']);
    expect(v4([['gap', '8px 16px']])).toEqual(['gap-y-2', 'gap-x-4']);
  });

  it('respects the smaller v3 spacing scale', () => {
    // 52px = 13 * 4: valid in v4 (any step), not in v3's fixed scale.
    expect(v4([['width', '52px']])).toEqual(['w-13']);
    expect(v3([['width', '52px']])).toEqual(['w-[52px]']);
    expect(v3([['width', '48px']])).toEqual(['w-12']);
  });

  it('maps sizes and keywords', () => {
    expect(v4([['width', '100%'], ['max-width', '768px'], ['height', 'fit-content']])).toEqual(['w-full', 'max-w-3xl', 'h-fit']);
    expect(v4([['width', '50%']])).toEqual(['w-1/2']);
  });

  it('matches exact palette colors and falls back to hex', () => {
    expect(v3([['background-color', 'rgb(59, 130, 246)']])).toEqual(['bg-blue-500']); // v3 blue-500 #3b82f6
    expect(v3([['color', 'rgba(59, 130, 246, 0.5)']])).toEqual(['text-blue-500/50']);
    expect(v4([['color', 'rgb(255, 255, 255)'], ['background-color', 'rgb(0, 0, 0)']])).toEqual(['text-white', 'bg-black']);
    expect(v4([['background-color', 'rgb(18, 52, 86)']])).toEqual(['bg-[#123456]']);
    expect(v4([['background-color', 'rgba(0, 0, 0, 0)']])).toEqual(['bg-transparent']);
    // v4 palette is OKLCH; its sRGB rendering of red-500 should match.
    const red = toHex(parseColor('oklch(63.7% 0.237 25.331)')!);
    expect(v4([['color', red]])).toEqual(['text-red-500']);
  });

  it('converts borders and radius per version', () => {
    expect(v4([['border', '1px solid rgb(0, 0, 0)']])).toEqual(['border', 'border-black']);
    expect(v4([['border-bottom', '2px dashed rgb(255, 255, 255)']])).toEqual(['border-b-2', '[border-bottom-style:dashed]', 'border-b-white']);
    expect(v4([['border-radius', '4px']])).toEqual(['rounded-sm']);
    expect(v3([['border-radius', '4px']])).toEqual(['rounded']);
    expect(v4([['border-radius', '9999px']])).toEqual(['rounded-full']);
    expect(v4([['border-radius', '8px 8px 0px 0px']])).toEqual(['rounded-tl-lg', 'rounded-tr-lg', 'rounded-br-none', 'rounded-bl-none']);
  });

  it('converts typography', () => {
    expect(v4([['font-size', '14px'], ['font-weight', '600'], ['line-height', '20px'], ['text-transform', 'uppercase']]))
      .toEqual(['text-sm', 'font-semibold', 'leading-5', 'uppercase']);
    expect(v4([['font-family', '"Segoe UI", sans-serif']])).toEqual(["font-['Segoe_UI',sans-serif]"]);
    expect(v4([['font-size', '13px']])).toEqual(['text-[13px]']);
  });

  it('uses arbitrary values for shadows and arbitrary properties as fallback', () => {
    expect(v4([['box-shadow', 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px']])).toEqual(['shadow-[rgba(0,0,0,0.1)_0px_1px_2px_0px]']);
    expect(v4([['transform', 'matrix(1, 0, 0, 1, 10, 0)']])).toEqual(['[transform:matrix(1,0,0,1,10,0)]']);
  });

  it('prefixes pseudo-element variants', () => {
    expect(v4([['content', '"★"'], ['color', 'rgb(0, 0, 0)']], 'before:')).toEqual(["before:content-['★']", 'before:text-black']);
  });

  it('maps flex shorthands', () => {
    expect(v4([['flex', '1 1 0%']])).toEqual(['flex-1']);
    expect(v4([['flex', '0 0 auto']])).toEqual(['flex-none']);
    expect(v4([['flex', '0 0 200px']])).toEqual(['shrink-0', 'basis-[200px]']);
  });

  it('escapes arbitrary values', () => {
    expect(arbitrary('a b_c')).toBe('a_b\\_c');
  });
});

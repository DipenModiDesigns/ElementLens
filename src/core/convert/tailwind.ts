import type { Declaration } from '../extract/styles';
import { buildPalette, nearestColor, parseColor, toHex, type Oklab } from './color';
import { PALETTE_V3, PALETTE_V4 } from './tailwind-palette';

/**
 * Converts cleaned computed declarations (see cleanStyles) into Tailwind utility classes.
 * Exact scale values become named utilities; anything else becomes an arbitrary value
 * (`p-[13px]`) or, for properties without a utility, an arbitrary property (`[prop:value]`).
 * The result always reproduces the computed style; it never guesses a "close enough" value.
 */

export type TwVersion = 'v4' | 'v3';

export interface TailwindOptions {
  version: TwVersion;
  /** Variant prefix for every class, e.g. `before:` for ::before declarations. */
  variant?: string;
}

// Colors this close in OKLab count as the same color (8-bit rounding is ~0.003).
const COLOR_MATCH = 0.01;

const palettes: Partial<Record<TwVersion, Map<string, Oklab>>> = {};
const palette = (v: TwVersion) => (palettes[v] ??= buildPalette(v === 'v4' ? PALETTE_V4 : PALETTE_V3));

// v3 only ships these spacing steps; v4 accepts any multiple of 0.25rem (we allow .5 steps).
const V3_SPACING = new Set([
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52,
  56, 60, 64, 72, 80, 96,
]);
const FRACTIONS: Record<string, string> = {
  '50%': '1/2', '25%': '1/4', '75%': '3/4', '20%': '1/5', '40%': '2/5', '60%': '3/5', '80%': '4/5',
  '33.3333%': '1/3', '66.6667%': '2/3', '100%': 'full',
};
const CONTAINERS: Record<number, string> = {
  384: 'sm', 448: 'md', 512: 'lg', 576: 'xl', 672: '2xl', 768: '3xl', 896: '4xl', 1024: '5xl', 1152: '6xl', 1280: '7xl',
};
const FONT_SIZES: Record<number, string> = {
  12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl',
  72: '7xl', 96: '8xl', 128: '9xl',
};
const FONT_WEIGHTS: Record<string, string> = {
  '100': 'thin', '200': 'extralight', '300': 'light', '400': 'normal', '500': 'medium', '600': 'semibold',
  '700': 'bold', '800': 'extrabold', '900': 'black',
};
const RADIUS: Record<TwVersion, Record<number, string>> = {
  v4: { 0: 'none', 2: 'xs', 4: 'sm', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl', 32: '4xl' },
  v3: { 0: 'none', 2: 'sm', 4: '', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl' },
};
const BORDER_WIDTHS: Record<number, string> = { 0: '-0', 1: '', 2: '-2', 4: '-4', 8: '-8' };

const DISPLAY: Record<string, string> = {
  block: 'block', 'inline-block': 'inline-block', inline: 'inline', flex: 'flex', 'inline-flex': 'inline-flex',
  grid: 'grid', 'inline-grid': 'inline-grid', none: 'hidden', contents: 'contents', table: 'table',
  'table-cell': 'table-cell', 'table-row': 'table-row', 'flow-root': 'flow-root', 'list-item': 'list-item',
};
const ALIGN: Record<string, string> = {
  'flex-start': 'start', start: 'start', 'flex-end': 'end', end: 'end', center: 'center', baseline: 'baseline',
  stretch: 'stretch', 'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly', normal: 'normal',
};

// Simple one-to-one keyword utilities: property -> value -> class.
const KEYWORDS: Record<string, Record<string, string>> = {
  position: { static: 'static', fixed: 'fixed', absolute: 'absolute', relative: 'relative', sticky: 'sticky' },
  'flex-direction': { row: 'flex-row', 'row-reverse': 'flex-row-reverse', column: 'flex-col', 'column-reverse': 'flex-col-reverse' },
  'flex-wrap': { wrap: 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse', nowrap: 'flex-nowrap' },
  'text-align': { left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify', start: 'text-start', end: 'text-end' },
  'text-transform': { uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' },
  'font-style': { italic: 'italic', normal: 'not-italic' },
  'text-decoration-line': { underline: 'underline', 'line-through': 'line-through', overline: 'overline', none: 'no-underline' },
  'white-space': { nowrap: 'whitespace-nowrap', pre: 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap', 'pre-line': 'whitespace-pre-line', normal: 'whitespace-normal', 'break-spaces': 'whitespace-break-spaces' },
  'text-overflow': { ellipsis: 'text-ellipsis', clip: 'text-clip' },
  'word-break': { 'break-all': 'break-all', 'keep-all': 'break-keep' },
  'vertical-align': { baseline: 'align-baseline', top: 'align-top', middle: 'align-middle', bottom: 'align-bottom', 'text-top': 'align-text-top', 'text-bottom': 'align-text-bottom', sub: 'align-sub', super: 'align-super' },
  'list-style-type': { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal' },
  'list-style-position': { inside: 'list-inside', outside: 'list-outside' },
  'object-fit': { contain: 'object-contain', cover: 'object-cover', fill: 'object-fill', none: 'object-none', 'scale-down': 'object-scale-down' },
  visibility: { hidden: 'invisible', visible: 'visible', collapse: 'collapse' },
  'pointer-events': { none: 'pointer-events-none', auto: 'pointer-events-auto' },
  'user-select': { none: 'select-none', text: 'select-text', all: 'select-all', auto: 'select-auto' },
  cursor: { pointer: 'cursor-pointer', default: 'cursor-default', 'not-allowed': 'cursor-not-allowed', text: 'cursor-text', move: 'cursor-move', grab: 'cursor-grab', grabbing: 'cursor-grabbing', wait: 'cursor-wait', help: 'cursor-help', auto: 'cursor-auto', 'zoom-in': 'cursor-zoom-in', 'zoom-out': 'cursor-zoom-out', crosshair: 'cursor-crosshair' },
  'box-sizing': { 'border-box': 'box-border', 'content-box': 'box-content' },
  float: { left: 'float-left', right: 'float-right', none: 'float-none' },
  clear: { left: 'clear-left', right: 'clear-right', both: 'clear-both', none: 'clear-none' },
  'background-size': { cover: 'bg-cover', contain: 'bg-contain', auto: 'bg-auto' },
  'background-repeat': { 'no-repeat': 'bg-no-repeat', repeat: 'bg-repeat', 'repeat-x': 'bg-repeat-x', 'repeat-y': 'bg-repeat-y' },
  'background-position': { '50% 50%': 'bg-center', '0% 0%': 'bg-left-top', '50% 0%': 'bg-top', '50% 100%': 'bg-bottom' },
  isolation: { isolate: 'isolate' },
  'table-layout': { fixed: 'table-fixed' },
  'border-collapse': { collapse: 'border-collapse', separate: 'border-separate' },
  resize: { none: 'resize-none', both: 'resize', vertical: 'resize-y', horizontal: 'resize-x' },
};
const OVERFLOW = new Set(['hidden', 'auto', 'scroll', 'visible', 'clip']);

/** Arbitrary values: spaces become underscores, double quotes become single quotes. */
export function arbitrary(value: string): string {
  return value.trim().replace(/_/g, '\\_').replace(/"/g, "'").replace(/\s*,\s*/g, ',').replace(/\s+/g, '_');
}

const px = (v: string): number | null => {
  const m = /^(-?[\d.]+)px$/.exec(v.trim());
  return m ? parseFloat(m[1]!) : null;
};
const round = (n: number) => Math.round(n * 1000) / 1000;

function spacingToken(value: number, version: TwVersion): string | null {
  if (value === 1) return 'px';
  const n = round(value / 4);
  if (version === 'v3') return V3_SPACING.has(n) ? String(n) : null;
  return Number.isInteger(n * 2) ? String(n) : null;
}

/** `prefix-4`, `-prefix-4`, `prefix-auto`, `prefix-1/2`, or `prefix-[13px]`. */
function spaceClass(prefix: string, value: string, version: TwVersion): string {
  if (value === 'auto') return `${prefix}-auto`;
  const fraction = FRACTIONS[value];
  if (fraction) return `${prefix}-${fraction}`;
  const n = px(value);
  if (n !== null) {
    const token = spacingToken(Math.abs(n), version);
    if (token) return `${n < 0 ? '-' : ''}${prefix}-${token}`;
  }
  return `${prefix}-[${arbitrary(value)}]`;
}

function sizeClass(prefix: string, value: string, version: TwVersion): string {
  const keywords: Record<string, string> = {
    'fit-content': 'fit', 'min-content': 'min', 'max-content': 'max', none: 'none',
    '100vw': 'screen', '100vh': 'screen', '100dvh': 'dvh',
  };
  if (keywords[value]) return `${prefix}-${keywords[value]}`;
  const n = px(value);
  if (prefix === 'max-w' && n !== null && CONTAINERS[n]) {
    return `max-w-${version === 'v4' ? CONTAINERS[n] : CONTAINERS[n]}`;
  }
  return spaceClass(prefix, value, version);
}

function colorClass(prefix: string, value: string, version: TwVersion): string {
  if (value === 'currentcolor' || value === 'currentColor') return `${prefix}-current`;
  const color = parseColor(value);
  if (!color) return `${prefix}-[${arbitrary(value)}]`;
  if (color.a === 0) return `${prefix}-transparent`;
  const match = nearestColor(color, palette(version));
  if (match && match.distance < COLOR_MATCH) {
    if (color.a === 1) return `${prefix}-${match.name}`;
    const pct = Math.round(color.a * 100);
    const v3Step = pct % 5 === 0;
    return `${prefix}-${match.name}/${version === 'v4' || v3Step ? pct : `[${round(color.a)}]`}`;
  }
  return `${prefix}-[${toHex(color)}]`;
}

const expandBox = (value: string): [string, string, string, string] => {
  const [t = '0px', r = t, b = t, l = r] = value.split(/\s+/);
  return [t, r, b, l];
};

function boxClasses(prefix: 'p' | 'm', value: string, version: TwVersion): string[] {
  const [t, r, b, l] = expandBox(value);
  if (t === r && t === b && t === l) return [spaceClass(prefix, t, version)];
  if (t === b && r === l) return [spaceClass(`${prefix}x`, r, version), spaceClass(`${prefix}y`, t, version)];
  return [
    spaceClass(`${prefix}t`, t, version),
    spaceClass(`${prefix}r`, r, version),
    spaceClass(`${prefix}b`, b, version),
    spaceClass(`${prefix}l`, l, version),
  ];
}

/** border / border-t: "1px solid rgb(...)" */
function borderClasses(side: '' | 't' | 'r' | 'b' | 'l', value: string, version: TwVersion): string[] {
  const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(value);
  if (!m) return [`[border${side ? `-${sideName(side)}` : ''}:${arbitrary(value)}]`];
  const [, width, style, color] = m as unknown as [string, string, string, string];
  const base = side ? `border-${side}` : 'border';
  const classes: string[] = [];
  const n = px(width);
  classes.push(n !== null && BORDER_WIDTHS[n] !== undefined ? `${base}${BORDER_WIDTHS[n]}` : `${base}-[${arbitrary(width)}]`);
  if (style !== 'solid') {
    classes.push(side ? `[border-${sideName(side)}-style:${style}]` : `border-${style}`);
  }
  classes.push(colorClass(base, color, version));
  return classes;
}
const sideName = (s: string) => ({ t: 'top', r: 'right', b: 'bottom', l: 'left' })[s] ?? s;

function radiusClass(corner: string, value: string, version: TwVersion): string {
  const base = corner ? `rounded-${corner}` : 'rounded';
  const n = px(value);
  if (value === '50%' || (n !== null && n >= 9999)) return `${base}-full`;
  if (n !== null && RADIUS[version][n] !== undefined) {
    const name = RADIUS[version][n];
    return name ? `${base}-${name}` : base;
  }
  return `${base}-[${arbitrary(value)}]`;
}

function radiusClasses(value: string, version: TwVersion): string[] {
  const [tl, tr, br, bl] = expandBox(value);
  if (tl === tr && tl === br && tl === bl) return [radiusClass('', tl, version)];
  return [radiusClass('tl', tl, version), radiusClass('tr', tr, version), radiusClass('br', br, version), radiusClass('bl', bl, version)];
}

function flexClasses(value: string): string[] {
  const named: Record<string, string> = { '1 1 0%': 'flex-1', '1 1 0px': 'flex-1', '1 1 auto': 'flex-auto', '0 1 auto': 'flex-initial', '0 0 auto': 'flex-none' };
  if (named[value]) return [named[value]];
  const [grow, shrink, basis] = value.split(/\s+/);
  const classes: string[] = [];
  if (grow && grow !== '0') classes.push(grow === '1' ? 'grow' : `grow-[${grow}]`);
  if (shrink === '0') classes.push('shrink-0');
  if (basis && basis !== 'auto') classes.push(`basis-[${arbitrary(basis)}]`);
  return classes;
}

function gridTracks(prefix: 'grid-cols' | 'grid-rows', value: string): string {
  if (value === 'none') return `${prefix}-none`;
  const tracks = value.split(/\s+(?![^(]*\))/);
  if (tracks.length > 1 && tracks.every((t) => t === tracks[0]) && px(tracks[0]!) !== null) {
    return `${prefix}-${tracks.length}`;
  }
  return `${prefix}-[${arbitrary(value)}]`;
}

function lineHeight(value: string, version: TwVersion): string {
  if (value === 'normal') return 'leading-normal';
  const n = px(value);
  if (n !== null && n % 4 === 0 && (version === 'v4' || (n >= 12 && n <= 40))) return `leading-${n / 4}`;
  return `leading-[${arbitrary(value)}]`;
}

function opacityClass(value: string, version: TwVersion): string {
  const pct = Math.round(parseFloat(value) * 100);
  if (Math.abs(parseFloat(value) * 100 - pct) < 0.01 && (version === 'v4' || pct % 5 === 0)) return `opacity-${pct}`;
  return `opacity-[${value}]`;
}

function classesFor(prop: string, value: string, version: TwVersion): string[] {
  const keyword = KEYWORDS[prop]?.[value];
  if (keyword) return [keyword];

  switch (prop) {
    case 'display':
      return DISPLAY[value] ? [DISPLAY[value]] : [];
    case 'top':
    case 'right':
    case 'bottom':
    case 'left':
      return [spaceClass(prop, value, version)];
    case 'z-index':
      return [/^(0|10|20|30|40|50|auto)$/.test(value) ? `z-${value}` : `z-[${value}]`];
    case 'flex':
      return flexClasses(value);
    case 'flex-grow':
      return [value === '1' ? 'grow' : value === '0' ? 'grow-0' : `grow-[${value}]`];
    case 'flex-shrink':
      return [value === '0' ? 'shrink-0' : value === '1' ? 'shrink' : `shrink-[${value}]`];
    case 'flex-basis':
      return [spaceClass('basis', value, version)];
    case 'align-items':
      return ALIGN[value] ? [`items-${ALIGN[value]}`] : [];
    case 'justify-content':
      return ALIGN[value] ? [`justify-${ALIGN[value]}`] : [];
    case 'align-content':
      return ALIGN[value] ? [`content-${ALIGN[value]}`] : [];
    case 'align-self':
      return value === 'auto' ? ['self-auto'] : ALIGN[value] ? [`self-${ALIGN[value]}`] : [];
    case 'justify-items':
      return ALIGN[value] ? [`justify-items-${ALIGN[value]}`] : [];
    case 'justify-self':
      return value === 'auto' ? ['justify-self-auto'] : ALIGN[value] ? [`justify-self-${ALIGN[value]}`] : [];
    case 'order':
      return [/^-?\d+$/.test(value) ? (value.startsWith('-') ? `-order-${value.slice(1)}` : `order-${value}`) : `order-[${value}]`];
    case 'gap': {
      const [row, col] = value.split(/\s+/);
      if (!col || row === col) return row === 'normal' ? [] : [spaceClass('gap', row!, version)];
      return [row === 'normal' ? '' : spaceClass('gap-y', row!, version), col === 'normal' ? '' : spaceClass('gap-x', col, version)].filter(Boolean);
    }
    case 'grid-template-columns':
      return [gridTracks('grid-cols', value)];
    case 'grid-template-rows':
      return [gridTracks('grid-rows', value)];
    case 'grid-column-start':
    case 'grid-row-start': {
      const span = /^span (\d+)$/.exec(value)?.[1];
      const axis = prop.startsWith('grid-column') ? 'col' : 'row';
      return [span ? `${axis}-span-${span}` : `${axis}-start-[${arbitrary(value)}]`];
    }
    case 'width':
      return [sizeClass('w', value, version)];
    case 'height':
      return [sizeClass('h', value, version)];
    case 'min-width':
      return [sizeClass('min-w', value, version)];
    case 'min-height':
      return [sizeClass('min-h', value, version)];
    case 'max-width':
      return [sizeClass('max-w', value, version)];
    case 'max-height':
      return [sizeClass('max-h', value, version)];
    case 'margin':
      return boxClasses('m', value, version);
    case 'padding':
      return boxClasses('p', value, version);
    case 'margin-top': case 'margin-right': case 'margin-bottom': case 'margin-left':
      return [spaceClass(`m${prop[7]}`, value, version)];
    case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left':
      return [spaceClass(`p${prop[8]}`, value, version)];
    case 'border':
      return borderClasses('', value, version);
    case 'border-top':
    case 'border-right':
    case 'border-bottom':
    case 'border-left':
      return borderClasses(prop[7] as 't' | 'r' | 'b' | 'l', value, version);
    case 'border-radius':
      return radiusClasses(value, version);
    case 'overflow': {
      const [x, y = x] = value.split(/\s+/);
      if (x === y && OVERFLOW.has(x!)) return [`overflow-${x}`];
      return [OVERFLOW.has(x!) ? `overflow-x-${x}` : '', OVERFLOW.has(y!) ? `overflow-y-${y}` : ''].filter(Boolean);
    }
    case 'font-size': {
      const n = px(value);
      return [n !== null && FONT_SIZES[n] ? `text-${FONT_SIZES[n]}` : `text-[${arbitrary(value)}]`];
    }
    case 'font-weight':
      return [FONT_WEIGHTS[value] ? `font-${FONT_WEIGHTS[value]}` : `font-[${value}]`];
    case 'font-family':
      return [`font-[${arbitrary(value)}]`];
    case 'line-height':
      return [lineHeight(value, version)];
    case 'letter-spacing':
      return [value === 'normal' ? 'tracking-normal' : `tracking-[${arbitrary(value)}]`];
    case 'overflow-wrap':
      return value === 'break-word' || value === 'anywhere' ? [version === 'v4' ? 'wrap-break-word' : 'break-words'] : [];
    case 'color':
      return [colorClass('text', value, version)];
    case 'background-color':
      return [colorClass('bg', value, version)];
    case 'opacity':
      return [opacityClass(value, version)];
    case 'box-shadow':
      return [value === 'none' ? 'shadow-none' : `shadow-[${arbitrary(value)}]`];
    case 'aspect-ratio':
      return [value === '1 / 1' ? 'aspect-square' : value === '16 / 9' ? 'aspect-video' : `aspect-[${arbitrary(value.replace(/\s/g, ''))}]`];
    case 'background-image':
      return [value === 'none' ? 'bg-none' : `bg-[${arbitrary(value)}]`];
    case 'content':
      return [`content-[${arbitrary(value === 'none' ? "''" : value)}]`];
    default:
      return [`[${prop}:${arbitrary(value)}]`];
  }
}

export function toTailwind(decls: Declaration[], options: TailwindOptions): string[] {
  const variant = options.variant ?? '';
  const classes: string[] = [];
  for (const [prop, value] of decls) {
    for (const cls of classesFor(prop, value.trim(), options.version)) {
      const full = variant + cls;
      if (cls && !classes.includes(full)) classes.push(full);
    }
  }
  return classes;
}

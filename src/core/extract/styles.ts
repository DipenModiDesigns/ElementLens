/**
 * Pure helpers that turn a full computed style map into a short, readable declaration list:
 * drop values equal to browser defaults, drop noise, merge longhands into shorthands, sort.
 */

export type StyleMap = Record<string, string>;
export type Declaration = [property: string, value: string];

export interface CleanOptions {
  isSvg?: boolean;
  /** Properties kept even when they equal the default (e.g. `content` on pseudo-elements). */
  keep?: string[];
  /** For pseudo-elements: the owning element's styles. Inherited values equal to it are dropped. */
  inheritFrom?: StyleMap;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

// Logical properties mirror the physical ones we already output.
const LOGICAL = /(^|-)(block|inline)(-|$)|^border-(start|end)-(start|end)-radius$/;
const VENDOR = /^-(webkit|moz|ms)-/;
const SVG_ONLY = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'fill', 'fill-opacity', 'fill-rule', 'stroke',
  'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stop-color', 'stop-opacity', 'clip-rule', 'marker-start',
  'marker-mid', 'marker-end', 'paint-order', 'vector-effect', 'shape-rendering', 'color-interpolation',
  'color-interpolation-filters', 'flood-color', 'flood-opacity', 'lighting-color', 'dominant-baseline',
  'baseline-shift', 'text-anchor',
]);
// Common inherited properties: on a pseudo-element they are noise when equal to the element's value.
const INHERITED = new Set([
  'color', 'cursor', 'direction', 'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight',
  'font-stretch', 'letter-spacing', 'line-height', 'list-style-image', 'list-style-position',
  'list-style-type', 'quotes', 'text-align', 'text-indent', 'text-shadow', 'text-transform', 'visibility',
  'white-space', 'word-spacing', 'word-break', 'overflow-wrap', 'pointer-events', 'user-select',
]);

// Readable grouping order: layout, flex/grid, size, spacing, borders, text, visuals.
const ORDER = [
  'content', 'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear',
  'box-sizing', 'flex', 'flex-direction', 'flex-wrap', 'justify', 'align', 'place', 'order', 'gap',
  'row-gap', 'column-gap', 'grid', 'width', 'min-width', 'max-width', 'height', 'min-height',
  'max-height', 'aspect-ratio', 'margin', 'padding', 'border', 'outline', 'overflow', 'font',
  'line-height', 'letter-spacing', 'text', 'white-space', 'word', 'color', 'background', 'box-shadow',
  'opacity', 'transform', 'transition', 'animation', 'filter', 'cursor',
];

function orderIndex(prop: string): number {
  const i = ORDER.findIndex((p) => prop === p || prop.startsWith(`${p}-`));
  return i === -1 ? ORDER.length : i;
}

/** Shortest 1-4 value form for box shorthands (margin, padding, border-radius). */
export function boxShorthand(values: string[]): string {
  const [t = '0px', r = t, b = t, l = r] = values;
  if (t === r && t === b && t === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

function isNoise(prop: string, value: string, all: StyleMap, defaults: StyleMap, isSvg: boolean): boolean {
  if (prop.startsWith('--') || VENDOR.test(prop) || LOGICAL.test(prop)) return true;
  if (!isSvg && SVG_ONLY.has(prop)) return true;
  // Any *-color that defaults to currentColor (border, outline, caret, rules...) and still follows it.
  if (prop.endsWith('-color') && value === all.color && defaults[prop] === defaults.color) return true;
  // `auto` is the initial min size; browsers report it differently for flex/grid items.
  if ((prop === 'min-width' || prop === 'min-height') && value === 'auto') return true;
  // "auto 32 / 32" is derived from <img width height> attributes by the browser.
  if (prop === 'aspect-ratio' && value.startsWith('auto ')) return true;

  const side = /^border-(top|right|bottom|left)-(width|style|color)$/.exec(prop);
  if (side && (all[`border-${side[1]}-style`] === 'none' || all[`border-${side[1]}-width`] === '0px')) {
    return true;
  }
  if (prop.startsWith('outline-') && all['outline-style'] === 'none') return true;
  if (prop.startsWith('column-rule-') && all['column-rule-style'] === 'none') return true;
  if (/^text-decoration-(color|style|thickness)$/.test(prop) && all['text-decoration-line'] === 'none') {
    return true;
  }
  if (prop === 'transform-origin' && all.transform === 'none') return true;
  if (prop === 'perspective-origin' && all.perspective === 'none') return true;
  return false;
}

/** Merge longhands into shorthands, reading missing sides from the full computed map. */
function compact(decls: Map<string, string>, all: StyleMap) {
  const has = (props: string[]) => props.some((p) => decls.has(p));
  const take = (props: string[]) => props.forEach((p) => decls.delete(p));

  for (const box of ['margin', 'padding']) {
    const props = SIDES.map((s) => `${box}-${s}`);
    if (has(props)) {
      decls.set(box, boxShorthand(props.map((p) => all[p] ?? '0px')));
      take(props);
    }
  }

  const visible = SIDES.filter(
    (s) => all[`border-${s}-style`] !== 'none' && all[`border-${s}-width`] !== '0px',
  );
  const sideValue = (s: string) =>
    `${all[`border-${s}-width`]} ${all[`border-${s}-style`]} ${all[`border-${s}-color`]}`;
  const borderProps = SIDES.flatMap((s) => ['width', 'style', 'color'].map((k) => `border-${s}-${k}`));
  if (visible.length > 0 && has(borderProps)) {
    take(borderProps);
    const values = visible.map(sideValue);
    if (visible.length === 4 && values.every((v) => v === values[0])) {
      decls.set('border', values[0]!);
    } else {
      visible.forEach((s, i) => decls.set(`border-${s}`, values[i]!));
    }
  }

  const radius = CORNERS.map((c) => `border-${c}-radius`);
  if (has(radius)) {
    const values = radius.map((p) => all[p] ?? '0px');
    // Elliptical corners ("10px 5px") cannot be merged into a simple shorthand.
    if (values.every((v) => !v.includes(' '))) {
      decls.set('border-radius', boxShorthand(values));
      take(radius);
    }
  }

  if (has(['overflow-x', 'overflow-y'])) {
    const x = all['overflow-x'] ?? 'visible';
    const y = all['overflow-y'] ?? 'visible';
    decls.set('overflow', x === y ? x : `${x} ${y}`);
    take(['overflow-x', 'overflow-y']);
  }

  if (has(['row-gap', 'column-gap'])) {
    const row = all['row-gap'] ?? 'normal';
    const col = all['column-gap'] ?? 'normal';
    decls.set('gap', row === col ? row : `${row} ${col}`);
    take(['row-gap', 'column-gap']);
  }

  if (has(['flex-grow', 'flex-shrink', 'flex-basis'])) {
    decls.set('flex', `${all['flex-grow']} ${all['flex-shrink']} ${all['flex-basis']}`);
    take(['flex-grow', 'flex-shrink', 'flex-basis']);
  }
}

/** Declarations of `target` that differ from `defaults`, cleaned, merged and sorted. */
export function cleanStyles(target: StyleMap, defaults: StyleMap, options: CleanOptions = {}): Declaration[] {
  const { isSvg = false, keep = [], inheritFrom } = options;
  const decls = new Map<string, string>();

  for (const [prop, value] of Object.entries(target)) {
    if (!value) continue;
    const forced = keep.includes(prop);
    if (!forced && value === defaults[prop]) continue;
    if (!forced && isNoise(prop, value, target, defaults, isSvg)) continue;
    if (!forced && inheritFrom && INHERITED.has(prop) && value === inheritFrom[prop]) continue;
    decls.set(prop, value);
  }

  compact(decls, target);

  return [...decls.entries()].sort(
    ([a], [b]) => orderIndex(a) - orderIndex(b) || a.localeCompare(b),
  );
}

export function formatRule(selector: string, decls: Declaration[]): string {
  if (decls.length === 0) return `${selector} {\n  /* only browser defaults */\n}`;
  return `${selector} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`;
}

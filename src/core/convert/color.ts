/** Color parsing and OKLab distance, enough to match computed colors against a palette. */

export interface Rgba {
  /** 0-255 */
  r: number;
  g: number;
  b: number;
  /** 0-1 */
  a: number;
}

export type Oklab = [L: number, a: number, b: number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  const v = value.trim();
  return clamp01(v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
}

function oklchToRgba(L: number, C: number, H: number, alpha: number): Rgba {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [r, g, bl] = linear.map((x) => {
    const c = clamp01(x);
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  });
  return { r: r!, g: g!, b: bl!, a: alpha };
}

/** Parses hex, rgb()/rgba() (comma or space syntax), oklch() and `transparent`. */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
  if (rgb) {
    return { r: Math.round(+rgb[1]!), g: Math.round(+rgb[2]!), b: Math.round(+rgb[3]!), a: parseAlpha(rgb[4]) };
  }

  const oklch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(value);
  if (oklch) {
    const L = oklch[2] ? +oklch[1]! / 100 : +oklch[1]!;
    return oklchToRgba(L, +oklch[3]!, +oklch[4]!, parseAlpha(oklch[5]));
  }
  return null;
}

export function toOklab({ r, g, b }: Rgba): Oklab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabDistance(x: Oklab, y: Oklab): number {
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function toHex({ r, g, b, a }: Rgba): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(Math.round(a * 255)) : ''}`;
}

export interface PaletteMatch {
  name: string;
  distance: number;
}

/** Closest palette entry (by OKLab distance, alpha ignored). */
export function nearestColor(color: Rgba, palette: Map<string, Oklab>): PaletteMatch | null {
  const target = toOklab(color);
  let best: PaletteMatch | null = null;
  for (const [name, lab] of palette) {
    const distance = oklabDistance(target, lab);
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best;
}

/** Prepare a palette (name -> CSS color) for repeated matching. */
export function buildPalette(colors: Record<string, string>): Map<string, Oklab> {
  const map = new Map<string, Oklab>();
  for (const [name, css] of Object.entries(colors)) {
    const rgba = parseColor(css);
    if (rgba) map.set(name, toOklab(rgba));
  }
  return map;
}

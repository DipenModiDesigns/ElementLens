import { parseColor, toHex } from '../convert/color';
import { describeElement } from './describe';
import { toAbsoluteUrl } from './url';

/** Colors, fonts, images and inline SVGs used by an element (and optionally its children). */

export type ColorUse = 'text' | 'background' | 'border' | 'shadow' | 'outline' | 'fill' | 'stroke' | 'decoration';

export interface ColorAsset {
  /** #rrggbb or #rrggbbaa */
  hex: string;
  uses: ColorUse[];
  count: number;
}

export interface FontAsset {
  /** Full font-family stack as computed. */
  family: string;
  weights: string[];
  sizes: string[];
  count: number;
}

export type ImageKind = 'img' | 'background' | 'poster' | 'svg-image';

export interface ImageAsset {
  url: string;
  kind: ImageKind;
  element: string;
  /** Natural size for <img>, when loaded. */
  width?: number;
  height?: number;
}

export interface SvgAsset {
  element: string;
  /** Standalone markup with xmlns, scripts and event handlers removed. */
  markup: string;
}

export interface AssetsResult {
  colors: ColorAsset[];
  fonts: FontAsset[];
  images: ImageAsset[];
  svgs: SvgAsset[];
  truncated: boolean;
}

export interface AssetOptions {
  includeChildren?: boolean;
  skip?: (node: Node) => boolean;
  maxElements?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PSEUDOS = ['::before', '::after'];
const SVG_SHAPES = new Set(['path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect', 'text', 'tspan', 'use']);
// Color functions or hex inside a longer value such as box-shadow.
const COLOR_IN_VALUE = /(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g;

/** All url(...) values in a CSS value, e.g. background-image with several layers. */
export function cssUrls(value: string): string[] {
  return Array.from(value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g), (m) => m[2]!).filter(Boolean);
}

/** Colors mentioned inside a value like `rgba(0, 0, 0, 0.1) 0px 1px 2px`. */
export function colorsIn(value: string): string[] {
  return value.match(COLOR_IN_VALUE) ?? [];
}

/** Clean, standalone SVG markup: xmlns added, <script> and on* handlers removed. */
export function cleanSvg(svg: Element): string {
  const clone = svg.cloneNode(true) as Element;
  clone.querySelectorAll('script').forEach((s) => s.remove());
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const name of el.getAttributeNames()) if (/^on/i.test(name)) el.removeAttribute(name);
  }
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', SVG_NS);
  return clone.outerHTML;
}

const hasOwnText = (el: Element) =>
  Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');

export function collectAssets(root: Element, options: AssetOptions = {}): AssetsResult {
  const { includeChildren = false, skip, maxElements = 300 } = options;
  const colors = new Map<string, ColorAsset>();
  const fonts = new Map<string, FontAsset>();
  const images = new Map<string, ImageAsset>();
  const svgs: SvgAsset[] = [];
  let visited = 0;
  let truncated = false;

  const addColor = (value: string, use: ColorUse) => {
    const rgba = parseColor(value);
    if (!rgba || rgba.a === 0) return;
    const hex = toHex(rgba);
    const entry = colors.get(hex) ?? { hex, uses: [], count: 0 };
    entry.count++;
    if (!entry.uses.includes(use)) entry.uses.push(use);
    colors.set(hex, entry);
  };
  const addImage = (url: string, kind: ImageKind, el: Element, size?: { width: number; height: number }) => {
    const absolute = toAbsoluteUrl(url, document.baseURI);
    if (!absolute || images.has(absolute)) return;
    images.set(absolute, { url: absolute, kind, element: describeElement(el), ...size });
  };

  const readStyles = (cs: CSSStyleDeclaration, el: Element, textHere: boolean) => {
    if (textHere) addColor(cs.color, 'text');
    addColor(cs.backgroundColor, 'background');
    for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      if (cs[`border${side}Style`] !== 'none' && parseFloat(cs[`border${side}Width`]) > 0) {
        addColor(cs[`border${side}Color`], 'border');
      }
    }
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) addColor(cs.outlineColor, 'outline');
    if (cs.boxShadow !== 'none') colorsIn(cs.boxShadow).forEach((c) => addColor(c, 'shadow'));
    if (textHere && cs.textDecorationLine !== 'none') addColor(cs.textDecorationColor, 'decoration');
    // Only shapes paint; <svg>/<g> report a default fill that is never drawn.
    if (el.namespaceURI === SVG_NS && SVG_SHAPES.has(el.localName)) {
      if (cs.fill && cs.fill !== 'none') addColor(cs.fill, 'fill');
      if (cs.stroke && cs.stroke !== 'none') addColor(cs.stroke, 'stroke');
    }
    cssUrls(cs.backgroundImage).forEach((url) => addImage(url, 'background', el));
  };

  const visit = (el: Element) => {
    if (skip?.(el)) return;
    if (visited >= maxElements) {
      truncated = true;
      return;
    }
    visited++;
    const cs = getComputedStyle(el);
    const textHere = hasOwnText(el);
    readStyles(cs, el, textHere);

    for (const pseudo of PSEUDOS) {
      const ps = getComputedStyle(el, pseudo);
      if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
      readStyles(ps, el, /^["'].+["']$/.test(ps.content));
    }

    if (textHere) {
      const entry = fonts.get(cs.fontFamily) ?? { family: cs.fontFamily, weights: [], sizes: [], count: 0 };
      entry.count++;
      if (!entry.weights.includes(cs.fontWeight)) entry.weights.push(cs.fontWeight);
      if (!entry.sizes.includes(cs.fontSize)) entry.sizes.push(cs.fontSize);
      fonts.set(cs.fontFamily, entry);
    }

    if (el instanceof HTMLImageElement) {
      const url = el.currentSrc || el.src;
      if (url) addImage(url, 'img', el, el.naturalWidth ? { width: el.naturalWidth, height: el.naturalHeight } : undefined);
    } else if (el instanceof HTMLVideoElement && el.poster) {
      addImage(el.poster, 'poster', el);
    } else if (el.namespaceURI === SVG_NS && el.localName === 'image') {
      const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
      if (href) addImage(href, 'svg-image', el);
    }

    // Outermost inline SVGs only; their insides are part of the markup.
    if (el.localName === 'svg' && el.namespaceURI === SVG_NS && !el.parentElement?.closest('svg')) {
      svgs.push({ element: describeElement(el), markup: cleanSvg(el) });
    }

    if (el === root && !includeChildren) return;
    for (const child of Array.from(el.children)) visit(child);
  };

  visit(root);

  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  const sortSizes = (sizes: string[]) => sizes.sort((a, b) => parseFloat(a) - parseFloat(b));
  return {
    colors: [...colors.values()].sort(byCount),
    fonts: [...fonts.values()].sort(byCount).map((f) => ({ ...f, weights: f.weights.sort(), sizes: sortSizes(f.sizes) })),
    images: [...images.values()],
    svgs,
    truncated,
  };
}

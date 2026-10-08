import { useEffect, useMemo, useRef } from 'preact/hooks';
import { collectAssets, type AssetsResult, type SvgAsset } from '@/core/extract/assets';
import { fileSlug } from '@/core/export/snippet';
import { downloadText } from './download';

interface Props {
  element: Element;
  includeChildren: boolean;
  host: Element;
  container: HTMLElement;
  refreshKey: number;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}

const LIMITS = { colors: 24, fonts: 12, images: 30, svgs: 20 };

const familyName = (stack: string) => stack.replace(/["']/g, '');
const fileName = (url: string) => {
  if (url.startsWith('data:')) return 'data URL';
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
  } catch {
    return url;
  }
};

function More({ total, shown }: { total: number; shown: number }) {
  return total > shown ? <p class="el-note">+{total - shown} more</p> : null;
}

/** Renders a cleaned SVG via DOMParser (no innerHTML); pointer events are off on the preview. */
function SvgPreview({ svg }: { svg: SvgAsset }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const parsed = new DOMParser().parseFromString(svg.markup, 'image/svg+xml').documentElement;
    if (parsed.localName !== 'svg') return;
    const node = document.importNode(parsed, true);
    node.setAttribute('width', '100%');
    node.setAttribute('height', '100%');
    target.replaceChildren(node);
  }, [svg]);
  return <div class="el-svg-preview" ref={box} aria-hidden="true" />;
}

function Group({ title, count, children }: { title: string; count: number; children: preact.ComponentChildren }) {
  return (
    <div class="el-asset-group">
      <div class="el-group-label">
        {title} <span class="el-count">{count}</span>
      </div>
      {count === 0 ? <p class="el-note">None found.</p> : children}
    </div>
  );
}

export function Assets({ element, includeChildren, host, container, refreshKey, copied, onCopy }: Props) {
  const assets: AssetsResult = useMemo(
    () => collectAssets(element, { includeChildren, skip: (n) => n === host }),
    [element, includeChildren, host, refreshKey],
  );
  const done = (key: string, label: string) => (copied === key ? 'Copied' : label);

  return (
    <div class="el-assets">
      <Group title="Colors" count={assets.colors.length}>
        <div class="el-swatches">
          {assets.colors.slice(0, LIMITS.colors).map((c) => (
            <button
              key={c.hex}
              class="el-swatch"
              title={`${c.hex}: ${c.uses.join(', ')} (click to copy)`}
              onClick={() => onCopy(c.hex, `color:${c.hex}`)}
            >
              <span class="el-swatch-chip" style={{ boxShadow: `inset 0 0 0 30px ${c.hex}` }} />
              <span class="el-swatch-hex">{done(`color:${c.hex}`, c.hex)}</span>
              <span class="el-swatch-use">{c.uses.join(', ')}</span>
            </button>
          ))}
        </div>
        <More total={assets.colors.length} shown={LIMITS.colors} />
      </Group>

      <Group title="Fonts" count={assets.fonts.length}>
        <ul class="el-asset-list">
          {assets.fonts.slice(0, LIMITS.fonts).map((f) => (
            <li key={f.family} class="el-asset-row">
              <span class="el-font-sample" style={{ fontFamily: f.family }}>
                Aa
              </span>
              <span class="el-asset-meta">
                <strong title={f.family}>{familyName(f.family)}</strong>
                <span class="el-note">
                  {f.weights.join(', ')} · {f.sizes.join(', ')}
                </span>
              </span>
              <button class="el-btn el-asset-btn" onClick={() => onCopy(`font-family: ${f.family};`, `font:${f.family}`)}>
                {done(`font:${f.family}`, 'Copy')}
              </button>
            </li>
          ))}
        </ul>
        <More total={assets.fonts.length} shown={LIMITS.fonts} />
      </Group>

      <Group title="Images" count={assets.images.length}>
        <ul class="el-asset-list">
          {assets.images.slice(0, LIMITS.images).map((img) => (
            <li key={img.url} class="el-asset-row">
              <img class="el-thumb" src={img.url} alt="" loading="lazy" />
              <span class="el-asset-meta">
                <strong title={img.url}>{fileName(img.url)}</strong>
                <span class="el-note">
                  {img.kind}
                  {img.width ? ` · ${img.width} × ${img.height}` : ''}
                </span>
              </span>
              <a class="el-btn el-asset-btn" href={img.url} target="_blank" rel="noopener noreferrer">
                Open
              </a>
              <button class="el-btn el-asset-btn" onClick={() => onCopy(img.url, `img:${img.url}`)}>
                {done(`img:${img.url}`, 'Copy URL')}
              </button>
            </li>
          ))}
        </ul>
        <More total={assets.images.length} shown={LIMITS.images} />
      </Group>

      <Group title="SVG icons" count={assets.svgs.length}>
        <ul class="el-asset-list">
          {assets.svgs.slice(0, LIMITS.svgs).map((svg, i) => (
            <li key={i} class="el-asset-row">
              <SvgPreview svg={svg} />
              <span class="el-asset-meta">
                <strong>{svg.element}</strong>
                <span class="el-note">{(svg.markup.length / 1024).toFixed(1)} KB</span>
              </span>
              <button class="el-btn el-asset-btn" onClick={() => onCopy(svg.markup, `svg:${i}`)}>
                {done(`svg:${i}`, 'Copy')}
              </button>
              <button
                class="el-btn el-asset-btn"
                onClick={() => downloadText(`${fileSlug(svg.element)}-${i + 1}.svg`, svg.markup, 'image/svg+xml', container)}
              >
                .svg
              </button>
            </li>
          ))}
        </ul>
        <More total={assets.svgs.length} shown={LIMITS.svgs} />
      </Group>

      {assets.truncated && <p class="el-note">Scan stopped early: this element is very large.</p>}
    </div>
  );
}

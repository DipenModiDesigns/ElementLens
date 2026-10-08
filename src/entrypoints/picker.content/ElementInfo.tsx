import { useMemo } from 'preact/hooks';
import { boxModel, type Sides } from '@/core/extract/box';
import { locators } from '@/core/extract/selector';

interface Props {
  element: Element;
  /** Re-measure when the panel's refresh button is used. */
  refreshKey: number;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}

const fmt = (n: number) => (n === 0 ? '-' : String(n));

function Ring({ label, sides, cls, children }: { label: string; sides: Sides; cls: string; children: preact.ComponentChildren }) {
  const [t, r, b, l] = sides;
  return (
    <div class={`el-box-ring ${cls}`}>
      <span class="el-box-name">{label}</span>
      <span class="el-box-top">{fmt(t)}</span>
      <div class="el-box-mid">
        <span class="el-box-side">{fmt(l)}</span>
        {children}
        <span class="el-box-side">{fmt(r)}</span>
      </div>
      <span class="el-box-bottom">{fmt(b)}</span>
    </div>
  );
}

export function ElementInfo({ element, refreshKey, copied, onCopy }: Props) {
  const box = useMemo(
    () => boxModel(getComputedStyle(element), element.getBoundingClientRect()),
    [element, refreshKey],
  );
  const list = useMemo(() => locators(element), [element, refreshKey]);

  return (
    <div class="el-info">
      <div class="el-group-label">Box model</div>
      <div class="el-boxmodel" aria-label="Box model">
        <Ring label="margin" sides={box.margin} cls="el-ring-margin">
          <Ring label="border" sides={box.border} cls="el-ring-border">
            <Ring label="padding" sides={box.padding} cls="el-ring-padding">
              <div class="el-box-content">
                {box.width} × {box.height}
              </div>
            </Ring>
          </Ring>
        </Ring>
      </div>
      <p class="el-note">
        {box.display} · {box.position} · {box.boxSizing}
      </p>

      <div class="el-group-label">Selectors</div>
      <ul class="el-locators">
        {list.map((l) => (
          <li key={l.label} class="el-locator">
            <span class="el-locator-label">{l.label}</span>
            <code class="el-locator-value" title={l.value}>
              {l.value}
            </code>
            <button class="el-btn el-locator-copy" onClick={() => onCopy(l.value, `loc:${l.label}`)} aria-label={`Copy ${l.label}`}>
              {copied === `loc:${l.label}` ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

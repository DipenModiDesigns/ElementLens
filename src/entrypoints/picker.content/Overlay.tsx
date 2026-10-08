import { useEffect, useReducer } from 'preact/hooks';
import { describeElement } from '@/core/extract/describe';

const px = (v: string) => Math.max(0, parseFloat(v) || 0);
const ring = (t: number, r: number, b: number, l: number) => `${t}px ${r}px ${b}px ${l}px`;
// Preact 11 no longer appends "px" to numeric style values, so units are explicit.
const box = (left: number, top: number, width: number, height: number) => ({
  left: `${left}px`,
  top: `${top}px`,
  width: `${Math.max(0, width)}px`,
  height: `${Math.max(0, height)}px`,
});

/** DevTools-style box model highlight (margin, border, padding, content) with a size label. */
export function Overlay({ target }: { target: Element }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => redraw(0));
    };
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    // Catches layout changes we get no event for (animations, lazy content).
    const timer = setInterval(schedule, 500);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [target]);

  if (!target.isConnected) return null;

  const r = target.getBoundingClientRect();
  const cs = getComputedStyle(target);
  const m = { t: px(cs.marginTop), r: px(cs.marginRight), b: px(cs.marginBottom), l: px(cs.marginLeft) };
  const bw = {
    t: px(cs.borderTopWidth), r: px(cs.borderRightWidth), b: px(cs.borderBottomWidth), l: px(cs.borderLeftWidth),
  };
  const p = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };

  const labelTop = r.top - m.t - 26 >= 0 ? r.top - m.t - 26 : Math.min(r.bottom + m.b + 4, innerHeight - 26);
  const labelLeft = Math.max(4, Math.min(r.left, innerWidth - 280));

  return (
    <div class="el-overlay" aria-hidden="true">
      <div
        class="el-box el-margin"
        style={{
          ...box(r.left - m.l, r.top - m.t, r.width + m.l + m.r, r.height + m.t + m.b),
          borderWidth: ring(m.t, m.r, m.b, m.l),
        }}
      />
      <div
        class="el-box el-border"
        style={{ ...box(r.left, r.top, r.width, r.height), borderWidth: ring(bw.t, bw.r, bw.b, bw.l) }}
      />
      <div
        class="el-box el-padding"
        style={{
          ...box(r.left + bw.l, r.top + bw.t, r.width - bw.l - bw.r, r.height - bw.t - bw.b),
          borderWidth: ring(p.t, p.r, p.b, p.l),
        }}
      />
      <div
        class="el-box el-content"
        style={box(
          r.left + bw.l + p.l,
          r.top + bw.t + p.t,
          r.width - bw.l - bw.r - p.l - p.r,
          r.height - bw.t - bw.b - p.t - p.b,
        )}
      />
      <div class="el-label" style={{ left: `${labelLeft}px`, top: `${labelTop}px` }}>
        <span class="el-label-name">{describeElement(target)}</span>
        <span class="el-label-size">
          {Math.round(r.width)} × {Math.round(r.height)}
        </span>
      </div>
    </div>
  );
}

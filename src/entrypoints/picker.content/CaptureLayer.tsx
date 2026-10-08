import { useEffect, useRef } from 'preact/hooks';
import { elementAt, scrollableAncestor } from './dom';

interface Props {
  host: Element;
  onHover: (el: Element | null) => void;
  onPick: (el: Element) => void;
}

// Swallowed on the way down so page listeners on document/body never see picker clicks.
const SWALLOW = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'];

/**
 * Transparent full-viewport layer shown only while picking. It sits above the page, so clicks
 * never reach page elements (links, buttons, analytics), however the page registered them.
 */
export function CaptureLayer({ host, onHover, onPick }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const fromLayer = (e: Event) => e.composedPath()[0] === layer.current;
    // Window capture runs before any document or element listener of the page.
    const onEvent = (e: Event) => {
      if (!fromLayer(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== 'click') return;
      const { clientX, clientY } = e as MouseEvent;
      const el = elementAt(clientX, clientY, host);
      if (el) pick.current(el);
    };
    for (const type of SWALLOW) window.addEventListener(type, onEvent, true);
    return () => {
      cancelAnimationFrame(frame.current);
      for (const type of SWALLOW) window.removeEventListener(type, onEvent, true);
    };
  }, [host]);

  const onMouseMove = (e: MouseEvent) => {
    const { clientX: x, clientY: y } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onHover(elementAt(x, y, host)));
  };

  // Forward wheel scrolling to inner scroll containers under the pointer.
  const onWheel = (e: WheelEvent) => {
    const el = elementAt(e.clientX, e.clientY, host);
    const target = el && scrollableAncestor(el);
    if (!target) return; // let the page scroll natively
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    target.scrollBy(e.deltaX * scale, e.deltaY * scale);
  };

  return (
    <div
      ref={layer}
      class="el-capture"
      onMouseMove={onMouseMove}
      onMouseLeave={() => onHover(null)}
      onWheel={onWheel}
    />
  );
}

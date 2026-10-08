import { useCallback, useEffect, useState } from 'preact/hooks';
import { loadSettings, type Settings } from '@/shared/settings';
import { CaptureLayer } from './CaptureLayer';
import { Overlay } from './Overlay';
import { Panel } from './Panel';

interface Props {
  host: Element;
  container: HTMLElement;
  onClose: () => void;
}

export function App({ host, container, onClose }: Props) {
  const [picking, setPicking] = useState(true);
  const [hovered, setHovered] = useState<Element | null>(null);
  const [selected, setSelected] = useState<Element | null>(null);
  const [preview, setPreview] = useState<Element | null>(null);
  const [theme, setTheme] = useState<Settings['theme']>('system');

  useEffect(() => {
    loadSettings().then((s) => setTheme(s.theme));
  }, []);

  // Esc: leave pick mode if something is selected, otherwise close the extension.
  // On document (not window) so the Panel's popup, listening on window, can claim Esc first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (picking && selected) {
        setPicking(false);
        setHovered(null);
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [picking, selected, onClose]);

  const select = useCallback((el: Element) => {
    setSelected(el);
    setPicking(false);
    setHovered(null);
    setPreview(null);
  }, []);

  const overlayTarget = picking ? hovered : (preview ?? selected);

  return (
    <div class="el-root" data-theme={theme}>
      {picking && <CaptureLayer host={host} onHover={setHovered} onPick={select} />}
      {overlayTarget && <Overlay target={overlayTarget} />}
      <Panel
        host={host}
        container={container}
        picking={picking}
        selected={selected}
        onPickStart={() => setPicking((p) => !p)}
        onSelect={select}
        onPreview={setPreview}
        onClose={onClose}
      />
    </div>
  );
}

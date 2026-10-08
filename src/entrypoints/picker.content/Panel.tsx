import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BRAND } from '@/shared/brand';
import { FEATURES } from '@/shared/features';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ComponentFormat,
  type OutputType,
  type Settings,
  type StyleFormat,
} from '@/shared/settings';
import { describeElement, elementPath } from '@/core/extract/describe';
import { createDefaultStyleProvider } from '@/core/extract/computed-css';
import { formatJsReport } from '@/core/extract/js';
import { toMarkdown } from '@/core/export/markdown';
import { fileSlug, standaloneDocument } from '@/core/export/snippet';
import { CodeView } from './CodeView';
import { ElementInfo } from './ElementInfo';
import { copyText } from './clipboard';
import { downloadText } from './download';
import { neighbours } from './dom';
import { collectJs } from './js';
import { buildOutputs, type Outputs } from './output';
import { Modal, OptionGroup, Section, Switch, type Option } from './ui';

type CodeKind = OutputType | 'js';

interface Props {
  host: Element;
  container: HTMLElement;
  picking: boolean;
  selected: Element | null;
  onPickStart: () => void;
  onSelect: (el: Element) => void;
  onPreview: (el: Element | null) => void;
  onClose: () => void;
}

const WIDTH = 360;
const PREVIEW_LINES = 9;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const COMPONENT_OPTIONS: Option<ComponentFormat>[] = [
  { value: 'html', label: 'HTML' },
  { value: 'jsx', label: 'JSX' },
];
const STYLE_OPTIONS: Option<StyleFormat>[] = [
  { value: 'computed', label: 'CSS' },
  { value: 'tailwind', label: 'Tailwind' },
  { value: 'inline', label: 'Inline CSS' },
  { value: 'authored', label: 'Site rules' },
];
const TAILWIND_OPTIONS: Option<'v4' | 'v3'>[] = [
  { value: 'v4', label: 'v4' },
  { value: 'v3', label: 'v3' },
];

const markupLabel = (format: ComponentFormat) => (format === 'jsx' ? 'JSX' : 'HTML');

function ComingSoonJs() {
  return (
    <div class="el-code el-soon">
      <strong>JavaScript: coming soon</strong>
      <p>
        This will show event handlers, framework components (React, Vue, jQuery) and framework attributes for the
        selected element.
      </p>
    </div>
  );
}

export function Panel({ host, container, picking, selected, onPickStart, onSelect, onPreview, onClose }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [modal, setModal] = useState<CodeKind | null>(null);
  const [js, setJs] = useState('');
  const [pos, setPos] = useState(() => ({ x: Math.max(16, innerWidth - WIDTH - 16), y: 16 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const crumbs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    saveSettings(patch);
  };

  const defaults = useMemo(() => createDefaultStyleProvider(container), [container]);
  useEffect(() => () => defaults.dispose(), [defaults]);

  const { includeChildren, outputType, componentFormat, styleFormat, tailwindVersion, mediaQueries } = settings;
  const label = selected ? describeElement(selected) : '';
  const markupName = markupLabel(componentFormat);

  const out = useMemo((): Outputs | null => {
    if (!selected) return null;
    if (!selected.isConnected) return { markup: '', css: '', full: '', notes: ['This element was removed from the page.'] };
    return buildOutputs(
      selected,
      { componentFormat, styleFormat, tailwindVersion, includeChildren, mediaQueries },
      { host, defaults },
    );
  }, [selected, componentFormat, styleFormat, tailwindVersion, includeChildren, mediaQueries, refreshKey, host, defaults]);

  const language = (kind: CodeKind) => {
    if (kind === 'css') return 'css';
    if (kind === 'js' || (kind === 'full' && componentFormat === 'jsx')) return 'js';
    return 'html';
  };
  const kindLabel = (kind: CodeKind) =>
    ({ full: 'Full', html: markupName, css: 'CSS', js: 'JS' })[kind];
  const copyLabel = (kind: CodeKind) => {
    if (kind === 'full') return out?.css ? `Copy ${markupName} + CSS` : `Copy ${markupName}`;
    return { html: `Copy ${markupName}`, css: 'Copy CSS', js: 'Copy JavaScript' }[kind];
  };

  useEffect(() => {
    if (!FEATURES.jsTab || !selected) return setJs('');
    let live = true;
    collectJs(selected, includeChildren, (n) => n === host)
      .then((report) => live && setJs(formatJsReport(report, label + (includeChildren ? ' and its children' : ''))))
      .catch(() => live && setJs(''));
    return () => {
      live = false;
    };
  }, [selected, includeChildren, refreshKey, host, label]);

  const codeFor = (kind: CodeKind) => {
    if (kind === 'js') return js;
    if (kind === 'html') return out?.markup ?? '';
    return out?.[kind] ?? '';
  };
  const current = codeFor(outputType);

  // Esc closes the popup first. Window capture runs before the App's document listener.
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setModal(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [modal]);

  const path = useMemo(() => (selected ? elementPath(selected) : []), [selected]);
  const nav = selected ? neighbours(selected, host) : null;
  useEffect(() => {
    if (crumbs.current) crumbs.current.scrollLeft = crumbs.current.scrollWidth;
  }, [path]);

  const flash = (key: string) => {
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  const copy = async (text: string, key: string) => {
    if (text && (await copyText(text, container))) flash(key);
  };
  const copyMarkdown = () =>
    copy(
      toMarkdown(label, [
        { label: markupName, language: componentFormat, code: out?.markup ?? '' },
        { label: 'CSS', language: 'css', code: out?.css ?? '' },
        { label: 'JavaScript', language: 'js', code: js },
      ]),
      'markdown',
    );
  // A downloadable page must be HTML, so JSX settings are rendered as HTML here.
  const download = () => {
    if (!selected?.isConnected) return;
    const page =
      componentFormat === 'html' && out
        ? out
        : buildOutputs(selected, { ...settings, componentFormat: 'html' }, { host, defaults });
    downloadText(`elementlens-${fileSlug(label)}.html`, standaloneDocument(page.markup, page.css, label), 'text/html', container);
    flash('download');
  };
  const outputOptions: Option<CodeKind>[] = [
    { value: 'full', label: 'Full' },
    { value: 'html', label: `${markupName} only` },
    { value: 'css', label: 'CSS only' },
    { value: 'js', label: 'JavaScript', soon: !FEATURES.jsTab },
  ];

  const onDragStart = (e: PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onDragMove = (e: PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: clamp(e.clientX - drag.current.dx, 0, innerWidth - 120),
      y: clamp(e.clientY - drag.current.dy, 0, innerHeight - 40),
    });
  };

  const NavButton = ({ to, label: text, title, area }: { to: Element | null | undefined; label: string; title: string; area: string }) => (
    <button
      class="el-btn el-btn-icon el-nav-btn"
      style={{ gridArea: area }}
      disabled={!to}
      title={title}
      aria-label={title}
      onClick={() => to && onSelect(to)}
    >
      {text}
    </button>
  );

  const jsSoon = (kind: CodeKind) => kind === 'js' && !FEATURES.jsTab;
  const overflowing = current.split('\n').length > PREVIEW_LINES;

  return (
    <>
      <section class="el-panel" style={{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${WIDTH}px` }} role="dialog" aria-label={BRAND.name}>
        <header class="el-header" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={() => (drag.current = null)}>
          <strong class="el-title">{BRAND.name}</strong>
          <div class="el-header-actions">
            <button class={`el-btn ${picking ? 'el-btn-active' : ''}`} onClick={onPickStart} title="Pick an element on the page">
              {picking ? 'Picking…' : 'Pick'}
            </button>
            <button class="el-btn el-btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
              ×
            </button>
          </div>
        </header>

        {!selected || !out ? (
          <div class="el-empty">
            <p>Hover over the page and click an element to inspect it.</p>
            <p class="el-muted">Press Esc to exit.</p>
          </div>
        ) : (
          <>
            <div class="el-target">
              <div class="el-crumbs" ref={crumbs}>
                {path.map((el, i) => (
                  <button
                    key={i}
                    class={`el-crumb ${el === selected ? 'el-crumb-current' : ''}`}
                    onClick={() => onSelect(el)}
                    onMouseEnter={() => onPreview(el)}
                    onMouseLeave={() => onPreview(null)}
                  >
                    {describeElement(el, 1)}
                  </button>
                ))}
              </div>
              <div class="el-nav-cross">
                <NavButton to={nav?.parent} label="↑" title="Parent element" area="up" />
                <NavButton to={nav?.prev} label="←" title="Previous sibling" area="left" />
                <NavButton to={nav?.child} label="↓" title="First child" area="down" />
                <NavButton to={nav?.next} label="→" title="Next sibling" area="right" />
              </div>
            </div>

            <div class="el-body">
              <Section title="Copy settings" open={settings.settingsOpen} onToggle={() => update({ settingsOpen: !settings.settingsOpen })}>
                <OptionGroup
                  label="Component format"
                  hint="HTML markup, or a React component in JSX."
                  value={componentFormat}
                  onChange={(v) => update({ componentFormat: v })}
                  options={COMPONENT_OPTIONS}
                />
                <OptionGroup
                  label="Style format"
                  hint="CSS: final computed values. Tailwind: utility classes. Inline CSS: style attributes. Site rules: the page's own CSS rules, incl. :hover and @media."
                  value={styleFormat}
                  onChange={(v) => update({ styleFormat: v })}
                  options={STYLE_OPTIONS}
                />
                {styleFormat === 'tailwind' && (
                  <OptionGroup
                    label="Tailwind version"
                    value={tailwindVersion}
                    onChange={(v) => update({ tailwindVersion: v })}
                    options={TAILWIND_OPTIONS}
                  />
                )}
                {styleFormat === 'authored' && (
                  <Switch
                    label="Media queries"
                    hint="On: keep @media blocks for all screen sizes. Off: only the rules active right now."
                    checked={mediaQueries}
                    onChange={(v) => update({ mediaQueries: v })}
                  />
                )}
                <OptionGroup
                  label="Output"
                  hint="What the Copy button copies. Full is ready to paste: a <style> block plus HTML, or a CSS file plus a component."
                  value={outputType}
                  onChange={(v) => v !== 'js' && update({ outputType: v })}
                  options={outputOptions}
                />
                <Switch
                  label="Include children"
                  hint="Also copy everything inside the selected element."
                  checked={includeChildren}
                  onChange={(v) => update({ includeChildren: v })}
                />
              </Section>

              <div class="el-preview-head">
                <span class="el-group-label">Preview</span>
                <button class="el-btn el-btn-icon" title="Refresh output" aria-label="Refresh" onClick={() => setRefreshKey((k) => k + 1)}>
                  ↻
                </button>
              </div>
              <div class={`el-preview ${overflowing ? 'el-preview-clipped' : ''}`}>
                {current ? <CodeView code={current} language={language(outputType)} /> : <div class="el-code" />}
                {overflowing && <div class="el-preview-fade" aria-hidden="true" />}
                <button class="el-btn el-preview-expand" onClick={() => setModal(outputType)}>
                  Show full
                </button>
              </div>
              <div class="el-notes">
                {out.notes.map((note) => (
                  <p key={note} class="el-note">
                    {note}
                  </p>
                ))}
              </div>

              <Section title="Element info" open={settings.infoOpen} onToggle={() => update({ infoOpen: !settings.infoOpen })}>
                <ElementInfo element={selected} refreshKey={refreshKey} copied={copied} onCopy={copy} />
              </Section>

              <Section title="Export actions" open={settings.exportOpen} onToggle={() => update({ exportOpen: !settings.exportOpen })}>
                <div class="el-actions">
                  <button class="el-btn el-action" onClick={copyMarkdown} title={`${markupName} and CSS as Markdown code blocks`}>
                    {copied === 'markdown' ? 'Copied!' : 'Copy as Markdown'}
                  </button>
                  <button class="el-btn el-action" onClick={download} title="A standalone page that renders this element">
                    {copied === 'download' ? 'Downloaded!' : 'Download .html'}
                  </button>
                </div>
              </Section>
            </div>

            <footer class="el-footer">
              <button class="el-btn el-copy-main" onClick={() => copy(current, 'main')} disabled={!current}>
                {copied === 'main' ? 'Copied!' : copyLabel(outputType)}
              </button>
            </footer>
          </>
        )}
      </section>

      {modal && selected && (
        <Modal title={label} onClose={() => setModal(null)}>
          <div class="el-modal-toolbar">
            <div class="el-tabs" role="tablist">
              {(['full', 'html', 'css', 'js'] as const).map((kind) => (
                <button
                  key={kind}
                  role="tab"
                  aria-selected={modal === kind}
                  class={`el-tab ${modal === kind ? 'el-tab-active' : ''}`}
                  onClick={() => setModal(kind)}
                >
                  {kindLabel(kind)}
                  {jsSoon(kind) && <span class="el-badge">Soon</span>}
                </button>
              ))}
            </div>
            <button
              class="el-btn el-btn-primary"
              disabled={jsSoon(modal) || !codeFor(modal)}
              onClick={() => copy(codeFor(modal), 'modal')}
            >
              {copied === 'modal' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {jsSoon(modal) ? <ComingSoonJs /> : <CodeView code={codeFor(modal)} language={language(modal)} />}
        </Modal>
      )}
    </>
  );
}

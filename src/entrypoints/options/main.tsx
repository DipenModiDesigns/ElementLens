import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { BRAND } from '@/shared/brand';
import { DEFAULT_SETTINGS, loadSettings, panelItem, saveSettings, type Settings } from '@/shared/settings';
import './style.css';

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [reset, setReset] = useState(false);

  const resetPanel = async () => {
    await panelItem.removeValue();
    setReset(true);
  };

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings({ ...settings, [key]: value });
    saveSettings({ [key]: value });
  };

  return (
    <main>
      <h1>
        {BRAND.name} settings<span>.</span>
      </h1>

      <label>
        Tailwind version
        <select
          value={settings.tailwindVersion}
          onChange={(e) => update('tailwindVersion', e.currentTarget.value as Settings['tailwindVersion'])}
        >
          <option value="v4">v4 (default)</option>
          <option value="v3">v3</option>
        </select>
      </label>

      <label>
        Component format
        <select
          value={settings.componentFormat}
          onChange={(e) => update('componentFormat', e.currentTarget.value as Settings['componentFormat'])}
        >
          <option value="html">HTML</option>
          <option value="jsx">JSX (React)</option>
        </select>
      </label>

      <label>
        Style format
        <select
          value={settings.styleFormat}
          onChange={(e) => update('styleFormat', e.currentTarget.value as Settings['styleFormat'])}
        >
          <option value="tailwind">Tailwind (default)</option>
          <option value="computed">CSS (computed styles)</option>
          <option value="inline">Inline CSS</option>
          <option value="authored">Site rules (the page's own CSS)</option>
        </select>
      </label>

      <label>
        Panel theme
        <select
          value={settings.theme}
          onChange={(e) => update('theme', e.currentTarget.value as Settings['theme'])}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <label>
        Panel position and width
        <button type="button" onClick={resetPanel} disabled={reset}>
          {reset ? 'Reset' : 'Reset to default'}
        </button>
      </label>

      <p class="hint">Shortcut: Alt+Shift+E (change it in your browser's extension shortcuts page).</p>

      <footer>
        Free extension by {BRAND.author}, {BRAND.company}. Help and feedback:{' '}
        <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
        <br />
        <a href={BRAND.website} target="_blank" rel="noopener">Website</a> ·{' '}
        <a href={BRAND.privacy} target="_blank" rel="noopener">Privacy policy</a>
      </footer>
    </main>
  );
}

render(<Options />, document.getElementById('app')!);

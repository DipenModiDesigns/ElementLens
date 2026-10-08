import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { BRAND } from '@/shared/brand';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/shared/settings';
import './style.css';

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings({ ...settings, [key]: value });
    saveSettings({ [key]: value });
  };

  return (
    <main>
      <h1>{BRAND.name} settings</h1>

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
        CSS mode
        <select
          value={settings.cssMode}
          onChange={(e) => update('cssMode', e.currentTarget.value as Settings['cssMode'])}
        >
          <option value="computed">Computed styles</option>
          <option value="authored">Authored rules</option>
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

      <p class="hint">Shortcut: Alt+Shift+E (change it in your browser's extension shortcuts page).</p>

      <footer>
        Free extension by {BRAND.author}, {BRAND.company}. Help and feedback:{' '}
        <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
      </footer>
    </main>
  );
}

render(<Options />, document.getElementById('app')!);

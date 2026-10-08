import { storage } from '#imports';

export type OutputType = 'full' | 'html' | 'css';

export interface Settings {
  tailwindVersion: 'v4' | 'v3';
  cssMode: 'computed' | 'authored';
  theme: 'system' | 'light' | 'dark';
  /** Panel: what the main Copy button copies. */
  outputType: OutputType;
  includeChildren: boolean;
  settingsOpen: boolean;
  exportOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tailwindVersion: 'v4',
  cssMode: 'computed',
  theme: 'system',
  outputType: 'full',
  includeChildren: true,
  settingsOpen: true,
  exportOpen: false,
};

export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Stored settings merged over defaults, so fields added in later versions get a value. */
export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await settingsItem.setValue({ ...(await loadSettings()), ...patch });
}

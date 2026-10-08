import { storage } from '#imports';

export type OutputType = 'full' | 'html' | 'css';
export type ComponentFormat = 'html' | 'jsx';
/** computed: final browser values; authored: the site's own rules; inline: style attributes. */
export type StyleFormat = 'computed' | 'tailwind' | 'inline' | 'authored';

export interface Settings {
  tailwindVersion: 'v4' | 'v3';
  theme: 'system' | 'light' | 'dark';
  componentFormat: ComponentFormat;
  styleFormat: StyleFormat;
  /** Site rules only: keep @media blocks for all breakpoints. */
  mediaQueries: boolean;
  /** Panel: what the main Copy button copies. */
  outputType: OutputType;
  includeChildren: boolean;
  settingsOpen: boolean;
  exportOpen: boolean;
  infoOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tailwindVersion: 'v4',
  theme: 'system',
  componentFormat: 'html',
  styleFormat: 'computed',
  mediaQueries: true,
  outputType: 'full',
  includeChildren: true,
  settingsOpen: true,
  exportOpen: false,
  infoOpen: false,
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

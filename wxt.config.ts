import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    plugins: [preact()],
  }),
  hooks: {
    // The runtime-injected picker loads its stylesheet via runtime.getURL, so it must be
    // web-accessible on every page. Declaring matches on the content script would also add
    // an <all_urls> host permission, which we do not want, so we patch the entry here.
    'build:manifestGenerated': (_wxt, manifest) => {
      for (const entry of manifest.web_accessible_resources ?? []) {
        if (typeof entry === 'object' && entry.matches?.length === 0) {
          entry.matches = ['<all_urls>'];
        }
      }
    },
  },
  manifest: ({ browser }) => ({
    // Store listing name (Chrome and Edge read it from here); short_name for tight spaces.
    name: 'ElementLens: Copy HTML, CSS & Tailwind',
    short_name: 'ElementLens',
    description:
      'Pick any element and copy clean HTML, CSS, Tailwind or JSX. Free and private: no account, no tracking, nothing leaves your browser.',
    author: 'Dipen Modi (JupiterNexa)',
    homepage_url: 'https://dipenmodidesigns.github.io/ElementLens/',
    // Only the current tab, only after the user clicks. No host permissions.
    permissions: ['activeTab', 'scripting', 'storage'],
    // The panel's bundled fonts are loaded from the page context (FontFace), so they must be
    // web-accessible. This exposes only the two font files and grants no host access.
    // Chromium: a per-session dynamic URL, so sites cannot probe for the extension.
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2'],
        matches: ['<all_urls>'],
        ...(browser !== 'firefox' && { use_dynamic_url: true }),
      },
    ],
    // No default_popup: a toolbar click fires action.onClicked and toggles pick mode.
    action: {
      default_title: 'ElementLens: pick an element (Alt+Shift+E)',
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+E' },
        description: 'Toggle element pick mode',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'elementlens@jupiternexa.com',
          strict_min_version: '140.0',
          // Required by AMO for new add-ons: we collect no data at all.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});

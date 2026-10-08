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
    name: 'ElementLens',
    description:
      'Pick any element on a page and get its HTML, CSS, Tailwind, JSX and more. Free, private, no data leaves your browser.',
    author: 'Dipen Modi (JupiterNexa)',
    // Only the current tab, only after the user clicks. No host permissions.
    permissions: ['activeTab', 'scripting', 'storage'],
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

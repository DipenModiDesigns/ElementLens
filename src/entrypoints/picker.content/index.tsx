import { createShadowRootUi, defineContentScript } from '#imports';
import { render } from 'preact';
import { App } from './App';
import './style.css';
import './panel.css';

declare global {
  interface Window {
    __elementLens?: { close(): void };
  }
}

export default defineContentScript({
  // Injected on demand by the background script (activeTab), never declared in the manifest.
  registration: 'runtime',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // The isolated world keeps this global between injections, so a second click toggles off.
    if (window.__elementLens) {
      window.__elementLens.close();
      return;
    }

    const close = () => {
      ui.remove();
      window.__elementLens = undefined;
    };

    const ui = await createShadowRootUi(ctx, {
      name: 'element-lens',
      position: 'inline',
      anchor: 'html',
      append: 'last',
      // Keep key presses inside our panel from triggering page shortcuts.
      isolateEvents: true,
      onMount(container, _shadow, host) {
        render(<App host={host} container={container} onClose={close} />, container);
        return container;
      },
      onRemove(container) {
        if (container) render(null, container);
      },
    });

    window.__elementLens = { close };
    ui.mount();
  },
});

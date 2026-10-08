import { browser, defineBackground } from '#imports';
import { MAIN_WORLD_MESSAGE } from '@/shared/messages';

// Pages where browsers block extension scripts. Injection would fail anyway,
// checking up front lets us show a clear message instead of a silent error.
const RESTRICTED_URL =
  /^(chrome|edge|brave|opera|vivaldi|about|view-source|chrome-extension|moz-extension|safari-web-extension):|^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com\/addons)/;

const DEFAULT_TITLE = 'ElementLens: pick an element (Alt+Shift+E)';

async function flagUnavailable(tabId: number) {
  await browser.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
  await browser.action.setBadgeText({ tabId, text: '!' });
  await browser.action.setTitle({
    tabId,
    title: 'ElementLens cannot run on this page (protected by the browser).',
  });
  setTimeout(() => {
    browser.action.setBadgeText({ tabId, text: '' });
    browser.action.setTitle({ tabId, title: DEFAULT_TITLE });
  }, 4000);
}

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;
    if (tab.url && RESTRICTED_URL.test(tab.url)) {
      await flagUnavailable(tab.id);
      return;
    }
    try {
      // The content script toggles itself: a second injection closes it.
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/picker.js'],
      });
    } catch (err) {
      console.warn('[ElementLens] injection failed', err);
      await flagUnavailable(tab.id);
    }
  });

  // The picker asks for the page-context helper when the JS tab needs framework data.
  // activeTab is still granted for this tab, so no extra permission is involved.
  // sendResponse + `return true` works in every browser; returning a Promise does not everywhere.
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MAIN_WORLD_MESSAGE || sender.tab?.id === undefined) return;
    browser.scripting
      .executeScript({
        target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
        world: 'MAIN',
        files: ['/main-world.js'],
      })
      .then(() => sendResponse(true))
      .catch((err) => {
        console.warn('[ElementLens] page-context helper failed', err);
        sendResponse(false);
      });
    return true;
  });
});

import { APITestingCore } from '../src/background/core';
import { browser } from '../src/lib/browser';

// Static imports — WXT tree-shakes the unused branch at build time
import { ChromeAdapter } from '../src/background/chromeAdapter';
import { FirefoxAdapter } from '../src/background/firefoxAdapter';

export default defineBackground({
  main() {
    const adapter =
      import.meta.env.BROWSER === 'chrome'
        ? new ChromeAdapter()
        : new FirefoxAdapter();

    const core = new APITestingCore(adapter);

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void core.handleMessage(message, sender, sendResponse);
      return true;
    });
  },
});

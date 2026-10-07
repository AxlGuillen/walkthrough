import { chromium, type Browser } from 'playwright-core';

export interface Browsers {
  // Runs work in a browser of its own while it lasts; at most as many browsers as calls at once.
  use<T>(work: (browser: Browser) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Pages sharing one browser take their screenshots one after another, which kept 8 parallel
// renders within 2× of one on a 12-thread machine; a browser each lets them scale.
export function headlessBrowsers(): Browsers {
  const launched: Browser[] = [];
  const idle: Browser[] = [];
  return {
    async use(work) {
      const browser = idle.pop() ?? launched[launched.push(await chromium.launch({ channel: 'chrome', headless: true })) - 1]!;
      try {
        return await work(browser);
      } finally {
        idle.push(browser);
      }
    },
    async close() {
      await Promise.all(launched.map(browser => browser.close()));
    },
  };
}

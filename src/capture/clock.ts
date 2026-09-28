import type { Page } from 'playwright-core';
import { animationSync } from './runtime.ts';

export interface VirtualClock {
  syncAnimations(): Promise<void>;
  advance(ms: number): Promise<void>;
  settle(work: () => Promise<unknown>): Promise<void>;
}

const SETTLE_TIMEOUT = 10_000;

export async function installClock(page: Page): Promise<VirtualClock> {
  // Real wall time, not the default epoch: auth libraries reject tokens against a 1970 clock.
  await page.clock.install({ time: Date.now() });
  await page.addInitScript(animationSync);

  const freeze = async () => page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1);
  await freeze();

  return {
    async syncAnimations() {
      await page.evaluate(() => window.__walkthrough?.syncAnimations?.());
    },
    async advance(ms) {
      await page.clock.runFor(ms);
    },
    // Loading happens off the video clock: the app runs freely until it is ready.
    async settle(work) {
      await page.clock.resume();
      try {
        await work();
        await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT }).catch(() => {});
      } finally {
        await freeze();
      }
    },
  };
}

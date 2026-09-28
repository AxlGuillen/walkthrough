import type { Page } from 'playwright-core';
import { animationSync } from './runtime.ts';

export interface VirtualClock {
  syncAnimations(): Promise<void>;
  advance(ms: number): Promise<void>;
  settle(work: () => Promise<unknown>): Promise<void>;
}

const SETTLE_TIMEOUT = 10_000;
const FREEZE_MARGIN_MS = 25;
const FREEZE_ATTEMPTS = 5;

export async function installClock(page: Page): Promise<VirtualClock> {
  // Real wall time, not the default epoch: auth libraries reject tokens against a 1970 clock.
  await page.clock.install({ time: Date.now() });
  await page.addInitScript(animationSync);

  const freeze = () => freezeClock(page);
  await freeze();
  let settled = false;

  return {
    async syncAnimations() {
      await page.evaluate(afterSettle => window.__walkthrough?.syncAnimations?.(afterSettle), settled);
      settled = false;
    },
    async advance(ms) {
      await page.clock.runFor(ms);
    },
    // Loading happens off the video clock: the app runs freely until it is ready.
    async settle(work) {
      settled = true;
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

// pauseAt only moves forward, and the page clock keeps running between reading it and
// pausing it. Aim slightly ahead and retry if a busy machine still lands in the past.
export async function freezeClock(page: Pick<Page, 'clock' | 'evaluate'>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const now = await page.evaluate(() => Date.now());
    try {
      return await page.clock.pauseAt(now + FREEZE_MARGIN_MS);
    } catch (error) {
      if (attempt >= FREEZE_ATTEMPTS || !/to the past/.test((error as Error).message)) throw error;
    }
  }
}

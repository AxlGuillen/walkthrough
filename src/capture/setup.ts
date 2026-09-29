import type { Page } from 'playwright-core';
import type { Tour } from '../tour/schema.ts';
import { looksLikeLogin } from './session.ts';

const DISMISS_TIMEOUT = 2_000;

export class SessionExpiredError extends Error {
  override name = 'SessionExpiredError';
}

export async function installSetup(page: Page, tour: Tour): Promise<void> {
  const entries = Object.entries(tour.setup.storage);
  if (entries.length === 0) return;
  // Protocol and host, not origin: for file:// pages Node says "null" and Chrome "file://".
  const { protocol, host } = new URL(tour.url);
  await page.addInitScript(({ protocol, host, entries }) => {
    if (location.protocol !== protocol || location.host !== host) return;
    try {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    } catch { /* storage can be blocked; the tour then just shows the onboarding */ }
  }, { protocol, host, entries });
}

export async function dismissDialogs(page: Page, tour: Tour): Promise<void> {
  for (const selector of tour.setup.dismiss) {
    const target = page.locator(selector).first();
    if (await target.isVisible().catch(() => false)) await target.click({ timeout: DISMISS_TIMEOUT }).catch(() => {});
  }
}

// Stops a render on the spot: a video of the login page is never what anyone wanted.
export async function assertSignedIn(page: Page, tour: Tour, requested: URL): Promise<void> {
  const landed = new URL(page.url());
  const password = (await page.locator('input[type=password]').count()) > 0;
  if (looksLikeLogin(requested, landed, password)) {
    const session = tour.session ?? '<session>';
    throw new SessionExpiredError(`landed on a login page (${landed.pathname}); sign in again with: walkthrough login ${session} ${tour.url}`);
  }
}

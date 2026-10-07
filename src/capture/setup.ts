import type { Page } from 'playwright-core';
import type { Tour } from '../tour/schema.ts';
import { looksLikeLogin } from './session.ts';

const DISMISS_TIMEOUT = 2_000;
// Announcements often slide in a moment after the page settles.
const APPEAR_TIMEOUT = 1_500;

export class SessionExpiredError extends Error {
  override name = 'SessionExpiredError';
}

export interface SiteStorage {
  protocol: string;
  host: string;
  entries: [string, string][];
}

// What each site the tour visits gets in localStorage before its pages load. Protocol and host,
// not origin: for file:// pages Node says "null" and Chrome "file://".
export function storagePlan(tour: Pick<Tour, 'url' | 'setup'>): SiteStorage[] {
  const sites = [[tour.url, tour.setup.storage] as const, ...Object.entries(tour.setup.origins)];
  return sites.flatMap(([url, storage]) => {
    const entries = Object.entries(storage);
    const { protocol, host } = new URL(url);
    return entries.length ? [{ protocol, host, entries }] : [];
  });
}

export async function installSetup(page: Page, tour: Tour): Promise<void> {
  const sites = storagePlan(tour);
  if (sites.length === 0) return;
  await page.addInitScript(sites => {
    const site = sites.find(s => s.protocol === location.protocol && s.host === location.host);
    if (!site) return;
    try {
      for (const [key, value] of site.entries) localStorage.setItem(key, value);
    } catch { /* storage can be blocked; the tour then just shows the onboarding */ }
  }, sites);
}

export async function dismissDialogs(page: Page, tour: Tour): Promise<void> {
  await Promise.all(tour.setup.dismiss.map(async selector => {
    const target = page.locator(selector).first();
    const appeared = await target.waitFor({ state: 'visible', timeout: APPEAR_TIMEOUT }).then(() => true, () => false);
    if (!appeared) return;
    await target.click({ timeout: DISMISS_TIMEOUT }).catch(() => {});
    // Wait out the exit animation too, or it would play over the first frames of the video.
    await target.waitFor({ state: 'hidden', timeout: DISMISS_TIMEOUT }).catch(() => {});
  }));
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

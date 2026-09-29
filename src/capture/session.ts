import path from 'node:path';
import { chromium, type BrowserContext, type BrowserContextOptions } from 'playwright-core';
import type { DeviceProfile } from './devices.ts';

export function profileDir(root: string, session: string): string {
  return path.join(root, '.auth', session);
}

export interface ContextOptions {
  headless: boolean;
  session?: string;
  device?: DeviceProfile;
}

// A persistent profile instead of a storageState snapshot: Supabase rotates refresh
// tokens on use, so a snapshot goes stale after the first render.
export async function openContext(root: string, { headless, session, device }: ContextOptions): Promise<BrowserContext> {
  const options: BrowserContextOptions = { viewport: null };
  if (device) {
    Object.assign(options, {
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
    });
    if (device.userAgent) options.userAgent = device.userAgent;
  }

  if (session) {
    return chromium.launchPersistentContext(profileDir(root, session), { channel: 'chrome', headless, ...options });
  }
  const browser = await chromium.launch({ channel: 'chrome', headless });
  const context = await browser.newContext(options);
  context.on('close', () => void browser.close());
  return context;
}

export async function login(root: string, session: string, url: string): Promise<void> {
  const context = await openContext(root, { headless: false, session });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url);
  // On macOS, Chrome keeps running after its last window closes, so watch the pages instead.
  await new Promise<void>(resolve => {
    const check = () => { if (context.pages().length === 0) resolve(); };
    context.on('page', p => p.on('close', check));
    for (const p of context.pages()) p.on('close', check);
    context.on('close', () => resolve());
  });
  await context.close();
}

// A login page after a navigation almost always means the saved session expired.
export function looksLikeLogin(requested: URL, landed: URL, hasPasswordField: boolean): boolean {
  if (hasPasswordField) return true;
  return landed.pathname !== requested.pathname && /log-?in|sign-?in|auth/i.test(landed.pathname);
}

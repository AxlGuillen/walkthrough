import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';

export function profileDir(root: string, session: string): string {
  return path.join(root, '.auth', session);
}

// A persistent profile instead of a storageState snapshot: Supabase rotates refresh
// tokens on use, so a snapshot goes stale after the first render.
export async function openSession(
  root: string,
  session: string,
  options: { headless: boolean; viewport?: { width: number; height: number } },
): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDir(root, session), {
    channel: 'chrome',
    headless: options.headless,
    viewport: options.viewport ?? null,
  });
}

export async function login(root: string, session: string, url: string): Promise<void> {
  const context = await openSession(root, session, { headless: false });
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

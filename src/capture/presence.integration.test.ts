import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presence } from './actions.ts';

let browser: Awaited<ReturnType<typeof chromium.launch>>;
beforeAll(async () => { browser = await chromium.launch({ channel: 'chrome' }); });
afterAll(async () => { await browser.close(); });

describe('presence', () => {
  it('sees a marked element on a page too busy to answer at once, as on a loaded machine', async () => {
    const page = await browser.newPage();
    await page.setContent('<div id="card" style="margin:40px;width:200px;height:100px;background:#33c"></div>');
    // The page's main thread is stuck for 400 ms, longer than a short lookup limit would allow.
    void page.evaluate(() => { const until = Date.now() + 400; while (Date.now() < until) { /* busy */ } });
    expect(await presence(page, '#card')).toBe('shown');
    await page.close();
  }, 30_000);

  it('knows at once that an element is gone, without waiting for it', async () => {
    const page = await browser.newPage();
    await page.setContent('<p>nothing marked here</p>');
    const started = Date.now();
    expect(await presence(page, '#card')).toBe('gone');
    expect(Date.now() - started).toBeLessThan(1000);
    await page.close();
  }, 30_000);
});

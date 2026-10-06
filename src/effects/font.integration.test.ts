import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { effectsLayer } from '../capture/runtime.ts';
import { TEMPLATES_DIR } from '../overlays/render.ts';
import { MARKER_FAMILY, markerFont } from './font.ts';

let browser: Awaited<ReturnType<typeof chromium.launch>>;
beforeAll(async () => { browser = await chromium.launch({ channel: 'chrome' }); });
afterAll(async () => { await browser.close(); });

describe('hand lettering', () => {
  it('reaches labels inside an app whose CSP forbids fonts', async () => {
    const page = await browser.newPage();
    await page.route('http://app.test/**', route => route.fulfill({
      contentType: 'text/html', headers: { 'content-security-policy': "font-src 'none'" }, body: '<p>app</p>',
    }));
    await page.addInitScript(effectsLayer, await markerFont());
    await page.goto('http://app.test/');
    const loaded = await page.evaluate(async family => {
      await document.fonts.ready;
      return document.fonts.check(`700 22px "${family}"`) && [...document.fonts].some(face => face.family === family && face.status === 'loaded');
    }, MARKER_FAMILY);
    expect(loaded).toBe(true);
    await page.close();
  });

  it('loads the vendored fonts in the overlay templates', async () => {
    const page = await browser.newPage();
    // A file:// origin first: about:blank may not load file:// stylesheets.
    await page.goto(`${pathToFileURL(TEMPLATES_DIR).href}/base.css`);
    await page.setContent(`<link rel="stylesheet" href="${pathToFileURL(TEMPLATES_DIR).href}/base.css">`
      + '<p style="font-family: var(--marker)">Marcador</p><p style="font-family: var(--hand)">Nota</p>'
      + '<p style="font-family: \'Instrument Serif\'">Título</p>');
    const statuses = await page.evaluate(async () => {
      await document.fonts.ready;
      // The serif has an italic face too, which nothing here uses: only the faces in use load.
      return Object.fromEntries([...document.fonts].filter(face => face.style === 'normal').map(face => [face.family.replace(/"/g, ''), face.status]));
    });
    expect(statuses).toEqual({ 'Permanent Marker': 'loaded', Kalam: 'loaded', 'Instrument Serif': 'loaded' });
    await page.close();
  });
});

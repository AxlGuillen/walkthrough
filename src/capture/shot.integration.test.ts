import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentClip, hideCaret, shooter } from './shot.ts';

let browser: Awaited<ReturnType<typeof chromium.launch>>;
beforeAll(async () => { browser = await chromium.launch({ channel: 'chrome' }); });
afterAll(async () => { await browser.close(); });

// Decoded pixels, so two PNGs compressed differently compare by what they show.
const pixels = (png: Buffer) => createHash('md5')
  .update(execFileSync('ffmpeg', ['-v', 'error', '-i', '-', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { input: png, maxBuffer: 1e9 }))
  .digest('hex');
const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

// Solid fills, text and edges: Chrome dithers gradients, so two rasters of one can differ by a level
// whoever shoots them, and an exact comparison would test the rasterizer instead of the shot.
const PAGE = '<body style="margin:0;height:3000px;background:#c33">'
  + '<div style="position:absolute;top:240px;left:60px;width:300px;height:180px;background:#33c;border-radius:24px;border:3px solid #fff"></div>'
  + '<p style="position:absolute;top:300px;left:90px;margin:0;font:24px serif;color:#fff">Texto de prueba, desplazado</p>'
  + '<input value="campo" style="position:absolute;top:500px;left:60px;font:20px sans-serif"></body>';

describe('shooter', () => {
  it('gives the pixels of page.screenshot on a scrolled, dense page with a fractional clip and a focused field', async () => {
    const viewport = { width: 800, height: 450 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2.4 });
    const page = await context.newPage();
    await page.addInitScript(hideCaret);
    // A navigation, as in a capture: setContent rewrites the document and drops what init scripts added.
    await page.goto(`data:text/html,${encodeURIComponent(PAGE)}`);
    await page.focus('input');
    await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'instant' }));
    const camera = await shooter(page, { viewport, deviceScaleFactor: 2.4 });
    const clip = { x: 100.3, y: 50.7, width: 400.4, height: 225.2 };

    const ours = await camera.shot(clip);
    expect(size(ours)).toEqual([960, 540]);
    expect(pixels(ours)).toBe(pixels(await page.screenshot({ clip })));
    expect(pixels(await camera.shot())).toBe(pixels(await page.screenshot()));
    await context.close();
  }, 60_000);

  it('keeps a transparent background, alpha included, like omitBackground', async () => {
    const viewport = { width: 640, height: 360 };
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.setContent('<body style="margin:0"><div style="margin:80px;width:200px;height:120px;border-radius:30px;background:rgba(220,40,40,0.6)"></div></body>');
    const camera = await shooter(page, { viewport, deviceScaleFactor: 1, transparent: true });
    expect(pixels(await camera.shot())).toBe(pixels(await page.screenshot({ omitBackground: true })));
    await page.close();
  }, 60_000);
});

describe('documentClip', () => {
  it('moves the clip by the scroll and trims it to the viewport', () => {
    expect(documentClip({ x: -10, y: 20, width: 100, height: 500 }, { width: 800, height: 450 }, { pageX: 0, pageY: 300 }))
      .toEqual({ x: 0, y: 320, width: 90, height: 430 });
    expect(() => documentClip({ x: 900, y: 0, width: 10, height: 10 }, { width: 800, height: 450 }, { pageX: 0, pageY: 0 })).toThrow();
  });
});

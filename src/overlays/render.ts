import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { installClock } from '../capture/clock.ts';
import { startEncoder } from '../capture/encoder.ts';
import { frameCount } from '../capture/schedule.ts';
import type { Size } from '../timeline/camera.ts';
import type { TimedOverlay } from '../timeline/build.ts';

export function overlayFile(index: number): string {
  return path.join('overlays', `${String(index + 1).padStart(2, '0')}.mov`);
}

export function overlayUrl(tourDir: string, src: string, params: Record<string, string>): string {
  const url = pathToFileURL(path.resolve(tourDir, src));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

export interface OverlayRenderOptions {
  overlays: readonly TimedOverlay[];
  tourDir: string;
  outDir: string;
  output: Size;
  fps: number;
  onFrame?: (overlay: number, frame: number, total: number) => void;
}

// Each overlay gets its own clock starting at zero, so its entrance animations begin
// exactly when it appears in the video.
export async function renderOverlays({ overlays, tourDir, outDir, output, fps, onFrame }: OverlayRenderOptions): Promise<void> {
  await rm(path.join(outDir, 'overlays'), { recursive: true, force: true });
  if (overlays.length === 0) return;
  await mkdir(path.join(outDir, 'overlays'), { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [index, overlay] of overlays.entries()) {
      const source = path.resolve(tourDir, overlay.src);
      if (!existsSync(source)) throw new Error(`overlay not found: ${source}`);

      const context = await browser.newContext({ viewport: output, deviceScaleFactor: 1 });
      const encoder = startEncoder({ fps, output, file: path.join(outDir, overlayFile(index)), alpha: true });
      try {
        const page = await context.newPage();
        const clock = await installClock(page);
        // Loaded with the clock frozen, not through settle(): nothing may run before frame 0.
        await page.goto(overlayUrl(tourDir, overlay.src, overlay.params));
        await mediaReady(page);

        const total = frameCount(overlay.end - overlay.start, fps);
        for (let frame = 0; frame < total; frame++) {
          await clock.syncAnimations();
          await encoder.write(await page.screenshot({ omitBackground: true }));
          await clock.advance(1000 / fps);
          onFrame?.(index + 1, frame + 1, total);
        }
        await encoder.finish();
      } catch (error) {
        await encoder.finish().catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

// Event-based on purpose: page timers are frozen, so a setTimeout fallback would never fire.
async function mediaReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images].filter(image => !image.complete).map(image =>
      new Promise(resolve => { image.onload = image.onerror = resolve; }));
    const videos = [...document.querySelectorAll('video')].filter(video => video.readyState < 2).map(video =>
      new Promise(resolve => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', resolve, { once: true });
      }));
    await Promise.all([...images, ...videos]);
  });
}

import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { installClock } from '../capture/clock.ts';
import { startEncoder } from '../capture/encoder.ts';
import { frameCount } from '../capture/schedule.ts';
import { overlayParams } from '../flow/scene.ts';
import type { Size } from '../timeline/camera.ts';
import type { TimedOverlay } from '../timeline/build.ts';

export function overlayFile(index: number): string {
  return path.join('overlays', `${String(index + 1).padStart(2, '0')}.mov`);
}

export const TEMPLATES_DIR = path.resolve(import.meta.dirname, '../../templates/overlays');

// A tour's own file wins over a shared template of the same name, so a project can
// restyle any template without touching the others.
export function resolveOverlay(tourDir: string, src: string, templatesDir = TEMPLATES_DIR): string | null {
  for (const candidate of [path.resolve(tourDir, src), path.resolve(templatesDir, src)]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// Every overlay also learns the tour's accent and folder (`base`), so a shared template
// matches the tour's color and can load the tour's own images.
export function overlayUrl(file: string, tourDir: string, params: Record<string, string>, accent?: string): string {
  const url = pathToFileURL(file);
  url.searchParams.set('base', `${pathToFileURL(tourDir).href}/`);
  if (accent) url.searchParams.set('accent', accent);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

export interface OverlayRenderOptions {
  overlays: readonly TimedOverlay[];
  tourDir: string;
  outDir: string;
  canvas: Size;
  output: Size;
  fps: number;
  accent?: string;
  templatesDir?: string;
  onFrame?: (overlay: number, frame: number, total: number) => void;
}

// Each overlay gets its own clock starting at zero, so its entrance animations begin
// exactly when it appears in the video. It is laid out on the full canvas and scaled to
// the output, so a preview shows the same design, only smaller.
export async function renderOverlays({
  overlays, tourDir, outDir, canvas, output, fps, accent, templatesDir = TEMPLATES_DIR, onFrame,
}: OverlayRenderOptions): Promise<void> {
  await rm(path.join(outDir, 'overlays'), { recursive: true, force: true });
  if (overlays.length === 0) return;
  await mkdir(path.join(outDir, 'overlays'), { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [index, overlay] of overlays.entries()) {
      const source = resolveOverlay(tourDir, overlay.src, templatesDir);
      if (!source) throw new Error(`overlay not found: ${overlay.src} (looked in ${tourDir} and ${templatesDir})`);

      const context = await browser.newContext({ viewport: canvas, deviceScaleFactor: 1 });
      const encoder = startEncoder({ fps, output, file: path.join(outDir, overlayFile(index)), alpha: true });
      try {
        const page = await context.newPage();
        const clock = await installClock(page);
        // Loaded with the clock frozen, not through settle(): nothing may run before frame 0.
        await page.goto(overlayUrl(source, tourDir, overlayParams(overlay, canvas), accent));
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

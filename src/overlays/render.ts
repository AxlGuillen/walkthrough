import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { installClock } from '../capture/clock.ts';
import { startEncoder, type Encoder } from '../capture/encoder.ts';
import { pool } from '../cli/parallel.ts';
import { shooter } from '../capture/shot.ts';
import { frameCount } from '../capture/schedule.ts';
import { flowScene } from '../flow/scene.ts';
import { resourceFor } from '../resources/registry.ts';
import type { Size } from '../timeline/camera.ts';
import type { TimedOverlay } from '../timeline/build.ts';

declare global {
  interface Window {
    // Set by templates/overlays/params.js: places the template's paused animation at t seconds.
    __walkthroughSeek?(t: number): void;
    walkthrough?: { beats: Record<string, number>; data: unknown; theme: string; duration: number; beat(name: string, fallback?: number): number; still?(): boolean };
  }
}

export function overlayFile(index: number): string {
  return `overlays/${String(index + 1).padStart(2, '0')}.mov`;
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

export interface OverlayLook {
  accent?: string;
  theme?: string;
  lang?: string;
  texture?: string;
  emojiStyle?: string;
  typeface?: string;
  // From the tour's brand: its name, two colors ("#a,#b") and images as file URLs.
  brand?: string;
  colors?: string;
  brandLogo?: string;
  brandMark?: string;
  markShape?: string;
}

// Every overlay also learns the tour's look (accent, theme, language) and folder (`base`), so
// a shared template matches the tour and can load the tour's own images. Its own params win.
export function overlayUrl(file: string, tourDir: string, params: Record<string, string>, look: OverlayLook = {}): string {
  const url = pathToFileURL(file);
  url.searchParams.set('base', `${pathToFileURL(tourDir).href}/`);
  for (const [key, value] of Object.entries(look)) if (value) url.searchParams.set(key, value);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

// What a template reads besides its own params: how long it is on screen, its beats and data
// as JSON, and for a flow the scene Node laid out.
export function overlayParams(overlay: TimedOverlay, canvas: Size, lang = 'es'): Record<string, string> {
  const resource = resourceFor(overlay.src);
  return {
    duration: (overlay.end - overlay.start).toFixed(3),
    ...overlay.params,
    ...(Object.keys(overlay.beats).length ? { beats: JSON.stringify(overlay.beats) } : {}),
    ...(overlay.data === undefined ? {} : { data: JSON.stringify(overlay.data) }),
    ...(overlay.flow ? { scene: JSON.stringify(flowScene(overlay.flow, overlay.start, canvas)) } : {}),
    ...(resource && overlay.data !== undefined ? { scene: JSON.stringify(resource.scene(overlay.data, canvas, lang, overlay.beats, overlay.end - overlay.start)) } : {}),
  };
}

export interface OverlayRenderOptions {
  overlays: readonly TimedOverlay[];
  tourDir: string;
  outDir: string;
  canvas: Size;
  output: Size;
  fps: number;
  look?: OverlayLook;
  templatesDir?: string;
  // Overlays rendered at once, each in its own page.
  jobs?: number;
  // Stops between frames, when a render running alongside failed.
  signal?: AbortSignal;
  onFrame?: (overlay: number, frame: number, total: number) => void;
}

// Each overlay gets its own clock starting at zero, so its entrance animations begin
// exactly when it appears in the video. It is laid out on the full canvas and scaled to
// the output, so a preview shows the same design, only smaller. Up to `jobs` render at once,
// longest first so the last one to finish is a short one.
export async function renderOverlays({
  overlays, tourDir, outDir, canvas, output, fps, look = {}, templatesDir = TEMPLATES_DIR, jobs = 1, signal, onFrame,
}: OverlayRenderOptions): Promise<void> {
  await rm(path.join(outDir, 'overlays'), { recursive: true, force: true });
  if (overlays.length === 0) return;
  await mkdir(path.join(outDir, 'overlays'), { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const longestFirst = [...overlays.keys()].sort((a, b) => (overlays[b]!.end - overlays[b]!.start) - (overlays[a]!.end - overlays[a]!.start));
  try {
    await pool(longestFirst, jobs, async index => {
      const overlay = overlays[index]!;
      const source = resolveOverlay(tourDir, overlay.src, templatesDir);
      if (!source) throw new Error(`overlay not found: ${overlay.src} (looked in ${tourDir} and ${templatesDir})`);

      const context = await browser.newContext({ viewport: canvas, deviceScaleFactor: 1 });
      let encoder: Encoder | undefined;
      try {
        const page = await context.newPage();
        const clock = await installClock(page);
        // Loaded with the clock frozen, not through settle(): nothing may run before frame 0.
        await page.goto(overlayUrl(source, tourDir, overlayParams(overlay, canvas, look.lang), look));
        await mediaReady(page);
        const camera = await shooter(page, { viewport: canvas, deviceScaleFactor: 1, transparent: true });

        const total = frameCount(overlay.end - overlay.start, fps);
        const file = path.join(outDir, overlayFile(index));
        // A page where nothing moves (a watermark) is shot once; every frame would be this one.
        if (await page.evaluate(() => window.walkthrough?.still?.() ?? false)) {
          encoder = startEncoder({ fps, output, file, alpha: true, repeat: total });
          await clock.syncAnimations();
          await page.evaluate(() => window.__walkthroughSeek?.(0));
          await encoder.write(await camera.shot());
          await encoder.finish();
          onFrame?.(index + 1, total, total);
          return;
        }
        encoder = startEncoder({ fps, output, file, alpha: true });
        for (let frame = 0; frame < total; frame++) {
          signal?.throwIfAborted();
          await clock.syncAnimations();
          await page.evaluate(t => window.__walkthroughSeek?.(t), frame / fps);
          await encoder.write(await camera.shot());
          await clock.advance(1000 / fps);
          onFrame?.(index + 1, frame + 1, total);
        }
        await encoder.finish();
      } catch (error) {
        await encoder?.finish().catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    });
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

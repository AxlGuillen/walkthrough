import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { startEncoder } from '../capture/encoder.ts';
import { pool } from '../cli/parallel.ts';
import { shooter } from '../capture/shot.ts';
import { overlayUrl, TEMPLATES_DIR, type OverlayLook } from '../overlays/render.ts';
import type { Size } from '../timeline/camera.ts';
import { changeAt, changeLayers, poseAt, type Layer, type Pose, type StagePlan } from './plan.ts';

export function stageFile(index: number): string {
  return path.join('stage', `${String(index + 1).padStart(2, '0')}.mp4`);
}

export interface StageFrame {
  pose: Pose;
  // The capture's instant this frame shows: the middle of its frame, so a seek never lands a frame early.
  time: number;
  change?: { old: Layer; next: Layer; oldTime: number };
}

// The capture cuts to the new screen on the first frame at or after the change, so the old
// screen's last look is the frame before it.
export function stageFrame(plan: Pick<StagePlan, 'moves' | 'changes'>, frame: number, fps: number): StageFrame {
  const time = frame / fps;
  const at = changeAt(plan.changes, time);
  const base = { pose: poseAt(plan.moves, time), time: (frame + 0.5) / fps };
  if (!at) return base;
  const cut = Math.ceil(at.change.time * fps - 1e-6);
  return { ...base, change: { ...changeLayers(at.change.kind, at.progress), oldTime: (Math.max(0, cut - 1) + 0.5) / fps } };
}

// A span starts and ends on whole frames, so its clip lines up with the capture it replaces.
export function spanFrames({ start, end }: StagePlan['spans'][number], fps: number): { first: number; count: number } {
  const first = Math.floor(start * fps + 1e-6);
  return { first, count: Math.max(1, Math.ceil(end * fps - 1e-6) - first) };
}

export interface StageRenderOptions {
  plan: StagePlan;
  capture: string;
  tourDir: string;
  outDir: string;
  canvas: Size;
  output: Size;
  fps: number;
  draft?: boolean;
  look?: OverlayLook;
  // Spans rendered at once, each in its own browser.
  jobs?: number;
  // Stops between frames, when a render running alongside failed.
  signal?: AbortSignal;
  onFrame?: (span: number, frame: number, total: number) => void;
}

// Only the stretches off the flat: everywhere else the capture is already the picture.
// The capture plays inside the page, seeked to the middle of each frame it shows.
export async function renderStage({ plan, capture, tourDir, outDir, canvas, output, fps, draft = false, look = {}, jobs = 1, signal, onFrame }: StageRenderOptions): Promise<void> {
  await rm(path.join(outDir, 'stage'), { recursive: true, force: true });
  if (plan.spans.length === 0) return;
  await mkdir(path.join(outDir, 'stage'), { recursive: true });

  // Every frame is a pure function of the plan, so spans render apart, up to `jobs` at once.
  // Each in a fresh browser: one that already played the capture rasterizes the next span a
  // shade differently, which would make the video depend on how many jobs ran.
  await pool([...plan.spans.keys()], jobs, async index => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage({ viewport: canvas, deviceScaleFactor: 1 });
      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'stage.html'), tourDir, { src: pathToFileURL(capture).href }, look));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('video')].map(video => video.readyState >= 2 ? null
          : new Promise((resolve, reject) => {
            video.addEventListener('loadeddata', resolve, { once: true });
            video.addEventListener('error', () => reject(new Error('the stage could not load the capture')), { once: true });
          })));
      });
      const camera = await shooter(page, { viewport: canvas, deviceScaleFactor: 1 });
      const { first, count } = spanFrames(plan.spans[index]!, fps);
      const encoder = startEncoder({ fps, output, file: path.join(outDir, stageFile(index)), draft });
      try {
        for (let frame = 0; frame < count; frame++) {
          signal?.throwIfAborted();
          const { pose, time, change } = stageFrame(plan, first + frame, fps);
          await page.evaluate(([pose, time, change]) => window.__walkthroughStage!(pose, time, change), [pose, time, change] as const);
          await encoder.write(await camera.shot());
          onFrame?.(index + 1, frame + 1, count);
        }
        await encoder.finish();
      } catch (error) {
        await encoder.finish().catch(() => {});
        throw error;
      }
    } finally {
      await browser.close();
    }
  });
}

declare global {
  interface Window {
    __walkthroughStage?(pose: Pose, time: number, change?: StageFrame['change']): Promise<void>;
  }
}

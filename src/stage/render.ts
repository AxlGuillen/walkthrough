import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { startEncoder } from '../capture/encoder.ts';
import { overlayUrl, TEMPLATES_DIR, type OverlayLook } from '../overlays/render.ts';
import type { Size } from '../timeline/camera.ts';
import { poseAt, type StagePlan } from './plan.ts';

export function stageFile(index: number): string {
  return path.join('stage', `${String(index + 1).padStart(2, '0')}.mp4`);
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
  onFrame?: (span: number, frame: number, total: number) => void;
}

// Only the stretches off the flat: everywhere else the capture is already the picture.
// The capture plays inside the page, seeked to the middle of each frame it shows.
export async function renderStage({ plan, capture, tourDir, outDir, canvas, output, fps, draft = false, look = {}, onFrame }: StageRenderOptions): Promise<void> {
  await rm(path.join(outDir, 'stage'), { recursive: true, force: true });
  if (plan.spans.length === 0) return;
  await mkdir(path.join(outDir, 'stage'), { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: canvas, deviceScaleFactor: 1 });
    await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'stage.html'), tourDir, { src: pathToFileURL(capture).href }, look));
    await page.evaluate(async () => {
      await document.fonts.ready;
      const video = document.querySelector('video')!;
      if (video.readyState < 2) {
        await new Promise((resolve, reject) => {
          video.addEventListener('loadeddata', resolve, { once: true });
          video.addEventListener('error', () => reject(new Error('the stage could not load the capture')), { once: true });
        });
      }
    });

    for (const [index, span] of plan.spans.entries()) {
      const { first, count } = spanFrames(span, fps);
      const encoder = startEncoder({ fps, output, file: path.join(outDir, stageFile(index)), draft });
      try {
        for (let frame = 0; frame < count; frame++) {
          const time = (first + frame) / fps;
          await page.evaluate(([pose, at]) => window.__walkthroughStage!(pose, at), [poseAt(plan.moves, time), time + 0.5 / fps] as const);
          await encoder.write(await page.screenshot());
          onFrame?.(index + 1, frame + 1, count);
        }
        await encoder.finish();
      } catch (error) {
        await encoder.finish().catch(() => {});
        throw error;
      }
    }
  } finally {
    await browser.close();
  }
}

declare global {
  interface Window {
    __walkthroughStage?(pose: ReturnType<typeof poseAt>, time: number): Promise<void>;
  }
}

import type { Page } from 'playwright-core';
import type { Timeline, TimedAction } from '../timeline/build.ts';
import { cameraAt, fitRect, fullFrame, type CameraMove, type Rect } from '../timeline/camera.ts';
import type { Tour } from '../tour/schema.ts';
import { installClock, type VirtualClock } from './clock.ts';
import { deviceProfile, type DeviceProfile } from './devices.ts';
import { startEncoder } from './encoder.ts';
import { dueActions, frameCount } from './schedule.ts';
import { openContext } from './session.ts';

export const DEFAULT_FPS = 30;
const ZOOM_DURATION = 0.8;

export interface CaptureOptions {
  root: string;
  tour: Tour;
  timeline: Timeline;
  file: string;
  fps?: number;
  headless?: boolean;
  onFrame?: (frame: number, total: number) => void;
}

export async function captureTour({
  root, tour, timeline, file, fps = DEFAULT_FPS, headless = true, onFrame,
}: CaptureOptions): Promise<{ frames: number }> {
  const device = deviceProfile(tour.device);
  const context = await openContext(root, { headless, device, ...(tour.session ? { session: tour.session } : {}) });
  const encoder = startEncoder({ fps, output: device.output, file });
  const total = frameCount(timeline.duration, fps);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const clock = await installClock(page);
    const stage: Stage = { page, clock, tour, device, camera: [] };
    const home = fullFrame(device.viewport);

    let previous = -Infinity;
    for (let frame = 0; frame < total; frame++) {
      const time = frame / fps;
      for (const action of dueActions(timeline.actions, previous, time)) await perform(stage, action);
      previous = time;

      await clock.syncAnimations();
      await encoder.write(await page.screenshot({ clip: cameraAt(time, stage.camera, home) }));
      await clock.advance(1000 / fps);
      onFrame?.(frame + 1, total);
    }
    await encoder.finish();
  } catch (error) {
    await encoder.finish().catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
  return { frames: total };
}

interface Stage {
  page: Page;
  clock: VirtualClock;
  tour: Tour;
  device: DeviceProfile;
  camera: CameraMove[];
}

async function perform({ page, clock, tour, device, camera }: Stage, { time, action }: TimedAction): Promise<void> {
  switch (action.kind) {
    case 'goto':
      return clock.settle(() => page.goto(new URL(action.url, tour.url).href));
    case 'click':
      return page.locator(action.on).first().click();
    case 'hover':
      return page.locator(action.on).first().hover();
    case 'type':
      return page.locator(action.into).first().fill(action.text);
    case 'zoom': {
      const rect = action.to === 'out' ? fullFrame(device.viewport) : await targetRect(page, action.to, device, action.padding);
      camera.push({ time, duration: action.duration ?? ZOOM_DURATION, rect });
      return;
    }
    case 'highlight':
      throw new Error('highlight is not supported yet');
  }
}

async function targetRect(page: Page, selector: string, device: DeviceProfile, padding?: number): Promise<Rect> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`zoom target "${selector}" is not visible`);
  return fitRect(box, device.viewport, padding === undefined ? {} : { padding });
}

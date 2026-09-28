import type { Locator, Page } from 'playwright-core';
import { cursorPosition, emptyPlan, sceneAt, TIMING, type EffectsPlan } from '../effects/scene.ts';
import type { Point } from '../effects/sketch.ts';
import { renderScene } from '../effects/svg.ts';
import type { Timeline, TimedAction } from '../timeline/build.ts';
import { cameraAt, fitRect, fullFrame, type CameraMove, type Rect } from '../timeline/camera.ts';
import type { Tour } from '../tour/schema.ts';
import { installClock, type VirtualClock } from './clock.ts';
import { deviceProfile, type DeviceProfile } from './devices.ts';
import { startEncoder } from './encoder.ts';
import { effectsLayer } from './runtime.ts';
import { charsDue, dueActions, frameCount, pointerSchedule, pointerTarget, type PointerStep } from './schedule.ts';
import { openContext } from './session.ts';

export const DEFAULT_FPS = 30;
const ZOOM_DURATION = 0.8;
const EPSILON = 1e-9;

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
    await page.addInitScript(effectsLayer);

    const home = fullFrame(device.viewport);
    const stage: Stage = {
      page, clock, tour, device, time: 0, camera: [], typing: null,
      effects: emptyPlan(device.isMobile ? 'touch' : 'mouse', { x: home.width / 2, y: home.height / 2 }),
      pending: device.isMobile ? [] : pointerSchedule(timeline.actions, TIMING.travel),
    };

    let previous = -Infinity;
    for (let frame = 0; frame < total; frame++) {
      stage.time = frame / fps;
      await prepareCursor(stage);
      for (const action of dueActions(timeline.actions, previous, stage.time)) {
        await perform(stage, action, timeline.actions.indexOf(action));
      }
      await continueTyping(stage);
      previous = stage.time;

      await clock.syncAnimations();
      const markup = renderScene(sceneAt(stage.time, stage.effects), tour.accent);
      await page.evaluate(markup => window.__walkthrough?.draw?.(markup), markup);
      await encoder.write(await page.screenshot({ clip: cameraAt(stage.time, stage.camera, home) }));
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
  time: number;
  camera: CameraMove[];
  effects: EffectsPlan;
  pending: PointerStep[];
  typing: { text: string; start: number; typed: number } | null;
}

// Starts each cursor move as soon as its target exists. A target that only appears
// at the last moment gets a zero-length move instead of blocking the action.
async function prepareCursor({ page, time, effects, pending }: Stage): Promise<void> {
  while (pending[0] && pending[0].moveStart <= time + EPSILON) {
    const { action } = pending[0];
    const aim = await aimAt(page.locator(pointerTarget(action)!).first());
    if (!aim && time < action.time - EPSILON) return;
    pending.shift();
    if (aim) effects.moves.push({ start: time, end: Math.max(action.time, time), from: cursorPosition(time, effects), to: aim.point });
  }
}

async function perform(stage: Stage, { time, action }: TimedAction, seed: number): Promise<void> {
  const { page, clock, tour, device, camera, effects } = stage;
  switch (action.kind) {
    case 'goto':
      return clock.settle(() => page.goto(new URL(action.url, tour.url).href));
    case 'click':
      return clickWithMark(stage, page.locator(action.on).first(), seed);
    case 'hover': {
      const target = page.locator(action.on).first();
      const aim = await aimAt(target);
      return target.hover(aim ? { position: aim.position } : {});
    }
    case 'type': {
      const field = page.locator(action.into).first();
      await field.fill('');
      await clickWithMark(stage, field, seed);
      stage.typing = { text: action.text, start: stage.time, typed: 0 };
      return;
    }
    case 'zoom': {
      const rect = action.to === 'out' ? fullFrame(device.viewport) : await zoomRect(page, action.to, device, action.padding);
      camera.push({ time, duration: action.duration ?? ZOOM_DURATION, rect });
      return;
    }
    case 'highlight': {
      const box = await page.locator(action.on).first().boundingBox();
      if (!box) throw new Error(`highlight target "${action.on}" is not visible`);
      effects.rings.push({ time: stage.time, rect: box, hold: action.duration ?? TIMING.ringHold, seed });
      return;
    }
  }
}

// The mark is placed before clicking: the click may navigate away from the target.
async function clickWithMark({ time, effects }: Stage, target: Locator, seed: number): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const aim = await aimAt(target);
  await target.click(aim ? { position: aim.position } : {});
  if (aim) effects.clicks.push({ time, at: aim.point, seed });
}

async function continueTyping(stage: Stage): Promise<void> {
  const { typing, page, time } = stage;
  if (!typing) return;
  const due = charsDue(typing.text.length, typing.start, time);
  if (due > typing.typed) {
    await page.keyboard.type(typing.text.slice(typing.typed, due));
    typing.typed = due;
  }
  if (typing.typed === typing.text.length) stage.typing = null;
}

// Aims at the middle of the element's text when it has some: a full-width row's center
// can sit far from anything the viewer is reading. Playwright acts on the same point.
async function aimAt(target: Locator): Promise<{ point: Point; position: Point } | null> {
  if ((await target.count()) === 0) return null;
  return target.evaluate(element => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const left = Math.max(box.left, text.left);
    const right = Math.min(box.right, text.right);
    const top = Math.max(box.top, text.top);
    const bottom = Math.min(box.bottom, text.bottom);
    const useText = text.width > 0 && text.height > 0 && right > left && bottom > top;
    const point = useText
      ? { x: (left + right) / 2, y: (top + bottom) / 2 }
      : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    return { point, position: { x: point.x - box.left, y: point.y - box.top } };
  }).catch(() => null);
}

async function zoomRect(page: Page, selector: string, device: DeviceProfile, padding?: number): Promise<Rect> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`zoom target "${selector}" is not visible`);
  return fitRect(box, device.viewport, padding === undefined ? {} : { padding });
}

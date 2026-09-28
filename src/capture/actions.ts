import type { Locator } from 'playwright-core';
import { TIMING } from '../effects/scene.ts';
import type { TimedAction } from '../timeline/build.ts';
import { fullFrame } from '../timeline/camera.ts';
import { charsDue } from './schedule.ts';
import type { Stage } from './stage.ts';
import { aimAt, visibleBox, zoomRect } from './targets.ts';

const ZOOM_DURATION = 0.8;

export async function perform(stage: Stage, { time, action }: TimedAction, seed: number): Promise<void> {
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
      const box = await visibleBox(page.locator(action.on).first(), `highlight target "${action.on}"`);
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

export async function continueTyping(stage: Stage): Promise<void> {
  const { typing, page, time } = stage;
  if (!typing) return;
  const due = charsDue(typing.text.length, typing.start, time);
  if (due > typing.typed) {
    await page.keyboard.type(typing.text.slice(typing.typed, due));
    typing.typed = due;
  }
  if (typing.typed === typing.text.length) stage.typing = null;
}

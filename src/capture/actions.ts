import { clickVisible, labelVisible, ringVisible, TIMING } from '../effects/scene.ts';
import type { TimedAction } from '../timeline/build.ts';
import { fullFrame } from '../timeline/camera.ts';
import { charsDue } from './schedule.ts';
import type { Stage } from './stage.ts';
import { planScroll, queueScroll, scrollDuration, type ScrollMode } from './scroll.ts';
import { aimAt, visibleBox, zoomRect } from './targets.ts';

const ZOOM_DURATION = 0.8;

export async function perform(stage: Stage, { time, action }: TimedAction, seed: number): Promise<void> {
  const { page, clock, tour, device, camera, effects, log } = stage;
  switch (action.kind) {
    case 'goto':
      // The opening load is the start of the video, not a change of screen.
      if (stage.time > 0) log.push({ kind: 'navigate', time: stage.time });
      return clock.settle(() => page.goto(new URL(action.url, tour.url).href));
    case 'click': {
      await clickWithMark(stage, action.on, seed);
      if (action.wait) {
        log.push({ kind: 'navigate', time: stage.time });
        await waitFor(stage, action.wait);
      }
      return;
    }
    case 'wait':
      return waitFor(stage, action.until);
    case 'scroll': {
      const edge = action.to === 'top' || action.to === 'bottom';
      const mode: ScrollMode = edge ? (action.to as ScrollMode) : 'center';
      const planned = await planScroll(page, edge ? null : action.to, mode, action.within);
      const duration = action.duration ?? scrollDuration(planned.plans);
      for (const plan of planned.plans) queueScroll(stage.scrolls, plan, stage.time, duration);
      if (planned.plans.length) log.push({ kind: 'scroll', time: stage.time, duration });
      return;
    }
    case 'hover': {
      const target = page.locator(action.on).first();
      const aim = await aimAt(target);
      return target.hover(aim ? { position: aim.position } : {});
    }
    case 'type': {
      await page.locator(action.into).first().fill('');
      await clickWithMark(stage, action.into, seed);
      stage.typing = { text: action.text, start: stage.time, typed: 0 };
      log.push({ kind: 'type', time: stage.time, chars: action.text.length });
      return;
    }
    case 'zoom': {
      const fit = {
        ...(action.padding === undefined ? {} : { padding: action.padding }),
        ...(action.scale === undefined ? {} : { scale: action.scale }),
      };
      const rect = action.to === 'out' ? fullFrame(device.viewport) : await zoomRect(page, action.to, device, fit);
      camera.push({ time, duration: action.duration ?? ZOOM_DURATION, rect, follow: action.follow ?? false });
      log.push({ kind: 'zoom', time, direction: action.to === 'out' ? 'out' : 'in' });
      return;
    }
    case 'highlight': {
      const box = await visibleBox(page.locator(action.on).first(), `highlight target "${action.on}"`);
      effects.rings.push({ time: stage.time, rect: box, hold: action.duration ?? TIMING.ringHold, seed, track: action.on });
      log.push({ kind: 'ring', time: stage.time });
      return;
    }
    case 'label': {
      const box = await visibleBox(page.locator(action.on).first(), `label target "${action.on}"`);
      effects.labels.push({
        time: stage.time, rect: box, text: action.text, hold: action.duration ?? TIMING.labelHold, seed, track: action.on,
        ...(action.side ? { side: action.side } : {}),
      });
      log.push({ kind: 'label', time: stage.time });
      return;
    }
  }
}

// The mark is placed before clicking: the click may navigate away from the target.
async function clickWithMark({ page, time, effects, log }: Stage, selector: string, seed: number): Promise<void> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const aim = await aimAt(target);
  await target.click(aim ? { position: aim.position } : {});
  if (aim) effects.clicks.push({ time, at: aim.point, seed, track: { selector, offset: aim.position } });
  log.push({ kind: 'click', time });
}

const WAIT_TIMEOUT = 15_000;

async function waitFor({ page, clock }: Stage, selector: string): Promise<void> {
  await clock.settle(() => page.locator(selector).first().waitFor({ state: 'visible', timeout: WAIT_TIMEOUT }));
}

// Keeps rings and click marks on their element while the page scrolls under them.
export async function retrackMarks({ page, time, effects }: Stage): Promise<void> {
  for (const ring of effects.rings) {
    if (!ring.track || !ringVisible(time, ring)) continue;
    const box = await page.locator(ring.track).first().boundingBox().catch(() => null);
    if (box) ring.rect = box;
  }
  for (const label of effects.labels) {
    if (!label.track || !labelVisible(time, label)) continue;
    const box = await page.locator(label.track).first().boundingBox().catch(() => null);
    if (box) label.rect = box;
  }
  for (const click of effects.clicks) {
    if (!click.track || !clickVisible(time, click)) continue;
    const box = await page.locator(click.track.selector).first().boundingBox().catch(() => null);
    if (box) click.at = { x: box.x + click.track.offset.x, y: box.y + click.track.offset.y };
  }
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

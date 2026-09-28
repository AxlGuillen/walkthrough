import { bendFor, cursorPosition, TIMING, travelTime } from '../effects/scene.ts';
import { planScroll, scrollDuration } from './scroll.ts';
import type { Stage } from './stage.ts';
import { aimAt } from './targets.ts';

const EPSILON = 1e-9;
const MIN_SCROLL = 0.2;

// Gets each selector action ready ahead of time: scrolls its target into view (centered for
// a zoom) and sends the cursor to where the target will be once the scroll is over, so the
// cursor lands exactly when the action runs. A target that only appears at the last moment
// gets less time instead of blocking the action.
export async function prepareTargets(stage: Stage): Promise<void> {
  const { page, time, effects, pending, scrolls, log } = stage;
  while (pending[0] && pending[0].prepAt <= time + EPSILON) {
    const step = pending[0];
    const target = page.locator(step.target).first();
    const aim = await aimAt(target);
    if (!aim && time < step.action.time - EPSILON) return;
    pending.shift();
    if (!aim) continue;

    let shift = { x: 0, y: 0 };
    let ready = time;
    const planned = await planScroll(page, step.target, step.center ? 'center' : 'reveal').catch(() => null);
    if (planned && planned.plans.length > 0) {
      const room = step.action.time - time - (step.pointer ? TIMING.travelMin : 0);
      const duration = Math.max(MIN_SCROLL, Math.min(scrollDuration(planned.plans), room));
      for (const plan of planned.plans) scrolls.push({ ...plan, start: time, duration });
      log.push({ kind: 'scroll', time, duration });
      shift = planned.shift;
      ready = time + duration;
    }

    if (step.pointer && effects.pointer === 'mouse') {
      const to = { x: aim.point.x - shift.x, y: aim.point.y - shift.y };
      const from = cursorPosition(time, effects);
      const start = Math.max(ready, step.action.time - travelTime(from, to));
      effects.moves.push({ start, end: Math.max(step.action.time, start), from, to, bend: bendFor(Math.round(step.action.time * 1000)) });
    }
  }
}

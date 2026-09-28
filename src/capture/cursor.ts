import { bendFor, cursorPosition, travelTime } from '../effects/scene.ts';
import { pointerTarget } from './schedule.ts';
import type { Stage } from './stage.ts';
import { aimAt } from './targets.ts';

const EPSILON = 1e-9;

// Looks for each target as early as the longest trip needs, then starts the move just in
// time for its distance, so the cursor lands exactly when the action runs. A target that
// only appears at the last moment gets a shorter trip instead of blocking the action.
export async function prepareCursor({ page, time, effects, pending }: Stage): Promise<void> {
  while (pending[0] && pending[0].moveStart <= time + EPSILON) {
    const { action } = pending[0];
    const aim = await aimAt(page.locator(pointerTarget(action)!).first());
    if (!aim && time < action.time - EPSILON) return;
    pending.shift();
    if (!aim) continue;
    const from = cursorPosition(time, effects);
    const start = Math.max(time, action.time - travelTime(from, aim.point));
    effects.moves.push({ start, end: Math.max(action.time, start), from, to: aim.point, bend: bendFor(Math.round(action.time * 1000)) });
  }
}

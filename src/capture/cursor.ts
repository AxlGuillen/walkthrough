import { cursorPosition } from '../effects/scene.ts';
import { pointerTarget } from './schedule.ts';
import type { Stage } from './stage.ts';
import { aimAt } from './targets.ts';

const EPSILON = 1e-9;

// Starts each cursor move as soon as its target exists. A target that only appears
// at the last moment gets a zero-length move instead of blocking the action.
export async function prepareCursor({ page, time, effects, pending }: Stage): Promise<void> {
  while (pending[0] && pending[0].moveStart <= time + EPSILON) {
    const { action } = pending[0];
    const aim = await aimAt(page.locator(pointerTarget(action)!).first());
    if (!aim && time < action.time - EPSILON) return;
    pending.shift();
    if (aim) effects.moves.push({ start: time, end: Math.max(action.time, time), from: cursorPosition(time, effects), to: aim.point });
  }
}

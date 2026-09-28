import type { TimedAction } from '../timeline/build.ts';

export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(duration * fps - 1e-9));
}

// An action runs right before the first frame at or after its time.
export function dueActions(actions: readonly TimedAction[], previous: number, current: number): TimedAction[] {
  return actions.filter(({ time }) => time > previous && time <= current + 1e-9);
}

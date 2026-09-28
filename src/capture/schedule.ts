import type { TimedAction } from '../timeline/build.ts';

export const TYPING_RATE = 14;

export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(duration * fps - 1e-9));
}

// An action runs right before the first frame at or after its time.
export function dueActions(actions: readonly TimedAction[], previous: number, current: number): TimedAction[] {
  return actions.filter(({ time }) => time > previous && time <= current + 1e-9);
}

export interface PointerStep {
  action: TimedAction;
  moveStart: number;
}

// The cursor leaves early so it lands on the target exactly when the action runs, but
// never before the previous pointer action has happened.
export function pointerSchedule(actions: readonly TimedAction[], travel: number): PointerStep[] {
  let previous = 0;
  return actions.flatMap(action => {
    if (!pointerTarget(action)) return [];
    const moveStart = Math.max(action.time - travel, previous);
    previous = action.time;
    return [{ action, moveStart }];
  });
}

export function pointerTarget({ action }: TimedAction): string | undefined {
  switch (action.kind) {
    case 'click':
    case 'hover':
      return action.on;
    case 'type':
      return action.into;
    default:
      return undefined;
  }
}

export function charsDue(length: number, start: number, time: number, rate = TYPING_RATE): number {
  return Math.min(length, Math.max(0, Math.floor((time - start) * rate + 1e-9) + 1));
}

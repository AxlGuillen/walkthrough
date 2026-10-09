import type { TimedAction } from '../timeline/build.ts';

export const TYPING_RATE = 14;

// How long a change of screen dissolves from the old page into the new one.
export const TRANSITION = 0.5;
// Seconds a zoom takes unless the tour says otherwise.
export const ZOOM_DURATION = 0.8;

export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(duration * fps - 1e-9));
}

// An action runs right before the first frame at or after its time.
export function dueActions(actions: readonly TimedAction[], previous: number, current: number): TimedAction[] {
  return actions.filter(({ time }) => time > previous && time <= current + 1e-9);
}

// Long enough to scroll a target into view and then move the cursor to it.
export const PREP_LEAD = 1.6;

export interface PrepStep {
  action: TimedAction;
  prepAt: number;
  target: string;
  pointer: boolean;
  center: boolean;
}

// A scroll without its own duration takes about this long; the capture also waits for the
// real end of any scroll before preparing the next target (prep.ts).
const SCROLL_ESTIMATE = 1.4;

// Each selector action is prepared ahead of time (scroll it into view, send the cursor),
// but never before the previous action ran, or a scroll finished: either may change what
// is on screen.
export function prepSchedule(actions: readonly TimedAction[], lead = PREP_LEAD): PrepStep[] {
  let previous = 0;
  return actions.flatMap(timed => {
    const target = targetOf(timed);
    const step = target ? [{
      action: timed, target, prepAt: Math.min(timed.time, Math.max(timed.time - lead, previous)),
      pointer: pointerTarget(timed) !== undefined, center: timed.action.kind === 'zoom',
    }] : [];
    const busyUntil = timed.action.kind === 'scroll' ? timed.time + (timed.action.duration ?? SCROLL_ESTIMATE) : timed.time;
    previous = Math.max(previous, busyUntil);
    return step;
  });
}

export function targetOf(timed: TimedAction): string | undefined {
  const { action } = timed;
  if (action.kind === 'highlight' || action.kind === 'label') return action.on;
  if (action.kind === 'zoom') return action.to === 'out' ? undefined : action.to;
  return pointerTarget(timed);
}

export function pointerTarget({ action }: TimedAction): string | undefined {
  switch (action.kind) {
    case 'click':
    case 'upload':
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

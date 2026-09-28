import { describe, expect, it } from 'vitest';
import type { TimedAction } from '../timeline/build.ts';
import { charsDue, dueActions, frameCount, pointerSchedule } from './schedule.ts';

const at = (time: number): TimedAction => ({ time, segment: 0, action: { kind: 'click', on: '.a', at: undefined } });
const zoomAt = (time: number): TimedAction => ({
  time, segment: 0, action: { kind: 'zoom', to: 'out', padding: undefined, duration: undefined, at: undefined },
});

describe('frameCount', () => {
  it('covers the whole duration', () => {
    expect(frameCount(1, 30)).toBe(30);
    expect(frameCount(1.01, 30)).toBe(31);
    expect(frameCount(20.11, 30)).toBe(604);
  });

  it('is not thrown off by float error on exact multiples', () => {
    expect(frameCount(0.1 * 3, 10)).toBe(3);
  });

  it('always yields at least one frame', () => {
    expect(frameCount(0, 30)).toBe(1);
  });
});

describe('dueActions', () => {
  const actions = [at(0), at(0.5), at(0.5), at(1)];

  it('runs time-zero actions before the first frame', () => {
    expect(dueActions(actions, -Infinity, 0)).toHaveLength(1);
  });

  it('runs each action exactly once, on the first frame at or after its time', () => {
    const fps = 30;
    const runs: number[] = [];
    let previous = -Infinity;
    for (let frame = 0; frame < 31; frame++) {
      const time = frame / fps;
      for (const action of dueActions(actions, previous, time)) runs.push(frame);
      previous = time;
    }
    expect(runs).toEqual([0, 15, 15, 30]);
  });
});

describe('pointerSchedule', () => {
  it('leaves early enough to land on the target at the action time', () => {
    expect(pointerSchedule([at(2)], 0.7).map(s => s.moveStart)).toEqual([1.3]);
  });

  it('never leaves before the previous pointer action or the start', () => {
    expect(pointerSchedule([at(0.3), at(0.6)], 0.7).map(s => s.moveStart)).toEqual([0, 0.3]);
  });

  it('ignores actions without a pointer target', () => {
    expect(pointerSchedule([zoomAt(1), at(2)], 0.7).map(s => s.action.time)).toEqual([2]);
  });
});

describe('charsDue', () => {
  it('types the first character immediately and then at a steady rate', () => {
    expect(charsDue(5, 1, 0.9, 10)).toBe(0);
    expect(charsDue(5, 1, 1, 10)).toBe(1);
    expect(charsDue(5, 1, 1.25, 10)).toBe(3);
    expect(charsDue(5, 1, 9, 10)).toBe(5);
  });
});

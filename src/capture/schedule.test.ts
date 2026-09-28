import { describe, expect, it } from 'vitest';
import type { TimedAction } from '../timeline/build.ts';
import { dueActions, frameCount } from './schedule.ts';

const at = (time: number): TimedAction => ({ time, segment: 0, action: { kind: 'click', on: '.a' } });

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

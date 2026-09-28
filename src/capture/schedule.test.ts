import { describe, expect, it } from 'vitest';
import type { TimedAction } from '../timeline/build.ts';
import { charsDue, dueActions, frameCount, prepSchedule } from './schedule.ts';

const at = (time: number): TimedAction => ({ time, segment: 0, action: { kind: 'click', on: '.a', wait: undefined, at: undefined } });
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

describe('prepSchedule', () => {
  const highlight = (time: number): TimedAction => ({ time, segment: 0, action: { kind: 'highlight', on: '.h', duration: undefined, at: undefined } });
  const goto = (time: number): TimedAction => ({ time, segment: 0, action: { kind: 'goto', url: '/', at: undefined } });

  it('prepares ahead of the action by the lead', () => {
    expect(prepSchedule([at(3)], 1.6).map(s => s.prepAt)).toEqual([1.4]);
  });

  it('never prepares before the previous action of any kind, which may change the screen', () => {
    expect(prepSchedule([goto(1), at(1.5)], 1.6).map(s => s.prepAt)).toEqual([1]);
    expect(prepSchedule([at(0.3), at(0.6)], 1.6).map(s => s.prepAt)).toEqual([0, 0.3]);
  });

  it('waits for a scroll to finish, and never prepares after the action itself', () => {
    const scroll = (time: number, duration?: number): TimedAction => ({
      time, segment: 0, action: { kind: 'scroll', to: '.x', within: undefined, duration, at: undefined },
    });
    expect(prepSchedule([scroll(1, 2), highlight(2.5)], 1.6).map(s => s.prepAt)).toEqual([2.5]);
    expect(prepSchedule([scroll(1), highlight(3)], 1.6).map(s => s.prepAt)).toEqual([1.8]);
  });

  it('covers every selector action, marking which move the cursor and which want centering', () => {
    const steps = prepSchedule([zoomAt(1), highlight(2), at(3), { ...zoomAt(4), action: { ...zoomAt(4).action, to: '.card' } as TimedAction['action'] }]);
    expect(steps.map(s => [s.target, s.pointer, s.center])).toEqual([['.h', false, false], ['.a', true, false], ['.card', false, true]]);
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

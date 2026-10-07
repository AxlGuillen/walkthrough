import { describe, expect, it } from 'vitest';
import type { TimedOverlay } from '../timeline/build.ts';
import { auditTiming, formatTiming } from './timing.ts';

const flow = (start: number, mode: 'full' | 'card' = 'full'): TimedOverlay => ({
  src: 'flow.html', params: {}, start, end: start + 5, fade: 0.3, segment: 0, beats: {},
  flow: { shape: 'linear', mode, steps: [{ text: 'a', time: start + 1 }, { text: 'b', time: start + 2 }] },
});

describe('auditTiming', () => {
  it('ignores what the app does under an overlay that hides it', () => {
    const quick = [3, 3.4, 3.8].map(time => ({ kind: 'click' as const, time }));
    expect(auditTiming(quick, { overlays: [flow(2)] })).toEqual([]);
    expect(auditTiming(quick, { overlays: [flow(2, 'card')] })).toHaveLength(2);
  });

  it('flags scrolls too fast to follow, not paced ones', () => {
    const notes = auditTiming([
      { kind: 'scroll', time: 1, duration: 1, distance: 2700 },
      { kind: 'scroll', time: 5, duration: 2, distance: 2000 },
      { kind: 'scroll', time: 9, duration: 0.5 },
    ], { overlays: [] });
    expect(notes.map(n => n.time)).toEqual([1]);
    expect(notes[0]!.note).toMatch(/2700px/);
  });

  it('flags a mark that lands while the page moves or dissolves, but not once it settled', () => {
    const notes = auditTiming([
      { kind: 'scroll', time: 1, duration: 1, distance: 800 },
      { kind: 'ring', time: 2.1 },
      { kind: 'label', time: 2.5 },
      { kind: 'navigate', time: 4 },
      { kind: 'ring', time: 4.2 },
    ], { overlays: [] });
    expect(notes.map(n => [n.time, n.note.split(' ').slice(0, 4).join(' ')])).toEqual([
      [2.1, 'ring lands while the'],
      [4.2, 'ring lands during the'],
    ]);
  });

  it('expects no dissolve after a cut', () => {
    const events = [{ kind: 'navigate' as const, time: 4 }, { kind: 'ring' as const, time: 4.1 }];
    const goto = { time: 4, segment: 0, action: { kind: 'goto' as const, url: '/b', at: undefined }, transition: 'cut' as const };
    expect(auditTiming(events, { overlays: [], actions: [goto] })).toEqual([]);
  });

  it('gives a change the stage draws its longer length', () => {
    const events = [{ kind: 'navigate' as const, time: 4 }, { kind: 'ring' as const, time: 4.6 }];
    const goto = { time: 4, segment: 0, action: { kind: 'goto' as const, url: '/b', at: undefined } };
    expect(auditTiming(events, { overlays: [], actions: [goto] })).toEqual([]);
    expect(auditTiming(events, { overlays: [], actions: [{ ...goto, transition: 'push' }] })).toHaveLength(1);
  });

  it('flags a mark a full-screen flow covers before it can be read, not one under a card', () => {
    const notes = auditTiming([{ kind: 'ring', time: 10 }, { kind: 'ring', time: 20 }], { overlays: [flow(10.8), flow(20.5, 'card')] });
    expect(notes.map(n => n.time)).toEqual([10]);
    expect(notes[0]!.note).toMatch(/covered after 0.80s/);
  });

  it('flags a click that follows another too closely to see what the first one opened', () => {
    const notes = auditTiming([{ kind: 'click', time: 1 }, { kind: 'click', time: 1.3 }, { kind: 'click', time: 3 }], { overlays: [] });
    expect(notes.map(n => n.time)).toEqual([1.3]);
  });

  it('flags a mark hidden before it could be read', () => {
    const notes = auditTiming([{ kind: 'cut', time: 3, mark: 'label', shown: 0.6 }, { kind: 'cut', time: 8, mark: 'ring', shown: 2 }], { overlays: [] });
    expect(notes.map(n => n.time)).toEqual([3]);
  });

  it('reads as one line when all is well', () => {
    expect(formatTiming([])).toMatch(/nothing off-beat/);
    expect(formatTiming([{ time: 2, note: 'x' }])).toMatch(/1 to review\n\s+2.00s  x/);
  });
});

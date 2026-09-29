import { describe, expect, it } from 'vitest';
import { flowCues } from './cues.ts';

const chain = (n: number) => Array.from({ length: n - 1 }, (_, i) => ({ from: i, to: i + 1 }));

describe('flowCues', () => {
  it('lands each box on its word, with the arrow drawn just before it', () => {
    const { steps, arrows } = flowCues([1, 3, 5], chain(3), 1);
    expect(steps.map(c => c.enter)).toEqual([0, 2, 4]);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]!.start).toBeCloseTo(1.55);
    expect(arrows[0]!.duration).toBeCloseTo(0.45);
  });

  it('keeps each step ringed until the next one takes over, then steps it back', () => {
    const { steps } = flowCues([0, 2, 4], chain(3));
    expect(steps[0]).toMatchObject({ ringIn: 0.15, ringOut: 2, dim: 2 });
    expect(steps[2]!.ringOut).toBeUndefined();
    expect(steps[2]!.dim).toBeUndefined();
  });

  it('shortens the arrow between close steps but never draws it before the box it leaves', () => {
    const [arrow] = flowCues([0, 0.5], chain(2)).arrows;
    expect(arrow!.start).toBeCloseTo(0.2);
    expect(arrow!.start + arrow!.duration).toBeCloseTo(0.5);
    expect(flowCues([0, 0.25], chain(2)).arrows[0]!.duration).toBeCloseTo(0.15);
  });

  it('draws the second branch arrow only when its own step comes, however long after the question', () => {
    const edges = [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 1, to: 3 }];
    const arrows = flowCues([0, 1, 2, 6], edges).arrows;
    expect(arrows[2]!.start + arrows[2]!.duration).toBeCloseTo(6);
  });

  it('closes a cycle at its loop time, or shortly after the last step', () => {
    const edges = [...chain(3), { from: 2, to: 0, closing: true }];
    expect(flowCues([0, 1, 2], edges, 0, 3.5).arrows[2]).toEqual({ start: 3.5, duration: 0.6 });
    expect(flowCues([0, 1, 2], edges).arrows[2]!.start).toBeCloseTo(2.6);
  });

  it('hands the ring back to the first step when a cycle closes', () => {
    const { steps } = flowCues([0, 1, 2], [...chain(3), { from: 2, to: 0, closing: true }], 0, 3);
    expect(steps[0]!.again).toBeCloseTo(3.6);
    expect(steps[2]).toMatchObject({ ringOut: 3.6, dim: 3.6 });
  });
});

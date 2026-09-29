import { describe, expect, it } from 'vitest';
import { flowCues } from './cues.ts';

describe('flowCues', () => {
  it('lands each box on its word, with the arrow drawn just before it', () => {
    const cues = flowCues([1, 3, 5], 1);
    expect(cues.map(c => c.enter)).toEqual([0, 2, 4]);
    expect(cues[0]!.arrow).toBeUndefined();
    expect(cues[1]!.arrow!.start).toBeCloseTo(1.55);
    expect(cues[1]!.arrow!.duration).toBeCloseTo(0.45);
  });

  it('keeps each step ringed until the next one takes over, then steps it back', () => {
    const cues = flowCues([0, 2, 4]);
    expect(cues[0]).toMatchObject({ ringIn: 0.15, ringOut: 2, dim: 2 });
    expect(cues[2]!.ringOut).toBeUndefined();
    expect(cues[2]!.dim).toBeUndefined();
  });

  it('shortens the arrow between close steps but never draws it before the box it leaves', () => {
    const [, second] = flowCues([0, 0.5]);
    expect(second!.arrow!.start).toBeCloseTo(0.2);
    expect(second!.arrow!.start + second!.arrow!.duration).toBeCloseTo(0.5);
    const [, tight] = flowCues([0, 0.25]);
    expect(tight!.arrow!.duration).toBeCloseTo(0.15);
  });
});

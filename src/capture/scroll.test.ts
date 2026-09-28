import { describe, expect, it } from 'vitest';
import { scrollDuration, scrollPositionAt, scrollsDue } from './scroll.ts';

const plan = (y: number) => ({ key: 'window', from: { x: 0, y: 0 }, to: { x: 0, y } });

describe('scrollDuration', () => {
  it('grows with distance within bounds', () => {
    expect(scrollDuration([plan(10)])).toBe(0.45);
    expect(scrollDuration([plan(1500)])).toBeCloseTo(1);
    expect(scrollDuration([plan(20_000)])).toBe(1.1);
    expect(scrollDuration([plan(300), { ...plan(1500), key: '1' }])).toBeCloseTo(1);
  });
});

describe('scrollPositionAt', () => {
  const animation = { ...plan(1000), start: 1, duration: 1 };

  it('eases from start to end and holds there', () => {
    expect(scrollPositionAt(animation, 0.5)).toEqual({ x: 0, y: 0 });
    expect(scrollPositionAt(animation, 1.5).y).toBeCloseTo(500);
    expect(scrollPositionAt(animation, 1.25).y).toBeLessThan(250);
    expect(scrollPositionAt(animation, 3)).toEqual({ x: 0, y: 1000 });
  });
});

describe('scrollsDue', () => {
  const animation = { ...plan(1000), start: 1, duration: 1 };

  it('applies an animation on every frame it overlaps, including the one it ends in', () => {
    expect(scrollsDue([animation], 0.9, 0.95)).toEqual([]);
    expect(scrollsDue([animation], 0.95, 1)).toHaveLength(1);
    expect(scrollsDue([animation], 1.97, 2.01)).toHaveLength(1);
    expect(scrollsDue([animation], 2.01, 2.05)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { queueScroll, scrollBusyUntil, scrollDuration, scrollPositionAt, scrollsDue, type ScrollAnimation } from './scroll.ts';

const plan = (y: number) => ({ key: 'window', from: { x: 0, y: 0 }, to: { x: 0, y } });

describe('scrollDuration', () => {
  it('grows with distance within bounds', () => {
    expect(scrollDuration([plan(10)])).toBe(0.6);
    expect(scrollDuration([plan(1500)])).toBeCloseTo(1.6);
    expect(scrollDuration([plan(20_000)])).toBe(3.2);
    expect(scrollDuration([plan(300), { ...plan(1500), key: '1' }])).toBeCloseTo(1.6);
  });

  it('keeps the average speed readable until the longest scrolls', () => {
    for (const distance of [800, 1500, 2500, 3000]) expect(distance / scrollDuration([plan(distance)])).toBeLessThanOrEqual(1200);
  });
});

describe('scrollBusyUntil', () => {
  it('is the end of the latest scroll already under way, or now when nothing moves', () => {
    const animations = [{ ...plan(1000), start: 1, duration: 1 }, { ...plan(1000), key: 'x', start: 1.5, duration: 1.2 }];
    expect(scrollBusyUntil(animations, 1.6)).toBeCloseTo(2.7);
    expect(scrollBusyUntil(animations, 0.5)).toBe(0.5);
    expect(scrollBusyUntil(animations, 3)).toBe(3);
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

describe('queueScroll', () => {
  it('cuts a running scroll of the same container and continues from where it got to', () => {
    const animations: ScrollAnimation[] = [];
    queueScroll(animations, plan(1000), 0, 2);
    queueScroll(animations, { key: 'window', from: { x: 0, y: 999 }, to: { x: 0, y: 200 } }, 1, 0.5);
    expect(animations[0]!.duration).toBe(1);
    expect(animations[1]!.from.y).toBeCloseTo(500);
    expect(scrollsDue(animations, 1.2, 1.25)).toEqual([animations[1]]);
  });

  it('leaves other containers and finished scrolls alone', () => {
    const animations: ScrollAnimation[] = [];
    queueScroll(animations, plan(1000), 0, 1);
    queueScroll(animations, { ...plan(300), key: 'board' }, 0.5, 1);
    queueScroll(animations, plan(50), 2, 1);
    expect(animations.map(a => a.duration)).toEqual([1, 1, 1]);
    expect(animations[2]!.from).toEqual({ x: 0, y: 0 });
  });
});


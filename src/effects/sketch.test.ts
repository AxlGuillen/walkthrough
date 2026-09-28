import { describe, expect, it } from 'vitest';
import { random, roundedRectPoint, sketchCircle, sketchRect } from './sketch.ts';

function points(d: string) {
  const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return Array.from({ length: numbers.length / 2 }, (_, i) => ({ x: numbers[i * 2]!, y: numbers[i * 2 + 1]! }));
}

describe('random', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = random(7);
    const b = random(7);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every(v => v >= 0 && v < 1)).toBe(true);
  });
});

describe('sketchCircle', () => {
  const center = { x: 100, y: 100 };

  it('is the same drawing for the same seed and a different one for another', () => {
    expect(sketchCircle(center, 24, 1)).toBe(sketchCircle(center, 24, 1));
    expect(sketchCircle(center, 24, 1)).not.toBe(sketchCircle(center, 24, 2));
  });

  it('stays close to the requested radius around the center', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const { x, y } of points(sketchCircle(center, 24, seed))) {
        expect(Math.hypot(x - 100, y - 100)).toBeGreaterThan(24 * 0.7);
        expect(Math.hypot(x - 100, y - 100)).toBeLessThan(24 * 1.25);
      }
    }
  });

  it('goes past a full turn so the ends overlap like a pen stroke', () => {
    const [first, ...rest] = points(sketchCircle(center, 24, 3));
    const angle = (p: { x: number; y: number }) => Math.atan2(p.y - 100, p.x - 100);
    let travelled = 0;
    let last = angle(first!);
    for (const p of rest) {
      let step = angle(p) - last;
      if (step > Math.PI) step -= 2 * Math.PI;
      if (step < -Math.PI) step += 2 * Math.PI;
      travelled += step;
      last = angle(p);
    }
    expect(Math.abs(travelled)).toBeGreaterThan(2 * Math.PI);
  });
});

describe('roundedRectPoint', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 };

  it('walks the perimeter clockwise from the top edge', () => {
    expect(roundedRectPoint(rect, 10, 0)).toEqual({ x: 10, y: 0 });
    // Perimeter: 2·80 + 2·30 straight plus four quarter arcs of radius 10.
    const perimeter = 220 + 20 * Math.PI;
    const rightMiddle = roundedRectPoint(rect, 10, (80 + 5 * Math.PI + 15) / perimeter);
    expect(rightMiddle.x).toBeCloseTo(100);
    expect(rightMiddle.y).toBeCloseTo(25);
  });

  it('never leaves the rectangle', () => {
    for (let f = 0; f < 1; f += 0.01) {
      const { x, y } = roundedRectPoint(rect, 10, f);
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(100 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(50 + 1e-9);
    }
  });
});

describe('sketchRect', () => {
  it('hugs the rectangle within a few pixels', () => {
    const rect = { x: 50, y: 50, width: 200, height: 80 };
    for (const { x, y } of points(sketchRect(rect, 9))) {
      const outside = Math.max(rect.x - x, x - (rect.x + rect.width), rect.y - y, y - (rect.y + rect.height), 0);
      expect(outside).toBeLessThan(4);
    }
  });
});

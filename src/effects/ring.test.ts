import { describe, expect, it } from 'vitest';
import { ringPath } from './scene.ts';

const viewport = { width: 1600, height: 900 };

function points(d: string) {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[i * 2]!, y: n[i * 2 + 1]! }));
}

function bounds(d: string) {
  const xs = points(d).map(p => p.x);
  const ys = points(d).map(p => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe('ringPath', () => {
  const ring = { time: 0, hold: 1, seed: 4, rect: { x: 700, y: 400, width: 160, height: 40 } };

  it('surrounds the element with its padding', () => {
    const b = bounds(ringPath(ring, viewport));
    expect(b.left).toBeCloseTo(692, -0.5);
    expect(b.right).toBeCloseTo(868, -0.5);
    expect(b.top).toBeCloseTo(392, -0.5);
    expect(b.bottom).toBeCloseTo(448, -0.5);
  });

  it('rounds its corners like the element, so a pill gets a pill', () => {
    const pill = ringPath({ ...ring, radius: 999 }, viewport);
    const square = ringPath({ ...ring, radius: 0 }, viewport);
    // A pill's outline leaves the corner of its bounding box empty; a near-square one does not.
    const nearCorner = (d: string) => points(d).some(({ x, y }) => Math.hypot(x - 692, y - 392) < 8);
    expect(nearCorner(pill)).toBe(false);
    expect(nearCorner(square)).toBe(true);
  });

  it('stays inside the frame when the element touches its edge', () => {
    const b = bounds(ringPath({ ...ring, rect: { x: 1400, y: 100, width: 200, height: 800 } }, viewport));
    expect(b.right).toBeLessThanOrEqual(1600 - 2);
    expect(b.bottom).toBeLessThanOrEqual(900 - 2);
  });
});

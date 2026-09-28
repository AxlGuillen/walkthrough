import { describe, expect, it } from 'vitest';
import { cameraAt, fitRect, fullFrame } from './camera.ts';

const viewport = { width: 1600, height: 900 };
const home = fullFrame(viewport);

describe('fitRect', () => {
  it('pads the target and matches the video aspect ratio', () => {
    const rect = fitRect({ x: 700, y: 400, width: 400, height: 100 }, viewport, { padding: 50 });
    expect(rect.width / rect.height).toBeCloseTo(16 / 9);
    expect(rect).toMatchObject({ width: 800, height: 450, x: 500, y: 225 });
  });

  it('never zooms past the capture scale', () => {
    const rect = fitRect({ x: 790, y: 440, width: 20, height: 20 }, viewport, { maxZoom: 2 });
    expect(rect).toMatchObject({ width: 800, height: 450 });
  });

  it('falls back to the full frame for targets larger than the viewport', () => {
    expect(fitRect({ x: -100, y: 0, width: 2000, height: 300 }, viewport)).toEqual(home);
  });

  it('stays inside the viewport near the edges', () => {
    const rect = fitRect({ x: 1550, y: 850, width: 40, height: 40 }, viewport);
    expect(rect.x + rect.width).toBe(viewport.width);
    expect(rect.y + rect.height).toBe(viewport.height);
  });
});

describe('cameraAt', () => {
  const card = { x: 400, y: 200, width: 800, height: 450 };
  const moves = [
    { time: 1, duration: 1, rect: card },
    { time: 4, duration: 1, rect: home },
  ];

  it('holds the full frame before the first move', () => {
    expect(cameraAt(0.5, moves, home)).toEqual(home);
  });

  it('eases between positions and lands exactly on the target', () => {
    expect(cameraAt(1.5, moves, home)).toEqual({ x: 200, y: 100, width: 1200, height: 675 });
    expect(cameraAt(2, moves, home)).toEqual(card);
    expect(cameraAt(3.9, moves, home)).toEqual(card);
    expect(cameraAt(5, moves, home)).toEqual(home);
  });

  it('starts an interrupting move from wherever the camera is', () => {
    const interrupted = [
      { time: 0, duration: 2, rect: card },
      { time: 1, duration: 1, rect: home },
    ];
    const midway = cameraAt(1, interrupted, home);
    expect(midway).toEqual({ x: 200, y: 100, width: 1200, height: 675 });
    expect(cameraAt(1.0001, interrupted, home).x).toBeCloseTo(midway.x, 1);
    expect(cameraAt(2, interrupted, home)).toEqual(home);
  });
});

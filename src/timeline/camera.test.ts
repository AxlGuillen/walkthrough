import { describe, expect, it } from 'vitest';
import { cameraAt, fitRect, followCursor, fullFrame, type Rect } from './camera.ts';

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

describe('proportional zoom', () => {
  it('zooms only as far as the target needs to fill the frame', () => {
    const rect = fitRect({ x: 400, y: 300, width: 700, height: 200 }, viewport);
    expect(viewport.width / rect.width).toBeGreaterThan(1.2);
    expect(viewport.width / rect.width).toBeLessThan(2);
    expect(rect.width).toBeCloseTo(700 / 0.6);
  });

  it('skips zooms too slight to read as a close-up', () => {
    expect(fitRect({ x: 100, y: 100, width: 900, height: 200 }, viewport)).toEqual(home);
  });

  it('honors an explicit scale, within the capture limit', () => {
    expect(fitRect({ x: 700, y: 400, width: 10, height: 10 }, viewport, { scale: 1.5 }).width).toBeCloseTo(1600 / 1.5);
    expect(fitRect({ x: 700, y: 400, width: 10, height: 10 }, viewport, { scale: 4 }).width).toBe(800);
  });
});

describe('followCursor', () => {
  const zoomed = { x: 400, y: 200, width: 800, height: 450 };

  it('leaves the frame alone while the cursor is inside the safe area', () => {
    expect(followCursor(zoomed, { x: 800, y: 425 }, viewport)).toEqual(zoomed);
  });

  it('slides just enough to bring the cursor back to the safe edge', () => {
    const moved = followCursor(zoomed, { x: 1200, y: 425 }, viewport);
    expect(moved.x).toBeCloseTo(1200 - 800 * 0.82);
    expect(moved.y).toBe(200);
  });

  it('never leaves the viewport', () => {
    expect(followCursor(zoomed, { x: 1590, y: 890 }, viewport)).toMatchObject({ x: 800, y: 450 });
  });
});

describe('cameraAt with a followed zoom', () => {
  const card = { x: 400, y: 200, width: 800, height: 450 };
  const shift = (rect: Rect) => ({ ...rect, x: rect.x + 100 });

  it('adjusts followed moves and starts the next move from the adjusted frame', () => {
    const moves = [{ time: 0, duration: 1, rect: card, follow: true }, { time: 2, duration: 1, rect: home }];
    expect(cameraAt(1.5, moves, home, shift).x).toBe(500);
    expect(cameraAt(2, moves, home, shift).x).toBe(500);
    expect(cameraAt(3, moves, home, shift)).toEqual(home);
  });

  it('ignores the adjustment for moves that do not follow', () => {
    expect(cameraAt(1.5, [{ time: 0, duration: 1, rect: card }], home, shift)).toEqual(card);
  });
});

import { describe, expect, it } from 'vitest';
import { bendFor, cursorPosition, emptyPlan, sceneAt, strokePhase, TIMING, travelTime, type EffectsPlan } from './scene.ts';

const home = { x: 800, y: 450 };

function plan(overrides: Partial<EffectsPlan> = {}): EffectsPlan {
  return { ...emptyPlan('mouse', home), ...overrides };
}

describe('cursorPosition', () => {
  const moves = [
    { start: 1, end: 2, from: home, to: { x: 100, y: 50 }, bend: 0 },
    { start: 3, end: 3.5, from: { x: 100, y: 50 }, to: { x: 300, y: 50 }, bend: 0 },
  ];

  it('rests at home until the first move', () => {
    expect(cursorPosition(0.5, plan({ moves }))).toEqual(home);
  });

  it('eases along a move and lands exactly on the target', () => {
    expect(cursorPosition(1.5, plan({ moves }))).toEqual({ x: 450, y: 250 });
    expect(cursorPosition(2, plan({ moves }))).toEqual({ x: 100, y: 50 });
    expect(cursorPosition(2.9, plan({ moves }))).toEqual({ x: 100, y: 50 });
    expect(cursorPosition(4, plan({ moves }))).toEqual({ x: 300, y: 50 });
  });

  it('jumps on a zero-length move', () => {
    const jump = [{ start: 1, end: 1, from: home, to: { x: 0, y: 0 }, bend: 0 }];
    expect(cursorPosition(1, plan({ moves: jump }))).toEqual({ x: 0, y: 0 });
  });
});

describe('curved moves', () => {
  const straight = { start: 0, end: 1, from: { x: 0, y: 0 }, to: { x: 1000, y: 0 }, bend: 0 };

  it('sags sideways by the bend and still ends exactly on the target', () => {
    const bent = { ...straight, bend: 0.1 };
    expect(cursorPosition(0.5, plan({ moves: [straight] })).y).toBeCloseTo(0);
    expect(cursorPosition(0.5, plan({ moves: [bent] })).y).toBeCloseTo(50);
    expect(cursorPosition(1, plan({ moves: [bent] }))).toEqual({ x: 1000, y: 0 });
  });

  it('takes longer across the screen than for a short hop, within bounds', () => {
    const at = { x: 0, y: 0 };
    expect(travelTime(at, { x: 0, y: 0 })).toBe(TIMING.travelMin);
    expect(travelTime(at, { x: 10, y: 0 })).toBeLessThan(TIMING.travelMin + 0.01);
    expect(travelTime(at, { x: 600, y: 0 })).toBeGreaterThan(travelTime(at, { x: 100, y: 0 }));
    expect(travelTime(at, { x: 5000, y: 0 })).toBe(TIMING.travelMax);
  });

  it('bends the same way every render, to either side, never flat', () => {
    expect(bendFor(4200)).toBe(bendFor(4200));
    const bends = Array.from({ length: 40 }, (_, i) => bendFor(i * 997));
    expect(bends.some(b => b < 0) && bends.some(b => b > 0)).toBe(true);
    expect(bends.every(b => Math.abs(b) >= 0.08 && Math.abs(b) <= 0.18)).toBe(true);
  });
});

describe('sceneAt', () => {
  const moves = [{ start: 1, end: 2, from: home, to: { x: 100, y: 50 }, bend: 0 }];

  it('hides the cursor before it first moves, then fades it in', () => {
    expect(sceneAt(0.9, plan({ moves })).cursor).toBeNull();
    expect(sceneAt(1 + TIMING.cursorFade / 2, plan({ moves })).cursor?.opacity).toBeCloseTo(0.5);
    expect(sceneAt(2, plan({ moves })).cursor?.opacity).toBe(1);
  });

  it('never shows a cursor on touch devices', () => {
    expect(sceneAt(2, { ...plan({ moves }), pointer: 'touch' }).cursor).toBeNull();
  });

  it('presses the cursor briefly on click', () => {
    const clicks = [{ time: 2, at: { x: 100, y: 50 }, seed: 1 }];
    expect(sceneAt(2.05, plan({ moves, clicks })).cursor?.scale).toBeLessThan(1);
    expect(sceneAt(2 + TIMING.press, plan({ moves, clicks })).cursor?.scale).toBe(1);
  });

  it('draws one stroke per active click and ring', () => {
    const scene = sceneAt(2.2, plan({
      clicks: [{ time: 2, at: { x: 100, y: 50 }, seed: 1 }],
      rings: [{ time: 2.1, rect: { x: 0, y: 0, width: 50, height: 20 }, hold: 1, seed: 2 }],
    }));
    expect(scene.strokes).toHaveLength(2);
    expect(scene.strokes.every(s => s.d.startsWith('M'))).toBe(true);
  });
});

describe('strokePhase', () => {
  it('draws in, holds, fades out and disappears', () => {
    expect(strokePhase(0.9, 1, 0.4, 1)).toBeNull();
    expect(strokePhase(1.2, 1, 0.4, 1)).toMatchObject({ opacity: 1 });
    expect(strokePhase(1.2, 1, 0.4, 1)!.progress).toBeGreaterThan(0.5);
    expect(strokePhase(1.2, 1, 0.4, 1)!.progress).toBeLessThan(1);
    expect(strokePhase(2, 1, 0.4, 1)).toEqual({ progress: 1, opacity: 1 });
    expect(strokePhase(1.4 + 1 + TIMING.fade / 2, 1, 0.4, 1)!.opacity).toBeCloseTo(0.5);
    expect(strokePhase(1.4 + 1 + TIMING.fade, 1, 0.4, 1)).toBeNull();
  });
});

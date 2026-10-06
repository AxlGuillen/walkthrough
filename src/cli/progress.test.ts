import { describe, expect, it } from 'vitest';
import { progressLine, renderProgress } from './progress.ts';

describe('progressLine', () => {
  it('shows each stage with work to do, frames done over total', () => {
    expect(progressLine({ capturing: 100, overlays: 50, stage: 0 }, { capturing: 40 })).toBe('capturing 40/100 · overlays 0/50');
  });
});

describe('renderProgress', () => {
  it('adds up the frames of overlays rendering at once', () => {
    const out: string[] = [];
    const progress = renderProgress({ overlays: 30 }, text => { out.push(text); });
    progress('overlays', 5, 1);
    progress('overlays', 7, 2);
    progress('overlays', 6, 1);
    expect(out.at(-1)).toBe('\r  overlays 13/30   ');
  });
});

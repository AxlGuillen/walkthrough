import { describe, expect, it } from 'vitest';
import { encoderArgs } from './encoder.ts';

describe('encoderArgs', () => {
  const args = encoderArgs({ fps: 30, output: { width: 1920, height: 1080 }, file: 'out.mp4' });

  it('reads PNG frames from stdin at the capture rate', () => {
    expect(args.join(' ')).toContain('-f image2pipe -framerate 30 -c:v png -i -');
  });

  it('scales every frame to the output size', () => {
    expect(args[args.indexOf('-vf') + 1]).toMatch(/^scale=1920:1080:/);
  });

  it('writes to the requested file last', () => {
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('keeps transparency losslessly for overlays', () => {
    const overlay = encoderArgs({ fps: 30, output: { width: 1920, height: 1080 }, file: 'o.mov', alpha: true });
    expect(overlay[overlay.indexOf('-vf') + 1]).toMatch(/format=rgba$/);
    expect(overlay.slice(overlay.indexOf('-vf') + 2, overlay.indexOf('-vf') + 4)).toEqual(['-c:v', 'png']);
  });

  it('trades quality for speed on drafts', () => {
    const draft = encoderArgs({ fps: 15, output: { width: 960, height: 540 }, file: 'p.mp4', draft: true }).join(' ');
    expect(draft).toContain('-preset veryfast -crf 23');
  });
});

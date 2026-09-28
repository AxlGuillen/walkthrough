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
});

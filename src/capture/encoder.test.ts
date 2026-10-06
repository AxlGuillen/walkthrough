import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encoderArgs, startEncoder } from './encoder.ts';

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
    expect(overlay[overlay.indexOf('-vf') + 1]).toMatch(/format=argb$/);
    expect(overlay.slice(overlay.indexOf('-vf') + 2, overlay.indexOf('-vf') + 4)).toEqual(['-c:v', 'qtrle']);
  });

  it('repeats a single frame in ffmpeg, for an overlay where nothing moves', () => {
    const still = encoderArgs({ fps: 30, output: { width: 1920, height: 1080 }, file: 'o.mov', alpha: true, repeat: 90 });
    expect(still[still.indexOf('-vf') + 1]).toContain(',loop=loop=89:size=1');
    expect(still.join(' ')).toContain('-frames:v 90');
  });

  it('trades quality for speed on drafts', () => {
    const draft = encoderArgs({ fps: 15, output: { width: 960, height: 540 }, file: 'p.mp4', draft: true }).join(' ');
    expect(draft).toContain('-preset veryfast -crf 23');
  });
});

describe('the overlay encoder', () => {
  it('stores frames losslessly, alpha included', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'encoder-'));
    try {
      // Two frames of soft, half-transparent shapes, as PNGs the way Chrome hands them over.
      const frames = [0, 1].map(i => execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
        `color=c=red@0.4:s=320x180,format=rgba,drawbox=x=${40 + i * 30}:y=40:w=120:h=80:color=0x22ccff@0.7:t=fill,gblur=sigma=3`,
        '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']));
      const file = path.join(dir, 'o.mov');
      const encoder = startEncoder({ fps: 30, output: { width: 320, height: 180 }, file, alpha: true });
      for (const frame of frames) await encoder.write(frame);
      await encoder.finish();
      const raw = (input: Buffer | string) => execFileSync('ffmpeg', ['-v', 'error', '-i', typeof input === 'string' ? input : '-', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
        typeof input === 'string' ? {} : { input });
      expect(raw(file).equals(Buffer.concat(frames.map(frame => raw(frame))))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

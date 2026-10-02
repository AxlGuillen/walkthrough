import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeTour } from '../compose/compose.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { stagePlan } from './plan.ts';
import { renderStage, spanFrames, stageFile, stageFrame } from './render.ts';

const output = { width: 1920, height: 1080 };
let dir: string;

function pixel(time: number, x: number, y: number): number[] {
  return [...execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path.join(dir, 'video.mp4'), '-frames:v', '1',
    '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
}
const isGreen = ([r, g, b]: number[]) => r! < 60 && g! > 100 && b! < 60;
const isBlue = ([r, g, b]: number[]) => r! < 60 && g! < 60 && b! > 200;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'stage-'));
  await mkdir(path.join(dir, 'voice'));
  // Two seconds of green, then two of blue: the color on the stage reveals which instant it shows.
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x00a000:s=1920x1080:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=1920x1080:r=30:d=2',
    '-filter_complex', '[0][1]concat=n=2:v=1', '-pix_fmt', 'yuv420p', 'capture.mp4'], { cwd: dir });
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('stage', () => {
  it('starts and ends a span on whole frames', () => {
    expect(spanFrames({ start: 1.01, end: 2.5 }, 30)).toEqual({ first: 30, count: 45 });
  });

  it('holds the old screen at the frame before the cut, and runs the new one live', () => {
    const plan = { moves: [], changes: [{ time: 2.01, kind: 'push' as const }] };
    expect(stageFrame(plan, 60, 30).change).toBeUndefined();
    const frame = stageFrame(plan, 70, 30);
    expect(frame.time).toBeCloseTo(70.5 / 30);
    expect(frame.change!.oldTime).toBeCloseTo(60.5 / 30);
  });

  it('pushes the old screen out as the new one comes in, on a change the stage draws', async () => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
transition: push
segments:
  - hold: 2
  - hold: 2
    do: [{ goto: /next }]
`);
    const timeline = buildTimeline(tour, []);
    const plan = stagePlan(timeline);
    expect(plan.spans).toEqual([{ start: 2, end: 2.8 }]);
    await renderStage({ plan, capture: path.join(dir, 'capture.mp4'), tourDir: dir, outDir: dir, canvas: output, output, fps: 30 });
    await composeTour(tour, timeline, dir, dir);

    expect(isGreen(pixel(1.9, 20, 540))).toBe(true);
    // Half-way: the old screen on the left, the new one on the right.
    expect(isGreen(pixel(2.4, 300, 540))).toBe(true);
    expect(isBlue(pixel(2.4, 1600, 540))).toBe(true);
    expect(isBlue(pixel(3.2, 20, 540))).toBe(true);
  }, 120_000);

  it('renders only the stretch off the flat and composes it in place of the capture, in sync', async () => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
segments:
  - hold: 1
  - hold: 3
    do:
      - shot: { to: wide, duration: 0.5 }
`);
    const timeline = buildTimeline(tour, []);
    const plan = stagePlan(timeline);
    expect(plan.spans).toEqual([{ start: 1, end: 4 }]);

    await renderStage({ plan, capture: path.join(dir, 'capture.mp4'), tourDir: dir, outDir: dir, canvas: output, output, fps: 30 });
    expect(existsSync(path.join(dir, stageFile(0)))).toBe(true);
    await composeTour(tour, timeline, dir, dir);

    // Before the shot the capture fills the frame; after it, the stage shows around the smaller recording.
    expect(isGreen(pixel(0.5, 20, 20))).toBe(true);
    expect(isGreen(pixel(1.8, 20, 20))).toBe(false);
    expect(isGreen(pixel(1.8, 960, 540))).toBe(true);
    // The recording inside the stage keeps the capture's time: blue from 2s on.
    expect(isBlue(pixel(2.5, 960, 540))).toBe(true);
    expect(isBlue(pixel(2.5, 20, 20))).toBe(false);
  }, 120_000);
});

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeTour } from '../compose/compose.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { overlayUrl, renderOverlays, resolveOverlay } from './render.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const output = { width: 1920, height: 1080 };
let dir: string;
const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { cwd: dir });

function pixel(file: string, time: number, x: number, y: number): number[] {
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path.join(dir, file), '-frames:v', '1',
    '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [...rgb];
}
const isYellow = ([r, g, b]: number[]) => r! > 200 && g! > 200 && b! < 60;
const isBlack = ([r, g, b]: number[]) => r! < 40 && g! < 40 && b! < 40;
const isRed = ([r, g, b]: number[]) => r! > 200 && g! < 60 && b! < 60;
const isWhite = ([r, g, b]: number[]) => r! > 200 && g! > 200 && b! > 200;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'overlays-'));
  await mkdir(path.join(dir, 'voice'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=30:d=4', '-pix_fmt', 'yuv420p', 'capture.mp4');
  // One second of red, then one of white: the frame shown reveals the playback time.
  ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=30:d=1',
    '-filter_complex', '[0][1]concat=n=2:v=1', '-pix_fmt', 'yuv420p', 'clip.mp4');
  await writeFile(path.join(dir, 'clip.html'), '<body style="margin:0"><video src="clip.mp4" autoplay muted '
    + 'style="position:absolute;left:1000px;top:500px;width:320px;height:180px"></video></body>');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('overlayUrl', () => {
  it('carries the tour folder, its accent and the params as a query string', () => {
    const url = new URL(overlayUrl('/repo/templates/overlays/title.html', '/repo/tours/x', { title: 'Hola mundo' }, '#FF3B5C'));
    expect(url.pathname).toBe('/repo/templates/overlays/title.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({ base: 'file:///repo/tours/x/', accent: '#FF3B5C', title: 'Hola mundo' });
  });

  it('lets params override the automatic ones', () => {
    expect(new URL(overlayUrl('/t.html', '/x', { accent: '#000000' }, '#FFFFFF')).searchParams.get('accent')).toBe('#000000');
  });
});

describe('resolveOverlay', () => {
  it("prefers the tour's own file, then the shared template, else nothing", async () => {
    await writeFile(path.join(dir, 'lower-third.html'), '<p>tour</p>');
    expect(resolveOverlay(dir, 'lower-third.html')).toBe(path.join(dir, 'lower-third.html'));
    expect(resolveOverlay(dir, 'title-card.html')).toBe(path.join(ROOT, 'templates/overlays/title-card.html'));
    expect(resolveOverlay(dir, 'nope.html')).toBeNull();
  });
});

describe('overlays', () => {
  it('renders HTML on its own clock and composes it over the capture only while it is on', async () => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
subtitles: none
segments:
  - hold: 4
    overlays:
      - { src: ${path.join(ROOT, 'tests/fixtures/overlay/index.html')}, from: 1, to: 3, fade: 0, params: { color: "#ffff00" } }
      - { src: clip.html, from: 1, to: 3.5, fade: 0 }
`);
    const timeline = buildTimeline(tour, []);
    await renderOverlays({ overlays: timeline.overlays, tourDir: dir, outDir: dir, canvas: output, output, fps: 30 });
    await composeTour(tour, timeline, dir, dir);

    // The box grows from its center over its first second on screen, starting at 1s.
    expect(isBlack(pixel('video.mp4', 0.5, 200, 200))).toBe(true);
    expect(isYellow(pixel('video.mp4', 1.2, 200, 200))).toBe(true);
    expect(isBlack(pixel('video.mp4', 1.2, 110, 110))).toBe(true);
    expect(isYellow(pixel('video.mp4', 2.5, 110, 110))).toBe(true);
    expect(isBlack(pixel('video.mp4', 3.5, 200, 200))).toBe(true);

    // The clip plays on video time: red for its first second on screen, white after. On
    // wall time the switch would come early, since capturing a frame is slower than 1/30s.
    expect(isBlack(pixel('video.mp4', 0.9, 1160, 590))).toBe(true);
    expect(isRed(pixel('video.mp4', 1.95, 1160, 590))).toBe(true);
    expect(isWhite(pixel('video.mp4', 2.05, 1160, 590))).toBe(true);
  }, 120_000);
});

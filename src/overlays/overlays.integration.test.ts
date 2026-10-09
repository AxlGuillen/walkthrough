import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
    const url = new URL(overlayUrl('/repo/templates/overlays/title.html', '/repo/tours/x', { title: 'Hola mundo' }, { accent: '#FF3B5C' }));
    expect(url.pathname).toBe(pathToFileURL('/repo/templates/overlays/title.html').pathname);
    expect(Object.fromEntries(url.searchParams)).toEqual({ base: `${pathToFileURL('/repo/tours/x').href}/`, accent: '#FF3B5C', title: 'Hola mundo' });
  });

  it('lets params override the automatic ones', () => {
    expect(new URL(overlayUrl('/t.html', '/x', { accent: '#000000' }, { accent: '#FFFFFF' })).searchParams.get('accent')).toBe('#000000');
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

describe('animations placed by second', () => {
  const render = async (name: string) => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
segments:
  - hold: 2
    overlays:
      - { src: ${path.join(ROOT, 'tests/fixtures/overlay/seek.html')}, fade: 0, beats: { go: 0.5 }, data: { rows: [1, 2] } }
`);
    const out = path.join(dir, name);
    await mkdir(out, { recursive: true });
    await renderOverlays({ overlays: buildTimeline(tour, []).overlays, tourDir: dir, outDir: out, canvas: output, output, fps: 10 });
    return path.join(name, 'overlays', '01.mov');
  };

  it('lands a GSAP timeline on its beat, frame for frame, and renders the same twice', async () => {
    const first = await render('seek-a');
    const alpha = (time: number, x: number) => {
      const rgba = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path.join(dir, first), '-frames:v', '1',
        '-vf', `format=rgba,crop=1:1:${x}:450`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
      return rgba[3]!;
    };
    // Still before the beat; 0.5s after it, halfway: x = 500, so the box covers 500..600.
    expect(alpha(0.3, 50)).toBeGreaterThan(200);
    expect(alpha(1.0, 550)).toBeGreaterThan(200);
    expect(alpha(1.0, 50)).toBe(0);
    expect(alpha(1.0, 700)).toBe(0);

    const second = await render('seek-b');
    const hashes = (file: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, file), '-f', 'framemd5', '-']).toString()
      .split('\n').filter(line => line && !line.startsWith('#'));
    expect(hashes(second)).toEqual(hashes(first));
  }, 120_000);
});

describe('missing media', () => {
  it('stops the render and names what did not load, instead of leaving a blank hole', async () => {
    await writeFile(path.join(dir, 'broken.html'), '<body><video src="missing-clip.mp4" muted></video><img src="missing-photo.png"><img></body>');
    const tour = parseTour(`
title: Fixture
url: https://example.com
segments:
  - hold: 1
    overlays:
      - { src: broken.html, fade: 0 }
`);
    const out = path.join(dir, 'broken');
    await mkdir(out, { recursive: true });
    const error = await renderOverlays({ overlays: buildTimeline(tour, []).overlays, tourDir: dir, outDir: out, canvas: output, output, fps: 10 })
      .then(() => undefined, (e: Error) => e.message);
    expect(error).toMatch(/^broken\.html could not load /);
    expect(error).toContain(path.join(dir, 'missing-clip.mp4'));
    expect(error).toContain(path.join(dir, 'missing-photo.png'));
  }, 60_000);
});

describe('still overlays', () => {
  it('shoots a page where nothing moves once, and repeats that frame for as long as it is on', async () => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
segments:
  - hold: 2
    overlays:
      - { src: ${path.join(ROOT, 'tests/fixtures/overlay/still.html')}, fade: 0 }
`);
    const out = path.join(dir, 'still');
    await mkdir(out, { recursive: true });
    const shots: number[] = [];
    await renderOverlays({
      overlays: buildTimeline(tour, []).overlays, tourDir: dir, outDir: out, canvas: output, output, fps: 10,
      onFrame: (_, frame) => shots.push(frame),
    });
    expect(shots).toEqual([20]);
    const frames = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(out, 'overlays', '01.mov'), '-f', 'framemd5', '-']).toString()
      .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)!.trim());
    expect(frames).toHaveLength(20);
    expect(new Set(frames).size).toBe(1);
    const rgba = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1.5', '-i', path.join(out, 'overlays', '01.mov'), '-frames:v', '1',
      '-vf', 'format=rgba,crop=1:1:1800:960', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
    // rgba(255, 200, 0, 0.7), give or take the level Chrome's premultiplied alpha rounds off.
    const [r, g, b, a] = [...rgba];
    expect([r, b, a]).toEqual([255, 0, 179]);
    expect(Math.abs(g! - 200)).toBeLessThanOrEqual(1);
  }, 60_000);
});


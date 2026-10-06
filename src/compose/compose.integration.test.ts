import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { composeTour } from './compose.ts';
import { sfxGraph } from './sfx.ts';
import { SOUNDS } from './sounds.ts';
import { spawnSync } from 'node:child_process';

let dir: string;
const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { cwd: dir });
const probe = (file: string, entries: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', entries,
  '-of', 'csv=p=0', path.join(dir, file)]).toString().trim();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'compose-'));
  await mkdir(path.join(dir, 'voice'));
  ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=3', '-pix_fmt', 'yuv420p', 'capture.mp4');
  ffmpeg('-f', 'lavfi', '-i', 'sine=f=440:d=1', 'voice/01.wav');
  ffmpeg('-f', 'lavfi', '-i', 'sine=f=220:d=2', '-ac', '2', 'music.mp3');
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('composeTour', () => {
  it('muxes voice, karaoke subtitles and ducked music at the timeline length', async () => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
music: { track: music.mp3 }
subtitles: karaoke
segments:
  - say: Hola mundo
    hold: 3
`);
    const timeline = buildTimeline(tour, [{ duration: 1, words: [{ text: 'Hola', start: 0, end: 0.4 }, { text: 'mundo', start: 0.5, end: 1 }] }]);

    await composeTour(tour, timeline, dir, dir);

    expect(Number(probe('video.mp4', 'format=duration'))).toBeCloseTo(3, 1);
    expect(probe('video.mp4', 'stream=codec_type').split(/\r?\n/)).toEqual(['video', 'audio']);
    expect(readFileSync(path.join(dir, 'subs.ass'), 'utf8')).toContain('{\\k50}Hola');
  }, 60_000);

  it('finishes with several effects of the same kind under music', async () => {
    const tour = parseTour(`
title: Fixture
url: https://example.com
music: { track: music.mp3 }
subtitles: none
segments:
  - say: Hola mundo
    hold: 3
    do:
      - highlight: ".a"
      - highlight: { on: ".b", at: 1 }
      - click: { on: ".c", at: 1.5 }
      - click: { on: ".d", at: 2 }
    overlays: []
`);
    const timeline = buildTimeline(tour, [{ duration: 1, words: [{ text: 'Hola', start: 0, end: 0.4 }, { text: 'mundo', start: 0.5, end: 1 }] }]);
    const started = Date.now();
    await composeTour(tour, timeline, dir, dir);
    // A hung amix spins until compose kills it (120 s); a busy machine takes a while, not that.
    expect(Date.now() - started).toBeLessThan(45_000);
    expect(Number(probe('video.mp4', 'format=duration'))).toBeCloseTo(3, 1);
  }, 60_000);

  it('puts the capture inside a frame at the video\'s size', async () => {
    const tour = parseTour('title: x\nurl: https://example.com\nframe: phone\nsfx: false\nsegments:\n  - hold: 1\n');
    await expect(composeTour(tour, buildTimeline(tour, []), dir, dir)).rejects.toThrow(/frame.png is missing/);
    ffmpeg('-f', 'lavfi', '-i', 'color=c=black@0.0:s=1920x1080,format=rgba', '-frames:v', '1', 'frame.png');
    await composeTour(tour, buildTimeline(tour, []), dir, dir);
    expect(probe('video.mp4', 'stream=width,height').split('\n')[0]).toBe('1920,1080');
    await rm(path.join(dir, 'frame.png'));
  }, 60_000);

  it('fails clearly when the music track is missing', async () => {
    const tour = parseTour('title: x\nurl: https://example.com\nmusic: { track: nope.mp3 }\nsegments:\n  - hold: 1\n');
    await expect(composeTour(tour, buildTimeline(tour, []), dir, dir)).rejects.toThrow(/music track not found/);
  });
});

describe('sound effect sources', () => {
  it('every sound and variant is valid ffmpeg and finishes promptly', () => {
    const events = SOUNDS.flatMap((sound, i) => [0, 1, 2].map(variant => ({ sound, variant, time: i + variant * 0.3, duration: 0.6 })));
    const graph = sfxGraph(events, SOUNDS.length + 1)!;
    const run = spawnSync('ffmpeg', ['-v', 'error', '-filter_complex', graph.parts.join(';'), '-map', graph.label, '-f', 'null', '-'],
      { timeout: 20_000, killSignal: 'SIGKILL' });
    expect(run.signal).toBeNull();
    expect(run.stderr.toString()).toBe('');
    expect(run.status).toBe(0);
  }, 30_000);
});


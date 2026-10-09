import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureTour } from '../capture/capture.ts';
import { deviceProfile } from '../capture/devices.ts';
import { composeTour } from '../compose/compose.ts';
import { renderOverlays } from '../overlays/render.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FPS = 30;
const RATE = 48000;
const { viewport, output } = deviceProfile('desktop');
const scale = output.width / viewport.width;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sync-'));
  await mkdir(path.join(dir, 'voice'));
  // A blue box that comes in half a second into the overlay, where the overlay says it sounds.
  await writeFile(path.join(dir, 'cue.html'), `<!doctype html><html><head><style>
    body { margin: 0; background: transparent; }
    #box { position: absolute; left: 760px; top: 340px; width: 400px; height: 400px; background: #0000ff; animation: show 1ms linear 500ms both; }
    @keyframes show { from { opacity: 0; } to { opacity: 1; } }
  </style></head><body><div id="box"></div>
  <script src="${pathToFileURL(path.join(ROOT, 'templates/overlays/params.js')).href}"></script>
  <script>walkthrough.cue(0.5);</script></body></html>`);
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

// Every frame of a region of the final video, as RGB bytes; the rect is in CSS pixels.
function frames(file: string, rect: { x: number; y: number; width: number; height: number }): Buffer[] {
  const [x, y, w, h] = [rect.x, rect.y, rect.width, rect.height].map(v => Math.round(v * scale));
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${w}:${h}:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const size = w! * h! * 3;
  return Array.from({ length: Math.floor(raw.length / size) }, (_, i) => raw.subarray(i * size, (i + 1) * size));
}

const count = (frame: Buffer, match: (r: number, g: number, b: number) => boolean) => {
  let n = 0;
  for (let i = 0; i + 2 < frame.length; i += 3) if (match(frame[i]!, frame[i + 1]!, frame[i + 2]!)) n++;
  return n;
};

// The first frame from `after` on where `shows` holds, as a time.
function firstFrame(all: Buffer[], after: number, shows: (frame: Buffer, previous: Buffer) => boolean): number {
  for (let i = Math.max(1, Math.floor(after * FPS)); i < all.length; i++) if (shows(all[i]!, all[i - 1]!)) return i / FPS;
  return Number.NaN;
}

// Where a sound starts: the first sample above a share of the loudest one around it. A fifth
// for a sharp sound, so the encoder's faint pre-echo does not count; a fiftieth for one that
// swells, whose fifth comes well after it starts.
function audioOnset(samples: Int16Array, around: number, share = 1 / 5): number {
  const from = Math.floor((around - 0.3) * RATE);
  const to = Math.floor((around + 0.3) * RATE);
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  for (let i = from; i < to; i++) if (Math.abs(samples[i]!) > peak * share) return i / RATE;
  return Number.NaN;
}

describe('sound and picture in the final video', () => {
  it('starts each sound on the first frame where what it goes with shows', async () => {
    const page = pathToFileURL(path.join(ROOT, 'tests/fixtures/sync/index.html')).href;
    const tour = parseTour(`
title: Sync
url: ${page}
clickStyle: ripple
segments:
  - hold: 6.5
    do:
      - goto: ${page}
      - highlight: { on: "#target", at: 0.8 }
      - click: { on: "#target", at: 3.5 }
      - zoom: { to: "#target", at: 5, duration: 0.8 }
  - hold: 2
    overlays:
      - { src: cue.html, fade: 0 }
`);
    const timeline = buildTimeline(tour, []);
    await captureTour({ root: ROOT, tour, timeline, file: path.join(dir, 'capture.mp4'), fps: FPS });
    await renderOverlays({ overlays: timeline.overlays, tourDir: dir, outDir: dir, canvas: output, output, fps: FPS });
    await composeTour(tour, timeline, dir, dir);
    const video = path.join(dir, 'video.mp4');

    // The tour accent (#FF3B5C), also where a thin, see-through stroke blends with the grey button.
    const accent = (r: number, g: number, b: number) => r - g > 60 && r - b > 40;
    const around = frames(video, { x: 600, y: 340, width: 400, height: 220 });
    const corner = frames(video, { x: 10, y: 10, width: 150, height: 150 });
    const box = frames(video, { x: 860, y: 440, width: 200, height: 200 });
    const picture = {
      draw: firstFrame(around, 0.5, frame => count(frame, accent) > 30),
      click: firstFrame(around, 3.3, frame => count(frame, accent) > 10),
      whoosh: firstFrame(corner, 4.9, (frame, previous) => frame.some((v, i) => Math.abs(v - previous[i]!) > 40)),
      pop: firstFrame(box, 6.6, frame => count(frame, (r, g, b) => b > 200 && r < 60 && g < 60) > 100),
    };

    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    for (const [sound, shown] of Object.entries(picture)) {
      expect(shown, `${sound} shows`).not.toBeNaN();
      // The zoom eases out of rest, moving less than a pixel on its first frame, and its whoosh
      // swells: neither has a sharp start, so they may meet a frame either way.
      const swell = sound === 'whoosh';
      const heard = audioOnset(samples, shown, swell ? 1 / 50 : 1 / 5);
      // Never before its frame (a few samples of encoder slack), never more than a frame after.
      expect(heard - shown, sound).toBeGreaterThan(swell ? -1 / FPS - 0.004 : -0.004);
      expect(heard - shown, sound).toBeLessThan(1 / FPS + 0.004);
    }
  }, 240_000);
});

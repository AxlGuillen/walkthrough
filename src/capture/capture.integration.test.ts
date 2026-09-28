import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { captureTour } from './capture.ts';
import { installClock } from './clock.ts';
import { deviceProfile } from './devices.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const fixture = (name: string) => pathToFileURL(path.join(ROOT, 'tests/fixtures', name, 'index.html')).href;

let dir: string;
beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), 'capture-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('virtual clock', () => {
  async function positions(delay: () => number) {
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 300 } });
      const clock = await installClock(page);
      // Loaded frozen, not through settle(): settling runs on wall time, which is the
      // point for real apps but would make the starting state differ between runs.
      await page.goto(fixture('clock'));
      const samples: Record<string, number>[] = [];
      for (let frame = 0; frame <= 60; frame++) {
        await clock.syncAnimations();
        if (frame % 10 === 0) {
          samples.push(await page.evaluate(() => Object.fromEntries(['raf', 'transition', 'keyframes'].map(id => [
            id, new DOMMatrix(getComputedStyle(document.getElementById(id)!).transform).m41,
          ]))));
        }
        await new Promise(resolve => setTimeout(resolve, delay()));
        await clock.advance(1000 / 30);
      }
      return samples;
    } finally {
      await browser.close();
    }
  }

  it('makes JS and CSS animations depend on video time, not capture speed', async () => {
    const fast = await positions(() => 0);
    const slow = await positions(() => Math.random() * 120);
    for (const [i, sample] of fast.entries()) {
      for (const [id, x] of Object.entries(sample)) expect(Math.abs(x - slow[i]![id]!), `${id} at sample ${i}`).toBeLessThanOrEqual(4);
    }
    // At 1s the rAF box and the looping animation moved 200px; the 1s transition fired
    // at 0.5s is halfway.
    expect(fast[3]).toMatchObject({
      raf: expect.closeTo(200, -1),
      transition: expect.closeTo(200, -1),
      keyframes: expect.closeTo(200, -1),
    });
  }, 60_000);
});

describe('captureTour', () => {
  it('renders actions and camera moves into a video at the output size', async () => {
    const tour = parseTour(`
title: Fixture
url: ${fixture('app')}
segments:
  - hold: 1
    do:
      - goto: ${fixture('app')}
      - hover: { on: "#card", at: 0.2 }
  - hold: 1
    do:
      - click: "#toggle"
  - hold: 1.5
    do:
      - zoom: "#card"
`);
    const file = path.join(dir, 'capture.mp4');
    const { frames } = await captureTour({ root: ROOT, tour, timeline: buildTimeline(tour, []), file, fps: 30 });

    expect(frames).toBe(105);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', file]).toString().trim();
    expect(probe).toBe('1920,1080,105');

    const boxes = await layout(fixture('app'), ['#card', '#toggle']);
    const scale = 1920 / deviceProfile('desktop').viewport.width;
    const at = (time: number, x: number, y: number) => pixel(file, time, Math.round(x * scale), Math.round(y * scale));
    // Sample inside the padding, away from text glyphs.
    const card = { x: boxes['#card']!.x + 6, y: center(boxes['#card']!).y };
    const toggle = { x: boxes['#toggle']!.x + 4, y: center(boxes['#toggle']!).y };

    expect(dominant(at(0.1, card.x, card.y))).toBe('gray');
    expect(dominant(at(0.9, card.x, card.y))).toBe('blue');
    expect(dominant(at(1.5, toggle.x, toggle.y))).toBe('green');

    // Zoomed 2x from the top-left corner, output point p shows what sat at p/2 in full frame:
    // a point that is empty page at full frame becomes the card's blank right edge.
    const edge = { x: boxes['#card']!.x + boxes['#card']!.width * 0.9, y: center(boxes['#card']!).y };
    expect(dominant(at(0.9, edge.x * 2, edge.y * 2))).toBe('black');
    expect(dominant(at(3.4, edge.x * 2, edge.y * 2))).toBe('gray');
  }, 120_000);
});

async function layout(url: string, selectors: string[]) {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: deviceProfile('desktop').viewport });
    await page.goto(url);
    return Object.fromEntries(await Promise.all(selectors.map(async s => [s, (await page.locator(s).boundingBox())!] as const)));
  } finally {
    await browser.close();
  }
}

function center(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function pixel(file: string, time: number, x: number, y: number): [number, number, number] {
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', file, '-frames:v', '1',
    '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [rgb[0]!, rgb[1]!, rgb[2]!];
}

function dominant([r, g, b]: [number, number, number]): string {
  if (r < 40 && g < 40 && b < 40) return 'black';
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 'gray';
  if (b > r + 80 && b > g + 80) return 'blue';
  if (g > r + 80 && g > b + 80) return 'green';
  if (r > g + 80 && r > b + 80) return 'red';
  return `rgb(${r},${g},${b})`;
}

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { captureTour } from './capture.ts';
import { installClock } from './clock.ts';
import { deviceProfile } from './devices.ts';
import { layoutLabel } from '../effects/label.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const fixture = (name: string) => pathToFileURL(path.join(ROOT, 'tests/fixtures', name, 'index.html')).href;

// One browser for the whole file, launched in a hook: under parallel suites, launching and
// closing Chrome took up to 11s and 9s, and paying that twice inside a test ate its budget.
let dir: string;
let browser: Browser;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'capture-'));
  browser = await chromium.launch({ channel: 'chrome' });
});
afterAll(async () => {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
});

describe('virtual clock', () => {
  // A fresh context per run: each one gets its own page clock.
  async function positions(delay: () => number) {
    const context = await browser.newContext({ viewport: { width: 800, height: 300 } });
    try {
      const page = await context.newPage();
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
      await context.close();
    }
  }

  it('makes JS and CSS animations depend on video time, not capture speed', async () => {
    const fast = await positions(() => 0);
    const slow = await positions(() => Math.random() * 120);
    for (const [i, sample] of fast.entries()) {
      for (const [id, x] of Object.entries(sample)) expect(Math.abs(x - slow[i]![id]!), `${id} at sample ${i}`).toBeLessThanOrEqual(4);
    }
    // At 1s the rAF box and the looping animation moved 200px; the 1s transition fired
    // at 0.5s is halfway. rAF ticks every 16ms, so it may trail by one tick.
    const [raf, transition, keyframes] = ['raf', 'transition', 'keyframes'].map(id => fast[3]![id]!);
    expect(Math.abs(raf! - 200)).toBeLessThan(5);
    expect(Math.abs(transition! - 200)).toBeLessThan(5);
    expect(Math.abs(keyframes! - 200)).toBeLessThan(5);
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

  it('draws the cursor, click circles and highlight rings without blocking clicks', async () => {
    const tour = parseTour(`
title: Fixture
url: ${fixture('app')}
accent: "#00FFFF"
segments:
  - hold: 1.2
    do:
      - goto: ${fixture('app')}
      - hover: { on: "#card", at: 0.8 }
  - hold: 1.3
    do:
      - click: { on: "#toggle", at: 0.2 }
  - hold: 2
    do:
      - highlight: "#card"
  - hold: 1
    do:
      - click: "#row"
  - hold: 1.5
    do:
      - label: { on: "#toggle", text: "Botón nuevo" }
`);
    const file = path.join(dir, 'effects.mp4');
    await captureTour({ root: ROOT, tour, timeline: buildTimeline(tour, []), file, fps: 30 });

    const boxes = await layout(fixture('app'), ['#card', '#toggle', '#row']);
    const card = boxes['#card']!;
    const toggle = boxes['#toggle']!;
    const row = boxes['#row']!;
    const cyan = ([r, g, b]: number[]) => r! < 90 && g! > 170 && b! > 170;
    const white = ([r, g, b]: number[]) => r! > 200 && g! > 200 && b! > 200;

    // The white arrow hangs below-right of its tip, which rests on the last target's center.
    const belowToggleCenter = { x: center(toggle).x + 1, y: center(toggle).y + 2, width: 10, height: 14 };
    expect(count(file, 0.05, belowToggleCenter, white)).toBe(0);
    expect(count(file, 3.2, belowToggleCenter, white)).toBeGreaterThan(20);

    const aroundToggle = { x: center(toggle).x - 40, y: center(toggle).y - 40, width: 80, height: 80 };
    expect(count(file, 1.3, aroundToggle, cyan)).toBe(0);
    expect(count(file, 2.0, aroundToggle, cyan)).toBeGreaterThan(50);
    expect(dominant(pixel(file, 2.0, Math.round((toggle.x + 4) * 1.2), Math.round(center(toggle).y * 1.2)))).toBe('green');

    const leftOfCard = { x: card.x - 14, y: card.y, width: 12, height: card.height };
    expect(count(file, 2.4, leftOfCard, cyan)).toBe(0);
    expect(count(file, 3.2, leftOfCard, cyan)).toBeGreaterThan(20);

    // A wide element with short text is aimed at its text, not at its geometric center.
    const rowText = { x: row.x, y: row.y - 30, width: 80, height: row.height + 60 };
    const rowCenter = { x: center(row).x - 40, y: row.y - 30, width: 80, height: row.height + 60 };
    expect(count(file, 4.9, rowText, cyan)).toBeGreaterThan(30);
    expect(count(file, 4.9, rowCenter, cyan)).toBe(0);

    // The label's bubble lands where the pure layout says, filled with the accent.
    const { bubble } = layoutLabel(toggle, 'Botón nuevo', deviceProfile('desktop').viewport);
    const inner = { x: bubble.x + 4, y: bubble.y + 4, width: bubble.width - 8, height: bubble.height - 8 };
    const area = Math.round(inner.width * 1.2) * Math.round(inner.height * 1.2);
    expect(count(file, 6.4, inner, cyan) / area).toBeGreaterThan(0.5);
    expect(count(file, 4.0, inner, cyan)).toBe(0);
  }, 120_000);
});

async function layout(url: string, selectors: string[]) {
  const context = await browser.newContext({ viewport: deviceProfile('desktop').viewport });
  try {
    const page = await context.newPage();
    await page.goto(url);
    return Object.fromEntries(await Promise.all(selectors.map(async s => [s, (await page.locator(s).boundingBox())!] as const)));
  } finally {
    await context.close();
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

// Counts output pixels matching `match` inside a rect given in CSS pixels at full frame.
function count(file: string, time: number, rect: { x: number; y: number; width: number; height: number }, match: (rgb: number[]) => boolean) {
  const scale = 1920 / deviceProfile('desktop').viewport.width;
  const [x, y, w, h] = [rect.x, rect.y, rect.width, rect.height].map(v => Math.round(v * scale));
  const rgb = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', file, '-frames:v', '1',
    '-vf', `format=rgb24,crop=${w}:${h}:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let matches = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) if (match([rgb[i]!, rgb[i + 1]!, rgb[i + 2]!])) matches++;
  return matches;
}

function dominant([r, g, b]: [number, number, number]): string {
  if (r < 40 && g < 40 && b < 40) return 'black';
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 'gray';
  if (b > r + 80 && b > g + 80) return 'blue';
  if (g > r + 80 && g > b + 80) return 'green';
  if (r > g + 80 && r > b + 80) return 'red';
  return `rgb(${r},${g},${b})`;
}

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { continueTyping, perform, retrackMarks } from './actions.ts';
import { installClock } from './clock.ts';
import { deviceProfile } from './devices.ts';
import { prepareTargets } from './prep.ts';
import { effectsLayer, scrollControl } from './runtime.ts';
import { dueActions, frameCount } from './schedule.ts';
import { applyScrolls } from './scroll.ts';
import { createStage, type Stage } from './stage.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const url = pathToFileURL(path.join(ROOT, 'tests/fixtures/scroll/index.html')).href;
const device = { ...deviceProfile('desktop'), deviceScaleFactor: 1 };
let browser: Awaited<ReturnType<typeof chromium.launch>>;
beforeAll(async () => { browser = await chromium.launch({ channel: 'chrome' }); });
afterAll(async () => { await browser.close(); });

// The capture loop without screenshots: enough to watch scroll positions frame by frame.
async function run(yaml: string, probe: (page: Page) => Promise<number>, base = url) {
  const tour = parseTour(`title: Scroll\nurl: ${base}\n${yaml}`);
  const timeline = buildTimeline(tour, []);
  const page = await browser.newPage({ viewport: device.viewport });
  const clock = await installClock(page);
  await page.addInitScript(effectsLayer);
  await page.addInitScript(scrollControl);
  const stage: Stage = createStage(page, clock, tour, device, timeline);
  const samples: number[] = [];
  let previous = -Infinity;
  for (let frame = 0; frame < frameCount(timeline.duration, 30); frame++) {
    stage.time = frame / 30;
    await prepareTargets(stage);
    for (const action of dueActions(timeline.actions, previous, stage.time)) await perform(stage, action, 0);
    await continueTyping(stage);
    if (await applyScrolls(page, stage.scrolls, previous, stage.time)) await retrackMarks(stage);
    previous = stage.time;
    samples.push(await probe(page));
    await clock.advance(1000 / 30);
  }
  return { samples, stage, page };
}

// No frame may cover more than a slice of the whole trip: a jump would show as one big step.
const largestStepShare = (samples: number[]) => {
  const steps = samples.slice(1).map((value, i) => Math.abs(value - samples[i]!));
  const travelled = steps.reduce((sum, step) => sum + step, 0);
  return Math.max(...steps) / travelled;
};

describe('smooth scrolling', () => {
  it('scrolls a far target into view before its action, smoothly, and keeps the ring on it', async () => {
    const { samples, stage, page } = await run(`segments:
  - hold: 3.5
    do:
      - goto: ${url}
      - highlight: { on: "#far", at: 2 }
`, page => page.evaluate(() => scrollY));

    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBeGreaterThan(1300);
    expect(samples[Math.round(2 * 30)]).toBe(samples.at(-1));
    expect(largestStepShare(samples)).toBeLessThan(0.12);
    const box = (await page.locator('#far').boundingBox())!;
    expect(stage.effects.rings[0]!.rect.y).toBeCloseTo(box.y, 0);
    expect(box.y + box.height).toBeLessThan(device.viewport.height);
    await page.close();
  }, 60_000);

  it('scrolls a horizontal container to bring a clicked item in, and aims the cursor at its new place', async () => {
    const { samples, stage, page } = await run(`segments:
  - hold: 3
    do:
      - goto: ${url}
      - click: { on: "#item-10", at: 2 }
`, page => page.evaluate(() => document.getElementById('lane')!.scrollLeft));

    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBeGreaterThan(1300);
    expect(largestStepShare(samples)).toBeLessThan(0.12);
    const box = (await page.locator('#item-10').boundingBox())!;
    const landed = stage.effects.moves.at(-1)!.to;
    expect(landed.x).toBeGreaterThan(box.x);
    expect(landed.x).toBeLessThan(box.x + box.width);
    await page.close();
  }, 60_000);

  it('runs explicit scrolls to an edge of the page or of a container', async () => {
    const { samples, page } = await run(`segments:
  - hold: 4
    do:
      - goto: ${url}
      - scroll: { to: bottom, at: 0.5 }
      - scroll: { to: "#item-6", within: "#lane", at: 0.5 }
      - scroll: { to: top, at: 2.5, duration: 0.6 }
`, page => page.evaluate(() => scrollY));

    expect(Math.max(...samples)).toBe(3000 - device.viewport.height);
    expect(samples.at(-1)).toBe(0);
    expect(largestStepShare(samples)).toBeLessThan(0.12);
    expect(await page.evaluate(() => document.getElementById('lane')!.scrollLeft)).toBeGreaterThan(900);
    await page.close();
  }, 60_000);
});

describe('waiting for the next screen', () => {
  const waitUrl = pathToFileURL(path.join(ROOT, 'tests/fixtures/wait/index.html')).href;
  const loaded = (page: Page) => page.locator('#loaded').count();

  it('holds the video after a click until the awaited element shows', async () => {
    const { samples, page } = await run(`segments:
  - hold: 2
    do:
      - goto: ${waitUrl}
      - click: { on: "#load", at: 0.5, wait: "#loaded" }
`, loaded, waitUrl);
    // The 1.2s the app took happened off the video clock: the element is there on the very
    // frame of the click, not 1.2s of video later.
    expect(samples[Math.round(0.5 * 30)]).toBe(1);
    expect(samples[Math.round(0.5 * 30) - 1]).toBe(0);
    await page.close();
  }, 60_000);

  it('waits the same way as an action of its own', async () => {
    const { samples, page } = await run(`segments:
  - hold: 2
    do:
      - goto: ${waitUrl}
      - click: { on: "#load", at: 0.5 }
      - wait: { until: "#loaded", at: 0.6 }
`, loaded, waitUrl);
    expect(samples[Math.round(0.6 * 30)]).toBe(1);
    expect(samples[Math.round(0.6 * 30) - 1]).toBe(0);
    await page.close();
  }, 60_000);
});

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flowScene } from '../flow/scene.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { overlayFile, overlayUrl, renderOverlays, TEMPLATES_DIR } from './render.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tourDir = path.join(ROOT, 'tests/fixtures/overlay');
const canvas = { width: 1920, height: 1080 };
let dir: string;
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
  dir = await mkdtemp(path.join(tmpdir(), 'templates-'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-frames:v', '1', path.join(dir, 'before.png')]);
});
afterAll(async () => {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
});

const templates: [string, Record<string, string>][] = [
  ['lower-third.html', { title: 'uws-tasks', subtitle: 'Recorrido' }],
  ['title-card.html', { eyebrow: 'Entrega', title: 'Semana 38', subtitle: 'Lo nuevo' }],
  ['outro.html', { title: 'Gracias', url: 'uws-tasks.vercel.app' }],
  ['chapter.html', { index: '2', total: '6', label: 'Board', position: 'top-left' }],
  ['shortcut.html', { keys: '⌘ + K', label: 'Buscar' }],
  ['compare.html', { before: 'before.png', after: 'before.png' }],
];

describe('overlay templates', () => {
  it('fill their params, take the tour accent and load images from the tour folder', async () => {
    const context = await browser.newContext({ viewport: canvas });
    try {
      const page = await context.newPage();
      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'chapter.html'), tourDir, { index: '2', total: '6', label: 'Board', position: 'top-left' }, '#00AA88'));
      expect(await page.locator('.pill').innerText()).toMatch(/2\s*\/\s*6\s*Board/);
      expect(await page.locator('.pill').getAttribute('class')).toContain('top-left');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#00AA88');

      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'shortcut.html'), tourDir, { keys: '⌘ + K' }));
      expect(await page.locator('kbd').allInnerTexts()).toEqual(['⌘', 'K']);

      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'compare.html'), dir, { before: 'before.png', after: 'before.png' }));
      await page.waitForFunction(() => [...document.images].every(image => image.complete));
      expect(await page.evaluate(() => [...document.images].map(image => image.naturalWidth))).toEqual([64, 64]);
      expect(await page.locator('figcaption').allInnerTexts()).toEqual(['Antes', 'Después']);
    } finally {
      await context.close();
    }
  }, 60_000);

  it('render with a transparent background and something visible on it', async () => {
    const yaml = templates.map(([src, params]) => `  - hold: 1.2\n    overlays: [{ src: ${src}, fade: 0, params: ${JSON.stringify(params)} }]`).join('\n');
    const tour = parseTour(`title: Templates\nurl: https://example.com\nsegments:\n${yaml}\n`);
    const timeline = buildTimeline(tour, []);
    await renderOverlays({ overlays: timeline.overlays, tourDir: dir, outDir: dir, canvas, output: { width: 480, height: 270 }, fps: 10 });

    for (const [index, [src]] of templates.entries()) {
      const rgba = execFileSync('ffmpeg', ['-v', 'error', '-sseof', '-0.1', '-i', path.join(dir, overlayFile(index)), '-frames:v', '1',
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
      let opaque = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! > 200) opaque++;
      const share = opaque / (rgba.length / 4);
      expect(share, src).toBeGreaterThan(0.005);
      if (src === 'lower-third.html' || src === 'chapter.html' || src === 'shortcut.html') expect(share, src).toBeLessThan(0.3);
    }
  }, 120_000);
});

describe('flow template', () => {
  const texts = ['Pick a night', 'Choose a table', 'Pay the deposit', 'Host confirms the table', 'Guest arrives'];
  const linear = {
    shape: 'linear' as const, mode: 'full' as const, title: 'How a booking works',
    steps: texts.map((text, i) => ({ text, time: 1 + i, ...(i === 1 ? { detail: 'Sections, capacity and minimum spend' } : {}) })),
  };
  const decision = {
    shape: 'decision' as const, mode: 'full' as const, title: 'Is there a table?', branches: ['Yes', 'No'] as [string, string],
    steps: [
      { text: 'Request arrives', time: 1 }, { text: 'Tables left?', time: 2 },
      { text: 'Confirm it', time: 3, branch: 0 as const }, { text: 'Take deposit', time: 4, branch: 0 as const },
      { text: 'Waitlist', time: 5, branch: 1 as const },
    ],
  };
  const cycle = { shape: 'cycle' as const, mode: 'full' as const, title: 'Every week', loop: 6.5, steps: linear.steps.slice(0, 4) };
  const lanes = {
    shape: 'lanes' as const, mode: 'full' as const, title: 'Who does what', lanes: ['Guest', 'Venue', 'Host'],
    steps: texts.slice(0, 4).map((text, i) => ({ text, time: 1 + i, lane: [0, 1, 0, 2][i]! })),
  };
  const compare = {
    shape: 'compare' as const, mode: 'full' as const, title: 'Before and now', branches: ['Before', 'Now'] as [string, string],
    steps: [
      ...texts.slice(0, 4).map((text, i) => ({ text, time: 1 + i, branch: 0 as const })),
      ...texts.slice(0, 2).map((text, i) => ({ text, time: 6 + i, branch: 1 as const })),
    ],
  };
  const mobile = { width: 1080, height: 1920 };

  const cases = [
    ['16:9 full linear', canvas, linear, 5, 4],
    ['9:16 card linear', mobile, { ...linear, mode: 'card' as const }, 5, 4],
    ['16:9 full decision', canvas, decision, 5, 4],
    ['9:16 full decision', mobile, decision, 5, 4],
    ['16:9 full cycle', canvas, cycle, 4, 4],
    ['16:9 card cycle', canvas, { ...cycle, mode: 'card' as const }, 4, 4],
    ['16:9 full lanes', canvas, lanes, 4, 3],
    ['9:16 full lanes', mobile, lanes, 4, 3],
    ['16:9 full compare', canvas, compare, 6, 4],
    ['9:16 card compare', mobile, { ...compare, mode: 'card' as const }, 6, 4],
  ] as const;

  for (const [name, size, flow, boxes, arrows] of cases) {
    it(`${name}: paints every box where the layout says, with no line wider than its box`, async () => {
      const scene = flowScene(flow, 1, size);
      const context = await browser.newContext({ viewport: size });
      try {
        const page = await context.newPage();
        await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'flow.html'), tourDir, { scene: JSON.stringify(scene) }));
        // Measured at rest: the entrance scales each box a little.
        await page.evaluate(async () => { await document.fonts.ready; for (const animation of document.getAnimations()) animation.finish(); });
        const painted = await page.evaluate(() => [...document.querySelectorAll('.box')].map(box => {
          const rect = box.getBoundingClientRect();
          const lines = [...box.querySelectorAll('.text span, .detail span')].map(span => span.getBoundingClientRect());
          return {
            x: rect.x, y: rect.y, height: rect.height,
            overflow: Math.max(0, ...lines.map(line => line.right - rect.right), ...lines.map(line => line.bottom - rect.bottom)),
          };
        }));
        expect(painted).toHaveLength(boxes);
        for (const [i, box] of painted.entries()) {
          expect(box.x, `box ${i + 1}`).toBeCloseTo(scene.layout.boxes[i]!.rect.x, 0);
          expect(box.y, `box ${i + 1}`).toBeCloseTo(scene.layout.boxes[i]!.rect.y, 0);
          expect(box.height).toBeCloseTo(scene.layout.boxes[i]!.rect.height, 0);
          expect(box.overflow, `box ${i + 1} overflows`).toBe(0);
        }
        expect(await page.locator('svg path.arrow').count()).toBe(arrows * 2);
        expect(await page.locator('svg path.ring').count()).toBe(boxes + (flow.shape === 'cycle' ? 1 : 0));
        expect(await page.locator('.tag').allInnerTexts()).toEqual(flow.shape === 'decision' ? ['Yes', 'No'] : []);
        const labels = flow.shape === 'lanes' ? flow.lanes : flow.shape === 'compare' ? flow.branches : [];
        expect(await page.locator('.group-label').allInnerTexts()).toEqual(labels);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});

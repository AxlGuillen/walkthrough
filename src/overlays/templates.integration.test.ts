import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chartScene, type BarScene, type CompareScene } from '../charts/layout.ts';
import { chartSchema } from '../charts/schema.ts';
import { codeScene } from '../code/layout.ts';
import { codeSchema } from '../code/schema.ts';
import { flowScene } from '../flow/scene.ts';
import { tableScene } from '../table/layout.ts';
import { tableSchema } from '../table/schema.ts';
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
      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'chapter.html'), tourDir, { index: '2', total: '6', label: 'Board', position: 'top-left' }, { accent: '#00AA88' }));
      expect(await page.locator('.pill').innerText()).toMatch(/2\s*\/\s*6\s*Board/);
      expect(await page.locator('.pill').getAttribute('class')).toContain('top-left');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#00AA88');
      const onAccent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim());
      expect(await onAccent()).toBe('#ffffff');
      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'chapter.html'), tourDir, { index: '1', total: '2' }, { accent: '#D9F24A' }));
      expect(await onAccent()).toBe('#111111');

      await page.goto(overlayUrl(path.join(ROOT, 'tests/fixtures/overlay/seek.html'), tourDir,
        { beats: JSON.stringify({ go: 1.5 }), data: JSON.stringify({ rows: [1, 2] }) }, { theme: 'light' }));
      expect(await page.evaluate(() => [document.documentElement.dataset.theme, window.walkthrough?.beat('go'), document.body.dataset.data]))
        .toEqual(['light', 1.5, '{"rows":[1,2]}']);
      // The counter is painted at its start, formatted for the language (es by default).
      await page.evaluate(() => window.__walkthroughSeek?.(3));
      expect(await page.locator('#n').innerText()).toBe('1,500');

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

describe('title templates', () => {
  const open = async (file: string, params: Record<string, string>, look = {}) => {
    const context = await browser.newContext({ viewport: canvas });
    const page = await context.newPage();
    await page.goto(overlayUrl(path.join(TEMPLATES_DIR, file), tourDir, { duration: '5', ...params }, { accent: '#C8633A', ...look }));
    await page.evaluate(() => document.fonts.ready);
    const at = async (t: number) => {
      await page.evaluate(time => window.__walkthroughSeek?.(time), t);
      return page.evaluate(() => {
        const opacity = (selector: string) => Number(getComputedStyle(document.querySelector(selector)!).opacity);
        const chars = [...document.querySelectorAll('.title .char')];
        const shown = chars.filter(c => Number(getComputedStyle(c).opacity) > 0.9).length;
        return { chars: chars.length, shown, block: opacity('.block > .title'), body: document.body.className };
      });
    };
    return { page, context, at };
  };

  for (const style of ['kinetic', 'over-app', 'brand']) {
    it(`${style} opening: the title lands on its beat and leaves on "out"`, async () => {
      const { page, context, at } = await open('opening.html', { title: 'Sunset Shores', subtitle: 'A guided overview', style, beats: JSON.stringify({ title: 1, out: 3.5 }) });
      try {
        const before = await at(0.9);
        expect(before.body).toContain(`style-${style}`);
        expect(before.chars).toBeGreaterThan(10);
        expect(before.shown).toBe(0);
        expect((await at(2.8)).shown).toBe(before.chars);
        expect((await at(4.8)).block).toBe(0);
        if (style === 'brand') expect(await page.locator('.monogram').innerText()).toBe('S');
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  it('closing and chapter cards show their url and index, and the chapter leaves', async () => {
    const closing = await open('closing.html', { title: 'Gracias', url: 'axl13.dev' });
    try {
      await closing.at(3);
      expect(Number(await closing.page.locator('.url').evaluate(el => getComputedStyle(el).opacity))).toBe(1);
    } finally {
      await closing.context.close();
    }
    const chapter = await open('chapter-card.html', { index: '2', total: '5', title: 'Reservas' });
    try {
      expect((await chapter.page.locator('.index').innerText()).replace(/\s+/g, '')).toBe('02/05');
      expect((await chapter.at(2)).shown).toBe((await chapter.at(2)).chars);
      expect((await chapter.at(4.9)).block).toBe(0);
    } finally {
      await chapter.context.close();
    }
  }, 60_000);

  it('writes accent text in ink when a light accent meets the light theme', async () => {
    const { page, context } = await open('opening.html', { title: 'Hola', eyebrow: 'UrVenue' }, { accent: '#D9F24A', theme: 'light' });
    try {
      expect(await page.locator('.eyebrow').evaluate(el => getComputedStyle(el).color)).toBe('rgb(17, 18, 17)');
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe('chart template', () => {
  const show = async (data: unknown, size = canvas) => {
    const scene = chartScene(chartSchema.parse(data), size, 'es');
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'chart.html'), tourDir, { duration: '6', scene: JSON.stringify(scene) }, { lang: 'es' }));
    await page.evaluate(() => window.__walkthroughSeek?.(5.9));
    return { scene, page, context };
  };

  it('grows every bar to its place and ends each count on the formatted value', async () => {
    const { scene, page, context } = await show({ type: 'bar', unit: 'min', series: [{ label: 'Lun', value: 42 }, { label: 'Sáb', value: 163 }], highlight: 'Sáb' });
    try {
      const bars = scene as BarScene;
      const drawn = await page.evaluate(() => [...document.querySelectorAll('rect.bar')].map(r => [Number(r.getAttribute('y')), Number(r.getAttribute('height')), r.classList.contains('lead')]));
      bars.bars.forEach((bar, i) => {
        expect(drawn[i]![0]).toBeCloseTo(bar.rect.y, 1);
        expect(drawn[i]![1]).toBeCloseTo(bar.rect.height, 1);
        expect(drawn[i]![2]).toBe(bar.highlight);
      });
      expect(await page.locator('.value').allInnerTexts()).toEqual(bars.bars.map(b => b.value.text));
    } finally {
      await context.close();
    }
  }, 60_000);

  it('counts both sides of a comparison and shows the change', async () => {
    const { scene, page, context } = await show({ type: 'compare', unit: 'min', before: { label: 'Antes', value: 45 }, after: { label: 'Ahora', value: 3 } }, { width: 1080, height: 1920 });
    try {
      const compare = scene as CompareScene;
      expect(await page.locator('.value').allInnerTexts()).toEqual([compare.before.value.text, compare.after.value.text]);
      expect(await page.locator('.change').innerText()).toBe('−93%');
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe('code template', () => {
  it('types a command character by character and lights its highlight with the note in the bar', async () => {
    const scene = codeScene(codeSchema.parse({ view: 'terminal', code: '$ bun test\nall green', highlight: [{ lines: 2, note: 'Pasa todo', at: 3 }] }), canvas, 'es', { h0: 3 });
    const context = await browser.newContext({ viewport: canvas });
    try {
      const page = await context.newPage();
      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'code.html'), tourDir, { duration: '5', scene: JSON.stringify(scene) }));
      const clip = (t: number) => page.evaluate(time => {
        window.__walkthroughSeek?.(time);
        return (document.querySelector('.row.command .text') as HTMLElement).style.clipPath;
      }, t);
      // "bun test" is 8 characters typed at 22 per second from 0.6s.
      expect(await clip(0.5)).toBe('inset(0px 8ch 0px 0px)');
      expect(await clip(0.6 + 4 / 22 + 0.01)).toBe('inset(0px 4ch 0px 0px)');
      expect(await clip(2)).toBe('inset(0px 0ch 0px 0px)');
      await page.evaluate(() => window.__walkthroughSeek?.(4.5));
      expect(Number(await page.locator('.band').evaluate(el => getComputedStyle(el).opacity))).toBe(1);
      expect(await page.locator('.bar .note').innerText()).toBe('Pasa todo');
      expect(await page.locator('.row.command .function').innerText()).toBe('bun');
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe('table template', () => {
  it('shows each row on its beat and draws its marks', async () => {
    const table = tableSchema.parse({ columns: ['Antes', 'Ahora'], highlight: 'Ahora', rows: [{ label: 'En línea', values: [false, true] }, { label: 'Tiempo', values: ['45 min', '3 min'], at: 2 }] });
    const scene = tableScene(table, canvas, 'es', { r1: 2 });
    const context = await browser.newContext({ viewport: canvas });
    try {
      const page = await context.newPage();
      await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'table.html'), tourDir, { duration: '4', scene: JSON.stringify(scene) }));
      const shown = (t: number) => page.evaluate(time => {
        window.__walkthroughSeek?.(time);
        return [...document.querySelectorAll('.label')].map(el => Number(getComputedStyle(el).opacity));
      }, t);
      expect(await shown(0.2)).toEqual([0, 0]);
      expect(await shown(1.6)).toEqual([1, 0]);
      expect(await shown(3.5)).toEqual([1, 1]);
      expect(await page.locator('.mark').count()).toBe(3);
      expect(await page.locator('.cell').allInnerTexts()).toEqual(['45 min', '3 min']);
      expect(await page.locator('.column.lead').innerText()).toBe('Ahora');
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe('emojis in templates', () => {
  it('load from the vendored set in the tour\'s style', async () => {
    const context = await browser.newContext({ viewport: canvas });
    try {
      const page = await context.newPage();
      const src = async (emojiStyle?: string) => {
        await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'sticker.html'), tourDir, { duration: '3', emoji: 'rocket', text: 'Go' }, emojiStyle ? { emojiStyle } : {}));
        await page.waitForFunction(() => document.querySelector('img')!.complete);
        return page.evaluate(() => { const img = document.querySelector('img')!; return [img.src.split('/').pop(), img.naturalWidth > 0]; });
      };
      expect(await src()).toEqual(['rocket.svg', true]);
      expect(await src('3d')).toEqual(['rocket.3d.png', true]);
    } finally {
      await context.close();
    }
  }, 60_000);
});


import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { chartBeats, chartScene, seriesTimes, type BarScene, type CompareScene, type LineScene } from './layout.ts';
import { chartSchema } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const inside = (r: Rect, c: { width: number; height: number }) => r.x >= 0 && r.y >= 0 && r.x + r.width <= c.width + 0.5 && r.y + r.height <= c.height + 0.5;
const bars = chartSchema.parse({ type: 'bar', title: 'Reservas', series: [{ label: 'Lun', value: 40, at: 'lunes' }, { label: 'Mar', value: 80 }, { label: 'Mié', value: 163 }], highlight: 'Mié' });

describe('chartScene', () => {
  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const mode of ['full', 'card'] as const) {
      it(`${name} ${mode}: bars stand on one baseline, as tall as their values, inside the frame`, () => {
        const scene = chartScene({ ...bars, mode }, canvas, 'es') as BarScene;
        const base = scene.bars[0]!.rect.y + scene.bars[0]!.rect.height;
        for (const bar of scene.bars) {
          expect(bar.rect.y + bar.rect.height).toBeCloseTo(base);
          expect(inside(bar.rect, canvas)).toBe(true);
        }
        // 163 on a 0-200 axis: 81.5% of the plot, and twice as tall as 80 is not.
        expect(scene.bars[2]!.rect.height / scene.plot.height).toBeCloseTo(163 / 200);
        expect(scene.bars[1]!.rect.height / scene.bars[0]!.rect.height).toBeCloseTo(2);
        expect(scene.bars.map(b => b.highlight)).toEqual([false, false, true]);
        if (scene.panel) expect(inside(scene.panel, canvas)).toBe(true);
      });
    }
  }

  it('draws a line to each point in proportion to its length along the line', () => {
    const scene = chartScene(chartSchema.parse({ type: 'line', series: [{ label: 'a', value: 1 }, { label: 'b', value: 5 }, { label: 'c', value: 5 }] }), desktop, 'es') as LineScene;
    const fractions = scene.points.map(p => p.fraction);
    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBeCloseTo(1);
    expect(fractions[1]!).toBeGreaterThan(0.5);
    expect(scene.line.startsWith('M')).toBe(true);
    expect(scene.area.endsWith('Z')).toBe(true);
  });

  it('formats a donut, a stat and a comparison, with the change between the two', () => {
    const donut = chartScene(chartSchema.parse({ type: 'donut', label: 'Ocupación', value: 34, total: 50 }), desktop, 'es');
    expect(donut).toMatchObject({ type: 'donut', fraction: 0.68, value: { text: '34' } });
    const stat = chartScene(chartSchema.parse({ type: 'stat', label: 'reservas', value: 1284, from: 900 }), mobile, 'es');
    expect(stat).toMatchObject({ value: { text: '1,284' }, count: { from: 900, to: 1284, suffix: '' } });
    const compare = chartScene(chartSchema.parse({ type: 'compare', unit: 'min', before: { label: 'Antes', value: 45 }, after: { label: 'Ahora', value: 3 } }), desktop, 'es') as CompareScene;
    expect([compare.before.value.text, compare.after.value.text, compare.change.text]).toEqual(['45 min', '3 min', '−93%']);
    expect(compare.after.value.x).toBeGreaterThan(compare.before.value.x);
  });

  it('cuts labels that do not fit their slot, and says which', () => {
    const series = Array.from({ length: 12 }, (_, i) => ({ label: `Semana número ${i + 1}`, value: i + 1 }));
    const scene = chartScene(chartSchema.parse({ type: 'bar', mode: 'card', series }), desktop, 'es') as BarScene;
    expect(scene.truncated.length).toBeGreaterThan(0);
    expect(scene.bars[0]!.label.text.endsWith('…')).toBe(true);
  });
});

describe('seriesTimes', () => {
  it('puts anchored points on their beats and spreads the rest between them, in order', () => {
    expect(seriesTimes(4, {})).toEqual([0.5, 0.8, 1.1, 1.4]);
    expect(seriesTimes(4, { p0: 2, p3: 5 })).toEqual([2, 3, 4, 5]);
    const trailing = seriesTimes(3, { p0: 2 });
    expect(trailing[1]!).toBeGreaterThan(2);
    expect(trailing[2]!).toBeGreaterThan(trailing[1]!);
  });
});

describe('chartBeats', () => {
  it('names the beat of each part that has a word', () => {
    expect(chartBeats(bars)).toEqual({ p0: 'lunes' });
    expect(chartBeats(chartSchema.parse({ type: 'compare', before: { label: 'a', value: 1, at: 'antes' }, after: { label: 'b', value: 2, at: 'ahora' } }))).toEqual({ before: 'antes', after: 'ahora' });
  });
});

describe('chartSchema', () => {
  it('refuses data that cannot be drawn', () => {
    expect(chartSchema.safeParse({ type: 'donut', label: 'x', value: 120, total: 100 }).success).toBe(false);
    expect(chartSchema.safeParse({ type: 'bar', series: [{ label: 'a', value: 1 }], highlight: 'b' }).success).toBe(false);
    expect(chartSchema.safeParse({ type: 'pie', series: [] }).success).toBe(false);
  });
});

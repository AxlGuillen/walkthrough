import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { tableBeats, tableScene } from './layout.ts';
import { tableSchema } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const inside = (r: Rect, c: { width: number; height: number }) => r.x >= 0 && r.y >= 0 && r.x + r.width <= c.width + 0.5 && r.y + r.height <= c.height + 0.5;
const plans = tableSchema.parse({
  title: 'Planes',
  columns: ['Básico', 'Pro', 'Equipo'],
  highlight: 'Pro',
  rows: [
    { label: 'Tours ilimitados', values: [false, true, true], at: 'tours' },
    { label: 'Marca propia', values: ['no', 'partial', 'yes'], emoji: 'sparkles' },
    { label: 'Precio', values: ['$0', '$12', 24] },
  ],
});

describe('tableSchema', () => {
  it('reads yes, no and partial from booleans and words, and keeps the rest as text', () => {
    expect(plans.rows.map(r => r.values)).toEqual([['no', 'yes', 'yes'], ['no', 'partial', 'yes'], ['$0', '$12', '24']]);
  });

  it('rejects rows that do not match the columns and a highlight that is not a column', () => {
    expect(tableSchema.safeParse({ columns: ['a', 'b'], rows: [{ label: 'x', values: [true] }] }).success).toBe(false);
    expect(tableSchema.safeParse({ columns: ['a'], highlight: 'z', rows: [{ label: 'x', values: [true] }] }).success).toBe(false);
  });
});

describe('tableScene', () => {
  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const mode of ['full', 'card'] as const) {
      it(`${name} ${mode}: rows stack under the header, inside the frame, cells centered in their column`, () => {
        const scene = tableScene({ ...plans, mode }, canvas, 'es');
        expect(inside(scene.frame, canvas)).toBe(true);
        if (scene.panel) expect(inside(scene.panel, canvas)).toBe(true);
        scene.rows.forEach((row, i) => {
          expect(row.rect.y).toBeCloseTo(scene.header.rect.y + scene.header.rect.height + row.rect.height * i);
          row.cells.forEach((cell, c) => expect(cell.x).toBeCloseTo(scene.header.labels[c]!.x));
        });
        const last = scene.rows.at(-1)!.rect;
        expect(last.y + last.height).toBeCloseTo(scene.frame.y + scene.frame.height);
        expect(scene.warnings).toEqual([]);
      });
    }
  }

  it('bands the highlighted column from header to last row', () => {
    const scene = tableScene(plans, desktop, 'es');
    expect(scene.highlight).toBe(1);
    expect(scene.band!.x + scene.band!.width / 2).toBeCloseTo(scene.header.labels[1]!.x);
    expect(scene.band!.height).toBeCloseTo(scene.frame.height);
  });

  it('puts anchored rows on their beats and the rest after them, in order', () => {
    expect(tableBeats(plans)).toEqual({ r0: 'tours' });
    const times = tableScene(plans, desktop, 'es', { r0: 1.5 }).rows.map(r => r.time);
    expect(times[0]).toBe(1.5);
    expect(times[1]!).toBeGreaterThan(1.5);
    expect(times[2]!).toBeGreaterThan(times[1]!);
  });

  it('warns about too many columns for 9:16 and text too long for its cell', () => {
    const wide = tableSchema.parse({ columns: ['A', 'B', 'C', 'D'], rows: [{ label: 'x', values: [1, 2, 3, 'un texto bastante largo'] }] });
    const [landscape, portrait] = [desktop, mobile].map(canvas => tableScene(wide, canvas, 'es').warnings);
    expect(landscape).toEqual(['"un texto bastante largo" is too long for its cell']);
    expect(portrait!.some(w => w.includes('too many for 9:16'))).toBe(true);
  });
});

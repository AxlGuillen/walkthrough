import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { boardBeats, boardScene, writeTime } from './layout.ts';
import { boardSchema } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const inside = (r: Rect, c: { width: number; height: number }) => r.x >= 0 && r.y >= 0 && r.x + r.width <= c.width + 0.5 && r.y + r.height <= c.height + 0.5;
const week = boardSchema.parse({
  title: 'Pendientes',
  items: [
    { text: 'Nómina por corte', at: 'nómina', done: 'listo' },
    { text: 'Mi perfil' },
    { text: 'Filtro Vencida' },
  ],
});

describe('boardSchema', () => {
  it('writes in chalk by default and takes up to seven items', () => {
    expect(week.style).toBe('chalk');
    expect(boardSchema.safeParse({ items: Array.from({ length: 8 }, () => ({ text: 'x' })) }).success).toBe(false);
  });
});

describe('boardScene', () => {
  it('lifts the word of each item and of each cross-out into beats', () => {
    expect(boardBeats(week)).toEqual({ i0: 'nómina', d0: 'listo' });
  });

  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    it(`${name}: keeps the board, its ledge and every item inside the frame, in order`, () => {
      const scene = boardScene(week, canvas, 'es', { i0: 1.2, d0: 6 }, 9);
      expect(inside(scene.board, canvas) && inside(scene.tray, canvas)).toBe(true);
      expect(scene.tray.y).toBeGreaterThan(scene.board.y + scene.board.height);
      const ys = scene.items.map(item => item.y);
      expect(ys).toEqual([...ys].sort((a, b) => a - b));
      expect(ys.at(-1)!).toBeLessThan(scene.board.y + scene.board.height);
      expect(scene.warnings).toEqual([]);
    });
  }

  it('writes each item at a hand\'s pace and spreads the ones without a word', () => {
    const scene = boardScene(week, desktop, 'es', { i0: 1.2 }, 9);
    expect(scene.items[0]!.time).toBe(1.2);
    expect(scene.items[0]!.write).toBe(writeTime('Nómina por corte'));
    expect(scene.items[1]!.time).toBeGreaterThan(scene.items[0]!.time);
  });

  it('warns when an item is crossed out before it is written, and crosses it out after', () => {
    const scene = boardScene(week, desktop, 'es', { i0: 1.2, d0: 1.4 }, 9);
    expect(scene.warnings.join()).toMatch(/crossed out before it is written/);
    expect(scene.items[0]!.done).toBeGreaterThan(1.2 + scene.items[0]!.write);
  });

  it('warns about text too long for the board and items written on top of each other', () => {
    const crowded = boardSchema.parse({ items: [{ text: 'Una tarea con un nombre larguísimo de verdad', at: 1 }, { text: 'Otra', at: 1.3 }] });
    const warnings = boardScene(crowded, mobile, 'es', { i0: 1, i1: 1.3 }, 9).warnings.join('\n');
    expect(warnings).toMatch(/too long for the board/);
    expect(warnings).toMatch(/still being written/);
  });

  it('warns when the board leaves before the last item is written', () => {
    expect(boardScene(week, desktop, 'es', {}, 3).warnings.join()).toMatch(/last item/);
  });
});

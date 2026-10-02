import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { corkboardBeats, corkboardScene, lineCount } from './layout.ts';
import { corkboardSchema } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const inside = (r: Rect, outer: Rect) => r.x >= outer.x - 0.5 && r.y >= outer.y - 0.5 && r.x + r.width <= outer.x + outer.width + 0.5 && r.y + r.height <= outer.y + outer.height + 0.5;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const ideas = (count: number) => corkboardSchema.parse({
  title: 'Ideas',
  notes: Array.from({ length: count }, (_, i) => ({ text: `Idea número ${i + 1}`, ...(i === 0 ? { at: 'primera' } : {}) })),
});

describe('lineCount', () => {
  it('wraps by words and breaks a word longer than a line', () => {
    expect(lineCount('uno dos tres', 1000, 10)).toBe(1);
    expect(lineCount('uno dos tres', 30, 10)).toBe(3);
    expect(lineCount('larguísima', 30, 10)).toBe(2);
  });
});

describe('corkboardScene', () => {
  it('lifts the word of each note into beats', () => {
    expect(corkboardBeats(ideas(3))).toEqual({ n0: 'primera' });
  });

  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const count of [1, 4, 6]) {
      it(`${name}: ${count} notes sit on the board without touching each other`, () => {
        const scene = corkboardScene(ideas(count), canvas, 'es');
        expect(scene.notes).toHaveLength(count);
        for (const note of scene.notes) expect(inside(note.rect, scene.board)).toBe(true);
        scene.notes.forEach((a, i) => scene.notes.slice(i + 1).forEach(b => expect(overlap(a.rect, b.rect)).toBe(false)));
        expect(scene.warnings).toEqual([]);
      });
    }
  }

  it('gives each position the same tilt and color every time, and lands the notes in order', () => {
    const a = corkboardScene(ideas(4), desktop, 'es', { n0: 1 });
    const b = corkboardScene(ideas(4), desktop, 'es', { n0: 1 });
    expect(a.notes.map(n => [n.tilt, n.color])).toEqual(b.notes.map(n => [n.tilt, n.color]));
    expect(new Set(a.notes.map(n => n.color)).size).toBe(4);
    const times = a.notes.map(n => n.time);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it('warns about a note too long for its paper', () => {
    const long = corkboardSchema.parse({ notes: Array.from({ length: 6 }, () => ({ text: 'Una nota que dice demasiadas cosas a la vez para su papel', detail: 'y además un detalle que tampoco cabe bien' })) });
    expect(corkboardScene(long, mobile, 'es').warnings.join()).toMatch(/does not fit its note/);
  });
});

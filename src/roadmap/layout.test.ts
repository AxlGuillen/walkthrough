import { describe, expect, it } from 'vitest';
import { roadmapBeats, roadmapScene } from './layout.ts';
import { roadmapSchema } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const plan = roadmapSchema.parse({
  title: 'Hacia la versión 2',
  milestones: [
    { date: 'Ene', title: 'Primer tour', detail: 'Grabado a mano', emoji: 'rocket', at: 'tour' },
    { date: 'Mar', title: 'Voz', status: 'now' },
    { date: 'Jun', title: 'Galería', status: 'next' },
  ],
});
const within = (p: { x: number; y: number }, c: { width: number; height: number }) => p.x > 0 && p.y > 0 && p.x < c.width && p.y < c.height;

describe('roadmapScene', () => {
  it('lays milestones left to right on one line in 16:9, and top to bottom on one column in 9:16', () => {
    const wide = roadmapScene(plan, desktop, 'es');
    expect(wide.orientation).toBe('horizontal');
    expect(new Set(wide.milestones.map(m => m.y)).size).toBe(1);
    expect(wide.milestones.map(m => m.x)).toEqual([...wide.milestones.map(m => m.x)].sort((a, b) => a - b));
    const tall = roadmapScene(plan, mobile, 'es');
    expect(tall.orientation).toBe('vertical');
    expect(new Set(tall.milestones.map(m => m.x)).size).toBe(1);
    expect(tall.milestones.every(m => m.dateBox === undefined)).toBe(true);
  });

  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const mode of ['full', 'card'] as const) {
      it(`${name} ${mode}: milestones and their text stay inside the frame, without warnings`, () => {
        const scene = roadmapScene({ ...plan, mode }, canvas, 'es');
        for (const m of scene.milestones) {
          expect(within(m, canvas)).toBe(true);
          expect(m.body.x + (m.body.align === 'center' ? m.body.width / 2 : m.body.width)).toBeLessThanOrEqual(canvas.width);
        }
        if (scene.panel) {
          const { y, height } = scene.panel;
          for (const m of scene.milestones) expect(m.y > y && m.y < y + height).toBe(true);
        }
        expect(scene.warnings).toEqual([]);
      });
    }
  }

  it('draws the line into each milestone as it appears, fainter toward what is next', () => {
    expect(roadmapBeats(plan)).toEqual({ m0: 'tour' });
    const scene = roadmapScene(plan, desktop, 'es', { m0: 1 });
    expect(scene.milestones[0]!.time).toBe(1);
    expect(scene.segments).toHaveLength(2);
    scene.segments.forEach((segment, i) => {
      expect(segment.end).toBe(scene.milestones[i + 1]!.time);
      expect(segment.start).toBeGreaterThanOrEqual(scene.milestones[i]!.time);
    });
    expect(scene.segments.map(s => s.upcoming)).toEqual([false, true]);
  });

  it('warns about long titles, crowded columns and more than one "now"', () => {
    const crowded = roadmapSchema.parse({
      milestones: Array.from({ length: 7 }, (_, i) => ({ title: `Un hito con un nombre largo ${i}`, detail: 'Un detalle que ocupa bastante más de lo que cabe en tan poco espacio', status: i < 2 ? 'now' : 'done' })),
    });
    const warnings = roadmapScene(crowded, desktop, 'es').warnings;
    expect(warnings.some(w => w.includes('more than two lines'))).toBe(true);
    expect(warnings.some(w => w.includes('more than one milestone is "now"'))).toBe(true);
  });
});

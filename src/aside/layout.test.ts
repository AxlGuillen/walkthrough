import { describe, expect, it } from 'vitest';
import { room } from '../stage/plan.ts';
import { asideBeats, asideScene, titleRuns } from './layout.ts';
import { asideSchema } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const aside = asideSchema.parse({
  eyebrow: 'The camera',
  title: 'Every frame is *placed*, not recorded',
  points: [{ text: 'A virtual camera', emoji: 'eyes', at: 'camera' }, { text: 'Smooth scroll' }, { text: 'Marks that follow' }],
});

describe('titleRuns', () => {
  it('sets words between asterisks apart, keeping the rest as is', () => {
    expect(titleRuns('Every frame is *placed* not recorded')).toEqual([
      { text: 'Every frame is ', em: false }, { text: 'placed', em: true }, { text: ' not recorded', em: false },
    ]);
    expect(titleRuns('No emphasis')).toEqual([{ text: 'No emphasis', em: false }]);
  });

  it('keeps an emphasis and the comma or letters touching it on one line', () => {
    expect(titleRuns('Every frame is *placed*, not recorded')).toEqual([
      { text: 'Every frame is ', em: false }, { text: 'placed', em: true }, { text: ',', em: false, glued: true }, { text: ' not recorded', em: false },
    ]);
    expect(titleRuns('A *super*market and *so on* forever')).toEqual([
      { text: 'A ', em: false }, { text: 'super', em: true }, { text: 'market', em: false, glued: true }, { text: ' and ', em: false },
      { text: 'so on', em: true }, { text: ' forever', em: false },
    ]);
    expect(titleRuns('pre*fix*ed')).toEqual([
      { text: 'pre', em: false }, { text: 'fix', em: true, glued: true }, { text: 'ed', em: false, glued: true },
    ]);
  });
});

describe('asideScene', () => {
  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const layout of ['aside-left', 'aside-right'] as const) {
      it(`${layout} in ${name}: fills the room the screen leaves, without warnings`, () => {
        const scene = asideScene({ ...aside, layout }, canvas, 'en', {}, 6);
        expect(scene.box).toEqual(room(layout, canvas));
        expect(scene.align).toBe('left');
        expect(scene.warnings).toEqual([]);
      });
    }
  }

  it('centers a title over an inset screen, larger, and warns about points there', () => {
    const inset = asideScene(asideSchema.parse({ layout: 'inset', title: 'Sunset *Shores*' }), desktop, 'en', {}, 5);
    expect(inset.align).toBe('center');
    expect(inset.font.title).toBeGreaterThan(asideScene(aside, desktop, 'en', {}, 6).font.title);
    expect(asideScene({ ...aside, layout: 'inset' }, desktop, 'en', {}, 6).warnings.some(w => w.includes('inset'))).toBe(true);
  });

  it('brings points in on their beats, the rest after them, and leaves before the overlay ends', () => {
    expect(asideBeats(aside)).toEqual({ p0: 'camera' });
    const scene = asideScene(aside, desktop, 'en', { p0: 2 }, 7);
    expect(scene.points.map(p => p.time)[0]).toBe(2);
    expect(scene.points[2]!.time).toBeGreaterThan(scene.points[1]!.time);
    expect(scene.exit).toBeCloseTo(6.4);
    expect(asideScene(aside, desktop, 'en', { p0: 2 }, 2.5).warnings.some(w => w.includes('too late'))).toBe(true);
  });

  it('shrinks a long title to fit, and warns when even that is not enough', () => {
    const long = asideSchema.parse({ title: 'A title that keeps going and going well past what the room beside the screen can hold' });
    const scene = asideScene(long, desktop, 'en', {}, 6);
    expect(scene.font.title).toBeLessThan(asideScene(aside, desktop, 'en', {}, 6).font.title);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deviceProfile } from '../capture/devices.ts';
import { checkFlows, checkOverlays, checkResources } from '../check/check.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { backdropArgs, catalogShots, describeOverlay } from './catalog.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const file = path.join(ROOT, 'tours/examples/catalogo.yaml');
const tour = parseTour(readFileSync(file, 'utf8'));

describe('the resource catalog', () => {
  it('has no narration, so it renders without calling a voice provider', () => {
    expect(tour.segments.every(segment => segment.say === undefined)).toBe(true);
  });

  for (const device of ['desktop', 'mobile'] as const) {
    it(`${device}: every entry is valid, finds its template and fits the frame`, () => {
      const timeline = buildTimeline({ ...tour, device }, []);
      const canvas = deviceProfile(device).output;
      const items = [...checkOverlays(path.dirname(file), timeline), ...checkFlows(timeline, canvas), ...checkResources(timeline, canvas, tour.language)];
      const problems = items.filter(item => item.status !== 'ok').map(item => `${item.label}: ${item.notes.join('; ')}`);
      expect(problems).toEqual([]);
    });
  }

  it('shows every kind of resource: all title styles, chart types, code views and flow shapes', () => {
    const labels = buildTimeline(tour, []).overlays.map(describeOverlay);
    for (const expected of ['opening · kinetic', 'opening · over-app', 'opening · brand', 'chapter-card · kinetic', 'closing · kinetic',
      'chart · bar', 'chart · line', 'chart · donut', 'chart · stat', 'chart · compare', 'chart · bar (card)',
      'code · editor', 'code · terminal', 'code · diff',
      'flow · linear', 'flow · decision', 'flow · cycle', 'flow · lanes', 'flow · compare', 'flow · linear (card)']) {
      expect(labels).toContain(expected);
    }
  });
});

describe('catalogShots', () => {
  it('takes each still just before the entry ends, or before an opening leaves', () => {
    const overlay = (src: string, beats: Record<string, number> = {}) => ({ src, params: {}, start: 10, end: 15, fade: 0.3, segment: 0, beats });
    expect(catalogShots({ overlays: [overlay('chart.html')] })[0]!.time).toBeCloseTo(14.6);
    expect(catalogShots({ overlays: [overlay('opening.html')] })[0]!.time).toBeCloseTo(13.8);
    expect(catalogShots({ overlays: [overlay('opening.html', { out: 3 })] })[0]!.time).toBeCloseTo(12.6);
    expect(catalogShots({ overlays: [overlay('chart.html'), overlay('chapter.html')] })).toHaveLength(1);
  });
});

describe('backdropArgs', () => {
  it('lays each overlay over a flat backdrop at its time', () => {
    const args = backdropArgs([{ start: 0, end: 2, fade: 0 }, { start: 2, end: 4, fade: 0.3 }], { width: 960, height: 540 }, 15, 4, 'out.mp4');
    expect(args).toContain('color=c=0x5a5a5a:s=960x540:r=15:d=4.000');
    expect(args.filter(a => a.startsWith('overlays/'))).toEqual(['overlays/01.mov', 'overlays/02.mov']);
    expect(args.join(' ')).toContain('setpts=PTS-STARTPTS+2.000/TB');
  });
});

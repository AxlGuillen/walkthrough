import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { room } from '../stage/plan.ts';
import { CHAR_EM, layoutFlow } from './layout.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const TEXTS = ['Pick a night', 'Choose a table', 'Pay the deposit', 'Host confirms', 'Guest arrives', 'Bottle service'];
const steps = (n: number, detail?: string) => TEXTS.slice(0, n).map((text, i) => ({ text, time: i, ...(detail ? { detail } : {}) }));

const inside = (r: Rect, canvas: { width: number; height: number }, margin: number) =>
  r.x >= margin && r.y >= margin && r.x + r.width <= canvas.width - margin && r.y + r.height <= canvas.height - margin;
const contains = (r: Rect, x: number, y: number) => x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const decision = (branchLength: number) => ({
  shape: 'decision' as const,
  steps: [
    { text: 'Request arrives', time: 0 }, { text: 'Tables left?', time: 1 },
    ...Array.from({ length: branchLength }, (_, i) => ({ text: ['Confirm it', 'Take deposit', 'Send QR'][i]!, time: 2 + i, branch: 0 as const })),
    { text: 'Waitlist', time: 9, branch: 1 as const },
  ],
  branches: ['Yes', 'No'] as [string, string],
});
const cycle = (n: number) => ({ shape: 'cycle' as const, steps: steps(n) });
const LANES = ['Huésped', 'Venue', 'Host', 'Sistema'];
const lanes = (n: number, count: number) => ({
  shape: 'lanes' as const, lanes: LANES.slice(0, count),
  steps: steps(n).map((step, i) => ({ ...step, lane: i % count })),
});
const compare = (before: number, after: number) => ({
  shape: 'compare' as const, branches: ['Antes', 'Ahora'] as [string, string],
  steps: [
    ...Array.from({ length: before }, (_, i) => ({ text: `Paso manual ${i + 1}`, time: i, branch: 0 as const })),
    ...Array.from({ length: after }, (_, i) => ({ text: `Paso nuevo ${i + 1}`, time: 10 + i, branch: 1 as const })),
  ],
});
const within = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

describe('layoutFlow shapes', () => {
  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const mode of ['full', 'card'] as const) {
      const cases = [
        ...[1, 2, 3].map(b => [`decision with a ${b}-step branch`, decision(b)] as const),
        ...[3, 4, 5, 6].map(n => [`cycle of ${n}`, cycle(n)] as const),
        ...[[2, 2], [4, 3], [6, 3], [6, 4]].map(([n, count]) => [`${n} steps in ${count} lanes`, lanes(n!, count!)] as const),
        ...[[1, 1], [5, 2], [3, 5], [5, 5]].map(([b, a]) => [`comparison of ${b} and ${a}`, compare(b!, a!)] as const),
      ];
      for (const [label, flow] of cases) {
        it(`${name} ${mode} ${label}: fits on screen, with no box touching another`, () => {
          const layout = layoutFlow({ ...flow, mode, title: 'Title' }, canvas);
          const margin = Math.min(canvas.width, canvas.height) * 0.03;
          for (const [i, box] of layout.boxes.entries()) {
            expect(inside(box.rect, canvas, margin), `box ${i + 1}`).toBe(true);
            for (const other of layout.boxes.slice(i + 1)) expect(overlap(box.rect, other.rect), `box ${i + 1}`).toBe(false);
          }
          for (const arrow of layout.arrows) {
            const [x, y] = arrow.shaft.match(/^M(-?[\d.]+) (-?[\d.]+)/)!.slice(1).map(Number);
            expect(layout.boxes.some(({ rect }) => contains(rect, x!, y!)), 'an arrow starts inside a box').toBe(false);
            if (arrow.tag) expect(inside({ x: arrow.tag.x, y: arrow.tag.y, width: 0, height: 0 }, canvas, margin)).toBe(true);
          }
          expect(layout.title!.y + layout.title!.size).toBeLessThan(Math.min(...layout.boxes.map(b => b.rect.y)));
        });
      }
    }
  }

  it('keeps every lane step inside its own band, in narration order', () => {
    for (const canvas of [desktop, mobile]) {
      const layout = layoutFlow({ ...lanes(5, 3), mode: 'full' }, canvas);
      expect(layout.groups.map(g => g.label)).toEqual(['Huésped', 'Venue', 'Host']);
      layout.boxes.forEach((box, i) => expect(within(box.rect, layout.groups[i % 3]!.rect), `step ${i + 1}`).toBe(true));
      const along = layout.boxes.map(box => (canvas === desktop ? box.rect.x : box.rect.y));
      expect([...along].sort((a, b) => a - b)).toEqual(along);
    }
  });

  it('sets before and after side by side, the before muted and the after in the accent', () => {
    for (const canvas of [desktop, mobile]) {
      const layout = layoutFlow({ ...compare(4, 2), mode: 'full' }, canvas);
      const [before, after] = layout.groups;
      expect(after!.rect.x).toBeGreaterThan(before!.rect.x + before!.rect.width);
      expect([before!.accent, after!.accent]).toEqual([false, true]);
      layout.boxes.forEach((box, i) => expect(within(box.rect, layout.groups[i < 4 ? 0 : 1]!.rect)).toBe(true));
      expect(layout.boxes.map(box => box.muted)).toEqual([true, true, true, true, false, false]);
      expect(layout.boxes.map(box => box.badge)).toEqual(['1', '2', '3', '4', '1', '2']);
      expect(layout.arrows).toHaveLength(4);
    }
  });

  it('puts the branches beyond the question: one above and one below it in a row', () => {
    const layout = layoutFlow({ ...decision(2), mode: 'full' }, desktop);
    const [, question, yes, , no] = layout.boxes.map(box => box.rect);
    expect(yes!.x).toBeGreaterThan(question!.x + question!.width);
    expect(yes!.y + yes!.height).toBeLessThanOrEqual(question!.y + question!.height);
    expect(no!.y).toBeGreaterThan(yes!.y + yes!.height);
    expect(layout.boxes[1]!.kind).toBe('decision');
    expect(layout.arrows.filter(arrow => arrow.tag).map(arrow => arrow.tag!.text)).toEqual(['Yes', 'No']);
  });

  it('lays a full cycle around its middle, and a card cycle as a row with a way back beneath it', () => {
    const ring = layoutFlow({ ...cycle(4), mode: 'full' }, desktop).boxes.map(box => box.rect);
    expect(ring[0]!.y).toBeLessThan(ring[1]!.y);
    expect(ring[1]!.x).toBeGreaterThan(ring[3]!.x);
    const card = layoutFlow({ ...cycle(4), mode: 'card' }, desktop);
    expect(new Set(card.boxes.map(box => box.rect.y)).size).toBe(1);
    expect(card.arrows.at(-1)!.closing).toBe(true);
    expect(card.panel!.y + card.panel!.height).toBeGreaterThan(card.boxes[0]!.rect.y + card.boxes[0]!.rect.height + 50);
  });
});

describe('layoutFlow', () => {
  for (const [name, canvas, direction] of [['16:9', desktop, 'row'], ['9:16', mobile, 'column']] as const) {
    for (const mode of ['full', 'card'] as const) {
      it(`${name} ${mode}: every box fits on screen, apart from the others, whatever the step count`, () => {
        for (let n = 2; n <= 6; n++) {
          const layout = layoutFlow({ shape: 'linear', mode, title: 'How a booking works', steps: steps(n, 'A detail line under it') }, canvas);
          expect(layout.direction).toBe(direction);
          expect(layout.boxes).toHaveLength(n);
          expect(layout.arrows).toHaveLength(n - 1);
          expect(layout.rings).toHaveLength(n);
          const margin = Math.min(canvas.width, canvas.height) * 0.03;
          for (const [i, box] of layout.boxes.entries()) {
            expect(inside(box.rect, canvas, margin), `box ${i + 1} of ${n}`).toBe(true);
            for (const other of layout.boxes.slice(i + 1)) expect(overlap(box.rect, other.rect)).toBe(false);
            expect(box.rect.height).toBe(layout.boxes[0]!.rect.height);
          }
          if (layout.panel) expect(inside(layout.panel, canvas, margin)).toBe(true);
          expect(layout.title!.y + layout.title!.size).toBeLessThan(layout.boxes[0]!.rect.y);
        }
      });
    }
  }

  it('wraps text to lines that fit inside the box, and flags what it had to cut', () => {
    const layout = layoutFlow({ shape: 'linear', mode: 'full', steps: [
      { text: 'Choose a table', time: 0 },
      { text: 'An extremely long step name that cannot possibly fit in three short lines of this box', time: 1 },
      ...steps(4).slice(2),
    ] }, desktop);
    const [first, long] = layout.boxes;
    const room = first!.rect.width - 2 * layout.pad;
    for (const line of first!.lines) expect(line.length * layout.font.text * CHAR_EM).toBeLessThanOrEqual(room);
    expect(first!.truncated).toBe(false);
    expect(long!.truncated).toBe(true);
    expect(long!.lines).toHaveLength(3);
  });

  it('draws the arrows from one box to the next, in reading order', () => {
    const row = layoutFlow({ shape: 'linear', mode: 'full', steps: steps(3) }, desktop);
    const [a, b] = row.boxes.map(box => box.rect);
    const start = row.arrows[0]!.shaft.match(/^M(-?[\d.]+) (-?[\d.]+)/)!.slice(1).map(Number);
    expect(start[0]).toBeGreaterThan(a!.x + a!.width);
    expect(row.arrows[0]!.head).toContain(`L${(b!.x - 1080 / 100).toFixed(1)}`);
    const column = layoutFlow({ shape: 'linear', mode: 'full', steps: steps(3) }, mobile);
    const [c] = column.boxes.map(box => box.rect);
    expect(Number(column.arrows[0]!.shaft.match(/^M(-?[\d.]+) (-?[\d.]+)/)![2])).toBeGreaterThan(c!.y + c!.height);
  });

  it('is the same design at half size in a preview', () => {
    const full = layoutFlow({ shape: 'linear', mode: 'card', title: 'Booking', steps: steps(4) }, desktop);
    const half = layoutFlow({ shape: 'linear', mode: 'card', title: 'Booking', steps: steps(4) }, { width: 960, height: 540 });
    expect(half.boxes[2]!.rect.x).toBeCloseTo(full.boxes[2]!.rect.x / 2);
    expect(half.boxes[2]!.lines).toEqual(full.boxes[2]!.lines);
  });
});

describe('aside flows', () => {
  const within = (outer: Rect, inner: Rect) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
    && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const layout of ['aside-left', 'aside-right'] as const) {
      it(`${layout} in ${name}: every step sits in the room the screen leaves, without a panel`, () => {
        const flow = layoutFlow({ shape: 'linear', mode: 'aside', layout, title: 'Booking', steps: steps(4) }, canvas);
        const free = canvas.width > canvas.height ? { ...room(layout, canvas), y: 0, height: canvas.height } : room(layout, canvas);
        expect(flow.panel).toBeUndefined();
        for (const box of flow.boxes) expect(within(free, box.rect)).toBe(true);
        expect(flow.title!.y).toBeGreaterThanOrEqual(free.y);
      });
    }
  }

  it('stacks the steps in the tall room beside a wide screen', () => {
    const flow = layoutFlow({ shape: 'linear', mode: 'aside', steps: steps(4) }, desktop);
    expect(flow.direction).toBe('column');
    const ys = flow.boxes.map(b => b.rect.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
});

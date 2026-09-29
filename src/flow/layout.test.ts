import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { CHAR_EM, layoutFlow } from './layout.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const TEXTS = ['Pick a night', 'Choose a table', 'Pay the deposit', 'Host confirms', 'Guest arrives', 'Bottle service'];
const steps = (n: number, detail?: string) => TEXTS.slice(0, n).map((text, i) => ({ text, time: i, ...(detail ? { detail } : {}) }));

const inside = (r: Rect, canvas: { width: number; height: number }, margin: number) =>
  r.x >= margin && r.y >= margin && r.x + r.width <= canvas.width - margin && r.y + r.height <= canvas.height - margin;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('layoutFlow', () => {
  for (const [name, canvas, direction] of [['16:9', desktop, 'row'], ['9:16', mobile, 'column']] as const) {
    for (const mode of ['full', 'card'] as const) {
      it(`${name} ${mode}: every box fits on screen, apart from the others, whatever the step count`, () => {
        for (let n = 2; n <= 6; n++) {
          const layout = layoutFlow({ mode, title: 'How a booking works', steps: steps(n, 'A detail line under it') }, canvas);
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
    const layout = layoutFlow({ mode: 'full', steps: [
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
    const row = layoutFlow({ mode: 'full', steps: steps(3) }, desktop);
    const [a, b] = row.boxes.map(box => box.rect);
    const start = row.arrows[0]!.shaft.match(/^M(-?[\d.]+) (-?[\d.]+)/)!.slice(1).map(Number);
    expect(start[0]).toBeGreaterThan(a!.x + a!.width);
    expect(row.arrows[0]!.head).toContain(`L${(b!.x - 1080 / 100).toFixed(1)}`);
    const column = layoutFlow({ mode: 'full', steps: steps(3) }, mobile);
    const [c] = column.boxes.map(box => box.rect);
    expect(Number(column.arrows[0]!.shaft.match(/^M(-?[\d.]+) (-?[\d.]+)/)![2])).toBeGreaterThan(c!.y + c!.height);
  });

  it('is the same design at half size in a preview', () => {
    const full = layoutFlow({ mode: 'card', title: 'Booking', steps: steps(4) }, desktop);
    const half = layoutFlow({ mode: 'card', title: 'Booking', steps: steps(4) }, { width: 960, height: 540 });
    expect(half.boxes[2]!.rect.x).toBeCloseTo(full.boxes[2]!.rect.x / 2);
    expect(half.boxes[2]!.lines).toEqual(full.boxes[2]!.lines);
  });
});

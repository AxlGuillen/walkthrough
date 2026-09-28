import { describe, expect, it } from 'vitest';
import { arrowPaths, layoutLabel, wrapText } from './label.ts';

const viewport = { width: 1600, height: 900 };
const inside = (r: { x: number; y: number; width: number; height: number }) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width && r.y + r.height <= viewport.height;

describe('wrapText', () => {
  it('wraps on words and cuts at three lines with an ellipsis', () => {
    expect(wrapText('Filtra por persona')).toEqual(['Filtra por persona']);
    expect(wrapText('uno dos tres cuatro', 8)).toEqual(['uno dos', 'tres', 'cuatro']);
    expect(wrapText('a b c d e f g h', 3, 2)).toHaveLength(2);
    expect(wrapText('a b c d e f g h', 3, 2).at(-1)!.endsWith('…')).toBe(true);
  });
});

describe('layoutLabel', () => {
  const target = { x: 700, y: 400, width: 200, height: 60 };

  it('prefers the space above the target and points the arrow at it', () => {
    const layout = layoutLabel(target, 'Aquí está el total', viewport);
    expect(layout.side).toBe('top');
    expect(layout.bubble.y + layout.bubble.height).toBeLessThan(target.y);
    expect(layout.to.y).toBeCloseTo(target.y - 6);
    expect(layout.from.y).toBe(layout.bubble.y + layout.bubble.height);
  });

  it('moves to another side when the preferred one has no room, and stays on screen', () => {
    const nearTop = layoutLabel({ x: 700, y: 20, width: 200, height: 40 }, 'Menú', viewport);
    expect(nearTop.side).toBe('bottom');
    expect(inside(nearTop.bubble)).toBe(true);
    const cornered = layoutLabel({ x: 0, y: 0, width: 1600, height: 900 }, 'Todo', viewport);
    expect(inside(cornered.bubble)).toBe(true);
  });

  it('honors a requested side', () => {
    expect(layoutLabel(target, 'Aquí', viewport, 'left').side).toBe('left');
  });
});

describe('arrowPaths', () => {
  it('ends the shaft and the head exactly on the target point', () => {
    const { shaft, head } = arrowPaths({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.2);
    expect(shaft.endsWith('100.0 50.0')).toBe(true);
    expect(head).toContain('L100.0 50.0');
  });
});

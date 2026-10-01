import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_STYLES, markColor, markPieces, MARK_COLORS } from './marks.ts';

const viewport = { width: 1600, height: 900 };
const rect = { x: 700, y: 400, width: 200, height: 40 };
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const bounds = (d: string) => {
  const n = numbers(d);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};

describe('markPieces', () => {
  it('draws every style, all inside the frame', () => {
    for (const style of HIGHLIGHT_STYLES) {
      const pieces = markPieces({ rect, style, color: '#123456', seed: 3 }, viewport);
      expect(pieces.length, style).toBeGreaterThan(0);
      for (const piece of pieces) {
        const b = bounds(piece.d);
        expect(b.left, style).toBeGreaterThanOrEqual(0);
        expect(b.right, style).toBeLessThanOrEqual(viewport.width);
        expect(b.bottom, style).toBeLessThanOrEqual(viewport.height);
      }
    }
  });

  it('places each style where it belongs around the element', () => {
    const at = (style: (typeof HIGHLIGHT_STYLES)[number]) => markPieces({ rect, style, color: '#fff', seed: 3 }, viewport);
    // An underline sits just below the element; a marker runs through its middle, as tall as it.
    expect(bounds(at('underline')[0]!.d).top).toBeGreaterThan(rect.y + rect.height);
    const marker = at('marker')[0]!;
    expect(marker.width).toBeGreaterThanOrEqual(rect.height);
    expect(bounds(marker.d).top).toBeCloseTo(rect.y + rect.height / 2, -1);
    // A circle reaches beyond the element on every side; a spotlight covers the whole frame
    // with a hole for it.
    const circle = bounds(at('circle')[0]!.d);
    expect(circle.left).toBeLessThan(rect.x);
    expect(circle.right).toBeGreaterThan(rect.x + rect.width);
    const [dim, edge] = at('spotlight');
    expect(dim).toMatchObject({ kind: 'fill', evenodd: true });
    expect(bounds(dim!.d)).toMatchObject({ left: 0, top: 0, right: 1600, bottom: 900 });
    expect(edge!.kind).toBe('stroke');
    // An arrow ends at the element and draws its head after its shaft.
    const [shaft, head] = at('arrow');
    expect(shaft!.span).toEqual([0, 0.75]);
    expect(head!.span).toEqual([0.75, 1]);
  });

  it('marks and underlines each line of text on its own, in reading order', () => {
    const lines = [{ x: 0, y: 0, width: 180, height: 18 }, { x: 0, y: 22, width: 120, height: 18 }];
    const marker = markPieces({ rect, style: 'marker', color: '#ff0', seed: 1, lines }, viewport);
    expect(marker).toHaveLength(2);
    expect(bounds(marker[1]!.d).right).toBeLessThan(rect.x + 130);
    expect(marker.map(p => p.span)).toEqual([[0, 0.5], [0.5, 1]]);
    expect(markPieces({ rect, style: 'underline', color: '#ff0', seed: 1, lines }, viewport)).toHaveLength(2);
  });

  it('brings an arrow from the side asked for', () => {
    const fromTop = bounds(markPieces({ rect, style: 'arrow', color: '#fff', seed: 1, side: 'top' }, viewport)[0]!.d);
    expect(fromTop.bottom).toBeLessThanOrEqual(rect.y);
    const fromLeft = bounds(markPieces({ rect, style: 'arrow', color: '#fff', seed: 1 }, viewport)[0]!.d);
    expect(fromLeft.right).toBeLessThanOrEqual(rect.x);
  });

  it('is the same drawing for the same seed', () => {
    expect(markPieces({ rect, style: 'circle', color: '#fff', seed: 9 }, viewport)).toEqual(markPieces({ rect, style: 'circle', color: '#fff', seed: 9 }, viewport));
  });
});

describe('markColor', () => {
  it('uses the accent, a named color, a hex, or yellow for a marker', () => {
    expect(markColor(undefined, 'ring', '#C8633A')).toBe('#C8633A');
    expect(markColor(undefined, 'marker', '#C8633A')).toBe(MARK_COLORS.yellow);
    expect(markColor('green', 'ring', '#C8633A')).toBe(MARK_COLORS.green);
    expect(markColor('accent', 'marker', '#C8633A')).toBe('#C8633A');
    expect(markColor('#00AA88', 'box', '#C8633A')).toBe('#00AA88');
  });
});

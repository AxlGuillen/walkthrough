import type { Rect, Size } from '../timeline/camera.ts';
import { arrowPaths } from './label.ts';
import { random, roundedRectPoint, sketchRect, type Point } from './sketch.ts';

export const HIGHLIGHT_STYLES = ['ring', 'circle', 'underline', 'marker', 'box', 'brackets', 'spotlight', 'arrow'] as const;
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];

// Named colors for marks, chosen to read over light and dark apps alike.
export const MARK_COLORS = { yellow: '#FFD84D', green: '#22C55E', red: '#EF4444', blue: '#3B82F6', white: '#FFFFFF' } as const;
export type MarkColor = keyof typeof MARK_COLORS | 'accent' | `#${string}`;

export function markColor(color: MarkColor | undefined, style: HighlightStyle, accent: string): string {
  if (color === undefined) return style === 'marker' ? MARK_COLORS.yellow : accent;
  if (color === 'accent') return accent;
  return color in MARK_COLORS ? MARK_COLORS[color as keyof typeof MARK_COLORS] : color;
}

// One piece of a mark. A stroke is revealed along its length by `progress`; a fill (the
// spotlight's dimming) fades in with it instead.
export interface MarkPiece {
  d: string;
  kind: 'stroke' | 'fill';
  color: string;
  width: number;
  // How much of the drawing time this piece takes, start to end, so an arrow's head follows
  // its shaft.
  span?: [number, number];
  opacity?: number;
  evenodd?: boolean;
}

export interface MarkInput {
  rect: Rect;
  style: HighlightStyle;
  color: string;
  seed: number;
  radius?: number;
  // The element's lines of text, relative to `rect`: a marker or an underline follows each.
  lines?: Rect[];
  side?: MarkSide;
}

const PAD = 8;
const EDGE = 4;
const f = (n: number) => n.toFixed(1);

function pad(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

// Inside the frame by EDGE, so a mark on an element at the edge stays whole.
function clampRect(rect: Rect, viewport: Size): Rect {
  const x = Math.max(EDGE, rect.x);
  const y = Math.max(EDGE, rect.y);
  const right = Math.min(viewport.width - EDGE, rect.x + rect.width);
  const bottom = Math.min(viewport.height - EDGE, rect.y + rect.height);
  return right - x > 0 && bottom - y > 0 ? { x, y, width: right - x, height: bottom - y } : rect;
}

function polyline(points: readonly Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');
}

// A loose oval around the element: a little over one turn, slightly tilted, like a pen circle.
function sketchEllipse(rect: Rect, seed: number): string {
  const next = random(seed);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2 * 1.16 + 12;
  const ry = rect.height / 2 * 1.32 + 10;
  const start = next() * Math.PI * 2;
  const turns = 1.08 + next() * 0.06;
  const tilt = (next() - 0.5) * 0.08;
  const points: Point[] = [];
  const samples = 64;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const angle = start + u * turns * Math.PI * 2;
    const grow = 1 + (u - 0.5) * 0.05 + Math.sin(u * 9 + seed) * 0.012;
    const x = rx * grow * Math.cos(angle);
    const y = ry * grow * Math.sin(angle);
    points.push({ x: cx + x * Math.cos(tilt) - y * Math.sin(tilt), y: cy + x * Math.sin(tilt) + y * Math.cos(tilt) });
  }
  return polyline(points);
}

// A pen underline: slightly rising, with a soft wave, a bit longer than the element.
function sketchUnderline(rect: Rect, seed: number): string {
  const next = random(seed);
  const y = rect.y + rect.height + 6;
  const lift = (next() - 0.3) * 4;
  const points: Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    points.push({ x: rect.x - 6 + u * (rect.width + 12), y: y - lift * u + Math.sin(u * Math.PI * 3 + seed) * 1.2 });
  }
  return polyline(points);
}

function roundedRect(rect: Rect, radius: number): string {
  const points = Array.from({ length: 97 }, (_, i) => roundedRectPoint(rect, radius, (i / 96) % 1));
  return `${polyline(points)} Z`;
}

function brackets(rect: Rect): string {
  const arm = Math.min(22, rect.width / 3, rect.height / 2);
  const { x, y, width: w, height: h } = rect;
  return [
    `M${f(x)} ${f(y + arm)} L${f(x)} ${f(y)} L${f(x + arm)} ${f(y)}`,
    `M${f(x + w - arm)} ${f(y)} L${f(x + w)} ${f(y)} L${f(x + w)} ${f(y + arm)}`,
    `M${f(x + w)} ${f(y + h - arm)} L${f(x + w)} ${f(y + h)} L${f(x + w - arm)} ${f(y + h)}`,
    `M${f(x + arm)} ${f(y + h)} L${f(x)} ${f(y + h)} L${f(x)} ${f(y + h - arm)}`,
  ].join(' ');
}

// From the side asked for, else the first of left, below, right and above with room for a full
// arrow, aimed at the element's nearest edge. No side is clear of content on every page, so a
// highlight can name it (`side`).
const ARROW_LENGTH = 210;
export type MarkSide = 'top' | 'left' | 'bottom' | 'right';

function arrow(rect: Rect, viewport: Size, seed: number, asked?: MarkSide): { shaft: string; head: string } {
  const room = { left: rect.x, bottom: viewport.height - rect.y - rect.height, right: viewport.width - rect.x - rect.width, top: rect.y };
  const sides = Object.keys(room) as MarkSide[];
  const side = asked ?? sides.find(s => room[s] >= ARROW_LENGTH + 40) ?? [...sides].sort((a, b) => room[b] - room[a])[0]!;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const length = Math.min(ARROW_LENGTH, Math.max(60, room[side] - 30));
  const gap = 10;
  const [from, to]: [Point, Point] = side === 'left' ? [{ x: rect.x - gap - length, y: cy - length * 0.35 }, { x: rect.x - gap, y: cy }]
    : side === 'right' ? [{ x: rect.x + rect.width + gap + length, y: cy - length * 0.35 }, { x: rect.x + rect.width + gap, y: cy }]
      : side === 'top' ? [{ x: cx - length * 0.4, y: rect.y - gap - length }, { x: cx, y: rect.y - gap }]
        : [{ x: cx - length * 0.4, y: rect.y + rect.height + gap + length }, { x: cx, y: rect.y + rect.height + gap }];
  return arrowPaths(from, to, random(seed)() < 0.5 ? 0.18 : -0.18);
}

// Each line of text in the frame, or the whole element when it has none measured.
function textLines(rect: Rect, lines: readonly Rect[] | undefined): Rect[] {
  if (!lines?.length) return [rect];
  return lines.map(line => ({ ...line, x: rect.x + line.x, y: rect.y + line.y }));
}

export function markPieces({ rect, style, color, seed, radius, lines, side }: MarkInput, viewport: Size): MarkPiece[] {
  const around = clampRect(pad(rect, PAD), viewport);
  const corner = radius === undefined ? 10 : radius + PAD;
  switch (style) {
    case 'ring':
      return [{ d: sketchRect(around, seed, corner), kind: 'stroke', color, width: 3.5 }];
    case 'circle':
      return [{ d: sketchEllipse(rect, seed), kind: 'stroke', color, width: 3.5 }];
    case 'underline': {
      // Line after line, drawn in reading order as one pen pass.
      const all = textLines(rect, lines);
      return all.map((line, i) => ({ d: sketchUnderline(line, seed + i), kind: 'stroke' as const, color, width: 4.5, span: [i / all.length, (i + 1) / all.length] as [number, number] }));
    }
    case 'marker': {
      // A thick translucent stroke through the middle of each line, a hair taller than its text.
      const all = textLines(rect, lines);
      return all.map((line, i) => {
        const y = line.y + line.height / 2;
        const tilt = (random(seed + i)() - 0.5) * 3;
        return {
          d: `M${f(line.x - 4)} ${f(y + tilt)} L${f(line.x + line.width + 4)} ${f(y - tilt)}`, kind: 'stroke' as const, color,
          width: line.height * 0.92 + 4, opacity: 0.42, span: [i / all.length, (i + 1) / all.length] as [number, number],
        };
      });
    }
    case 'box':
      return [{ d: roundedRect(around, Math.min(corner, around.width / 2, around.height / 2)), kind: 'stroke', color, width: 3 }];
    case 'brackets':
      return [{ d: brackets(clampRect(pad(rect, PAD + 4), viewport)), kind: 'stroke', color, width: 4 }];
    case 'spotlight': {
      const hole = clampRect(pad(rect, PAD + 2), viewport);
      const r = Math.min(corner + 2, hole.width / 2, hole.height / 2);
      const outer = `M0 0 L${viewport.width} 0 L${viewport.width} ${viewport.height} L0 ${viewport.height} Z`;
      return [
        { d: `${outer} ${roundedRect(hole, r)}`, kind: 'fill', color: '#05060a', width: 0, opacity: 0.6, evenodd: true },
        { d: roundedRect(hole, r), kind: 'stroke', color, width: 2, opacity: 0.9 },
      ];
    }
    case 'arrow': {
      const { shaft, head } = arrow(rect, viewport, seed, side);
      return [
        { d: shaft, kind: 'stroke', color, width: 5, span: [0, 0.75] },
        { d: head, kind: 'stroke', color, width: 5, span: [0.75, 1] },
      ];
    }
  }
}

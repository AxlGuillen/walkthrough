import type { Rect, Size } from '../timeline/camera.ts';
import type { Point } from './sketch.ts';

export type LabelSide = 'top' | 'bottom' | 'right' | 'left';

export interface LabelLayout {
  bubble: Rect;
  lines: string[];
  side: LabelSide;
  from: Point;
  to: Point;
}

export const LABEL_FONT = { size: 22, line: 28, padX: 18, padY: 12 };
// Rough glyph width for the marker font: layout happens in Node, before any text exists.
const CHAR_WIDTH = 11.5;
const MAX_CHARS = 32;
const MAX_LINES = 3;
const GAP = 64;
const EDGE = 16;
const TARGET_CLEARANCE = 6;

export function wrapText(text: string, maxChars = MAX_CHARS, maxLines = MAX_LINES): string[] {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, maxChars - 1)}…`;
  return kept;
}

// Tries the sides in order and keeps the first where the bubble fits on screen; a target
// with no room anywhere still gets its preferred side, pushed back inside the frame.
export function layoutLabel(target: Rect, text: string, viewport: Size, side?: LabelSide): LabelLayout {
  const lines = wrapText(text);
  const width = Math.max(...lines.map(line => line.length)) * CHAR_WIDTH + LABEL_FONT.padX * 2;
  const height = lines.length * LABEL_FONT.line + LABEL_FONT.padY * 2;
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;

  const place = (at: LabelSide): Rect => {
    switch (at) {
      case 'top': return { x: cx - width / 2 + 40, y: target.y - GAP - height, width, height };
      case 'bottom': return { x: cx - width / 2 + 40, y: target.y + target.height + GAP, width, height };
      case 'right': return { x: target.x + target.width + GAP, y: cy - height / 2 - 30, width, height };
      case 'left': return { x: target.x - GAP - width, y: cy - height / 2 - 30, width, height };
    }
  };
  const fits = (r: Rect) => r.x >= EDGE && r.y >= EDGE && r.x + r.width <= viewport.width - EDGE && r.y + r.height <= viewport.height - EDGE;

  const order: LabelSide[] = side ? [side] : ['top', 'bottom', 'right', 'left'];
  const chosen = order.find(at => fits(place(at))) ?? order[0]!;
  const raw = place(chosen);
  const bubble = {
    ...raw,
    x: clamp(raw.x, EDGE, viewport.width - EDGE - width),
    y: clamp(raw.y, EDGE, viewport.height - EDGE - height),
  };

  const from = edgeFacing(bubble, chosen);
  const to = closestPoint(pad(target, TARGET_CLEARANCE), from);
  return { bubble, lines, side: chosen, from, to };
}

// A hand-drawn arrow: a gently bent shaft and a two-stroke head along its final direction.
export function arrowPaths(from: Point, to: Point, bend: number): { shaft: string; head: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const control = { x: (from.x + to.x) / 2 - dy * bend, y: (from.y + to.y) / 2 + dx * bend };
  const angle = Math.atan2(to.y - control.y, to.x - control.x);
  const wing = (turn: number) => ({ x: to.x - 16 * Math.cos(angle + turn), y: to.y - 16 * Math.sin(angle + turn) });
  const [a, b] = [wing(0.5), wing(-0.5)];
  const f = (n: number) => n.toFixed(1);
  return {
    shaft: `M${f(from.x)} ${f(from.y)} Q${f(control.x)} ${f(control.y)} ${f(to.x)} ${f(to.y)}`,
    head: `M${f(a.x)} ${f(a.y)} L${f(to.x)} ${f(to.y)} L${f(b.x)} ${f(b.y)}`,
  };
}

function edgeFacing(r: Rect, side: LabelSide): Point {
  switch (side) {
    case 'top': return { x: r.x + r.width / 2, y: r.y + r.height };
    case 'bottom': return { x: r.x + r.width / 2, y: r.y };
    case 'right': return { x: r.x, y: r.y + r.height / 2 };
    case 'left': return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

function closestPoint(r: Rect, p: Point): Point {
  return { x: clamp(p.x, r.x, r.x + r.width), y: clamp(p.y, r.y, r.y + r.height) };
}

function pad(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

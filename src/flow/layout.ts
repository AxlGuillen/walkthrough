import { arrowPaths, wrapText } from '../effects/label.ts';
import { sketchRect, type Point } from '../effects/sketch.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import type { TimedFlow } from '../timeline/build.ts';
import { badgeTexts, flowEdges, mainLength, type FlowEdge } from './graph.ts';

export interface FlowBox {
  rect: Rect;
  badge: string;
  kind: 'step' | 'decision';
  lines: string[];
  detail: string[];
  truncated: boolean;
}

export interface FlowArrow extends FlowEdge {
  shaft: string;
  head: string;
  tag?: { text: string; x: number; y: number; size: number };
}

export interface FlowLayout {
  canvas: Size;
  mode: TimedFlow['mode'];
  direction: 'row' | 'column';
  panel?: Rect;
  title?: { text: string; x: number; y: number; size: number };
  font: { text: number; detail: number; line: number; detailLine: number; badge: number; badgeGap: number; detailGap: number };
  pad: number;
  radius: number;
  stroke: number;
  boxes: FlowBox[];
  arrows: FlowArrow[];
  rings: string[];
}

type Input = Pick<TimedFlow, 'shape' | 'mode' | 'title' | 'steps' | 'branches'>;
type Font = FlowLayout['font'];

// Rough advance of a semibold sans glyph, in ems: layout happens in Node, before any text
// exists. Slightly generous, so a line measured here never overflows in the browser.
export const CHAR_EM = 0.58;
const MAX_LINES = 3;

// Sizes are in u, a hundredth of the canvas' short side, so a flow reads the same in 16:9
// and 9:16 and in a half-size preview.
export function layoutFlow(flow: Input, canvas: Size): FlowLayout {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const direction = canvas.width >= canvas.height ? 'row' : 'column';
  const card = flow.mode === 'card';
  const edge = 4 * u;
  const inset = card ? 3 * u : 0;
  const pad = (card ? 1.8 : 2.2) * u;
  const radius = 1.6 * u;
  const titleSize = card ? 2.4 * u : 4.6 * u;
  const titleSpace = flow.title ? titleSize * 1.2 + (card ? 2 : 6) * u : 0;
  const outer = card ? { x: edge, width: canvas.width - 2 * edge } : { x: canvas.width * 0.07, width: canvas.width * 0.86 };
  const space = {
    width: outer.width - 2 * inset,
    height: card ? canvas.height * 0.5 : canvas.height - 12 * u - titleSpace,
  };
  const ctx: Context = { u, direction, card, pad, space, gap: (card ? 5 : direction === 'row' ? 8 : 6) * u };

  const placed = place(flow, ctx);
  const left = outer.x + (outer.width - placed.width) / 2;
  let panel: Rect | undefined;
  let top: number;
  if (card) {
    // As wide as its steps, not the screen: the title lines up with the first box.
    const height = 2 * inset + titleSpace + placed.height;
    panel = { x: left - inset, y: canvas.height - edge - height, width: placed.width + 2 * inset, height };
    top = panel.y + inset + titleSpace;
  } else {
    top = (canvas.height - (titleSpace + placed.height)) / 2 + titleSpace;
  }

  const badges = badgeTexts(flow);
  const main = mainLength(flow);
  const boxes: FlowBox[] = placed.boxes.map(({ rect, lines, detail, truncated }, i) => ({
    rect: { ...rect, x: rect.x + left, y: rect.y + top },
    badge: badges[i]!,
    kind: flow.shape === 'decision' && i === main - 1 ? 'decision' : 'step',
    lines, detail, truncated,
  }));
  const rects = boxes.map(box => box.rect);
  const arrows = flowEdges(flow).map((edge, i) => arrowFor(edge, i, rects, flow.shape, ctx, placed.font, placed.returnDepth));

  const ringPad = 1.1 * u;
  const rings = rects.map((rect, i) => sketchRect(
    { x: rect.x - ringPad, y: rect.y - ringPad, width: rect.width + 2 * ringPad, height: rect.height + 2 * ringPad },
    i * 7 + 3, radius + ringPad,
  ));

  return {
    canvas, mode: flow.mode, direction, ...(panel ? { panel } : {}),
    ...(flow.title ? { title: { text: flow.title, x: left, y: top - titleSpace, size: titleSize } } : {}),
    font: placed.font, pad, radius, stroke: 0.35 * u, boxes, arrows, rings,
  };
}

interface Context {
  u: number;
  direction: 'row' | 'column';
  card: boolean;
  pad: number;
  gap: number;
  space: Size;
}

interface Measured {
  rect: Rect;
  lines: string[];
  detail: string[];
  truncated: boolean;
}

interface Placed {
  boxes: Measured[];
  width: number;
  height: number;
  font: Font;
  // Room under a card cycle's row for the arrow back to the start.
  returnDepth?: number;
}

function place(flow: Input, ctx: Context): Placed {
  if (flow.shape === 'decision') return placeDecision(flow, ctx);
  if (flow.shape === 'cycle' && !ctx.card) return placeCycle(flow, ctx);
  const placed = placeLine(flow.steps, ctx);
  if (flow.shape !== 'cycle') return placed;
  const returnDepth = 6 * ctx.u;
  return { ...placed, height: placed.height + returnDepth, returnDepth };
}

function placeLine(steps: Input['steps'], ctx: Context): Placed {
  const { u, direction, card, gap, space } = ctx;
  const n = steps.length;
  const width = direction === 'row' ? Math.min((card ? 28 : 34) * u, (space.width - (n - 1) * gap) / n) : space.width * (card ? 1 : 0.9);
  const font = fontFor(width, ctx);
  const height = uniformHeight(steps.map(step => [step, width] as const), font, ctx);
  const boxes = steps.map((step, i) => measured(step, direction === 'row'
    ? { x: i * (width + gap), y: 0, width, height }
    : { x: 0, y: i * (height + gap), width, height }, font, ctx));
  return direction === 'row'
    ? { boxes, width: n * width + (n - 1) * gap, height, font }
    : { boxes, width, height: n * height + (n - 1) * gap, font };
}

// The question sits at the end of the main line; its two branches fan out beyond it, one
// above and one below in a row, side by side under it in a column.
function placeDecision(flow: Input, ctx: Context): Placed {
  const { u, direction, card, gap, space } = ctx;
  const main = flow.steps.filter(step => step.branch === undefined);
  const branches = ([0, 1] as const).map(b => flow.steps.filter(step => step.branch === b));
  const longest = Math.max(...branches.map(branch => branch.length));
  const fork = gap * 1.6;
  const split = 4 * u;

  if (direction === 'row') {
    const columns = main.length + longest;
    const width = Math.min((card ? 26 : 32) * u, (space.width - (columns - 2) * gap - fork) / columns);
    const font = fontFor(width, ctx);
    const height = uniformHeight(flow.steps.map(step => [step, width] as const), font, ctx);
    const mainY = (height + split) / 2;
    const branchX = main.length * width + (main.length - 1) * gap + fork;
    const boxes = flow.steps.map(step => {
      if (step.branch === undefined) {
        const i = main.indexOf(step);
        return measured(step, { x: i * (width + gap), y: mainY, width, height }, font, ctx);
      }
      const k = branches[step.branch]!.indexOf(step);
      return measured(step, { x: branchX + k * (width + gap), y: step.branch === 0 ? 0 : height + split, width, height }, font, ctx);
    });
    return { boxes, width: branchX + longest * width + (longest - 1) * gap, height: 2 * height + split, font };
  }

  const mainWidth = space.width * (card ? 1 : 0.9);
  const branchWidth = (mainWidth - gap) / 2;
  const font = fontFor(branchWidth, ctx);
  const height = uniformHeight(flow.steps.map(step => [step, step.branch === undefined ? mainWidth : branchWidth] as const), font, ctx);
  const branchY = main.length * (height + gap) - gap + fork;
  const boxes = flow.steps.map(step => {
    if (step.branch === undefined) {
      const i = main.indexOf(step);
      return measured(step, { x: 0, y: i * (height + gap), width: mainWidth, height }, font, ctx);
    }
    const k = branches[step.branch]!.indexOf(step);
    return measured(step, { x: step.branch * (branchWidth + gap), y: branchY + k * (height + gap), width: branchWidth, height }, font, ctx);
  });
  return { boxes, width: mainWidth, height: branchY + longest * height + (longest - 1) * gap, font };
}

// Steps around an ellipse, clockwise from the top. Boxes shrink until no two touch.
function placeCycle(flow: Input, ctx: Context): Placed {
  const { u, direction, space } = ctx;
  const n = flow.steps.length;
  const minGap = 3 * u;
  let width = (direction === 'row' ? (n <= 4 ? 30 : 26) : n <= 4 ? 40 : 34) * u;
  for (;;) {
    const font = fontFor(width, ctx);
    const height = uniformHeight(flow.steps.map(step => [step, width] as const), font, ctx);
    // Kept near round: a stretched ellipse turns the arrows into long lines.
    const fullX = (space.width - width) / 2;
    const fullY = (space.height - height) / 2;
    const rx = direction === 'row' ? Math.min(fullX, fullY * 1.7) : fullX;
    const ry = direction === 'row' ? fullY : Math.min(fullY, fullX * 1.5);
    const centers = flow.steps.map((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
    });
    const rects = centers.map(c => ({ x: c.x - width / 2, y: c.y - height / 2, width, height }));
    const clear = rects.every((a, i) => rects.slice(i + 1).every(b =>
      Math.abs(a.x - b.x) >= width + minGap || Math.abs(a.y - b.y) >= height + minGap));
    if (clear || width <= 14 * u) {
      const minX = Math.min(...rects.map(r => r.x));
      const minY = Math.min(...rects.map(r => r.y));
      const boxes = flow.steps.map((step, i) => measured(step, { ...rects[i]!, x: rects[i]!.x - minX, y: rects[i]!.y - minY }, font, ctx));
      return { boxes, width: 2 * rx + width, height: 2 * ry + height, font };
    }
    width *= 0.92;
  }
}

function fontFor(width: number, { u, card, direction }: Context): Font {
  const text = direction === 'row'
    ? clamp(width * (card ? 0.1 : 0.11), (card ? 1.9 : 2.2) * u, (card ? 2.6 : 3.4) * u)
    : clamp(width * 0.075, (card ? 2.2 : 2.6) * u, (card ? 2.6 : 3.2) * u);
  return {
    text, detail: text * 0.72, line: text * 1.22, detailLine: text * 0.72 * 1.35,
    badge: text * 1.5, badgeGap: 1.2 * u, detailGap: 0.6 * u,
  };
}

// A column puts the number beside the text; a row stacks it above, where there is height.
function wrap(step: Input['steps'][number], width: number, font: Font, { direction, pad }: Context) {
  const room = width - 2 * pad - (direction === 'column' ? font.badge + font.badgeGap : 0);
  const lines = wrapText(step.text, charsFor(room, font.text), MAX_LINES);
  const detail = step.detail ? wrapText(step.detail, charsFor(room, font.detail), MAX_LINES) : [];
  const truncated = [...lines, ...detail].some(line => line.endsWith('…'));
  const body = lines.length * font.line + (detail.length ? font.detailGap + detail.length * font.detailLine : 0);
  const height = (direction === 'row' ? font.badge + font.badgeGap + body : Math.max(font.badge, body)) + 2 * pad;
  return { lines, detail, truncated, height };
}

function uniformHeight(items: readonly (readonly [Input['steps'][number], number])[], font: Font, ctx: Context): number {
  return Math.max(...items.map(([step, width]) => wrap(step, width, font, ctx).height));
}

function measured(step: Input['steps'][number], rect: Rect, font: Font, ctx: Context): Measured {
  const { lines, detail, truncated } = wrap(step, rect.width, font, ctx);
  return { rect, lines, detail, truncated };
}

function arrowFor(
  edge: FlowEdge, index: number, rects: readonly Rect[], shape: Input['shape'], ctx: Context, font: Font, returnDepth?: number,
): FlowArrow {
  const from = rects[edge.from]!;
  const to = rects[edge.to]!;
  const clearance = ctx.u;

  // A card cycle is a row: its way back runs under the boxes.
  if (edge.closing && returnDepth !== undefined) {
    const start = { x: from.x + from.width / 2, y: from.y + from.height + clearance };
    const end = { x: to.x + to.width / 2, y: to.y + to.height + clearance };
    return { ...edge, ...arrowPaths(start, end, (-2 * returnDepth * 0.8) / Math.abs(start.x - end.x)) };
  }

  const a = center(from);
  const b = center(to);
  const start = exitPoint(a, b, from, clearance);
  const end = exitPoint(b, a, to, clearance);
  const centroid = center(bounds(rects));
  // Around a cycle and out of a question, arrows bow away from the middle; along a line, they barely sway.
  const bend = shape !== 'linear' && (edge.label || shape === 'cycle')
    ? outward(start, end, centroid, edge.label ? 0.12 : 0.15)
    : index % 2 === 0 ? 0.06 : -0.06;
  const arrow: FlowArrow = { ...edge, ...arrowPaths(start, end, bend) };
  if (edge.label) arrow.tag = tagFor(edge.label, start, end, bend, centroid, font);
  return arrow;
}

function tagFor(text: string, start: Point, end: Point, bend: number, centroid: Point, font: Font): NonNullable<FlowArrow['tag']> {
  const control = controlPoint(start, end, bend);
  const middle = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y };
  const size = font.text * 0.7;
  const away = Math.sign(middle.y - centroid.y) || -1;
  return { text, x: middle.x, y: middle.y + away * size * 1.3, size };
}

function outward(start: Point, end: Point, centroid: Point, amount: number): number {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const control = controlPoint(start, end, amount);
  return Math.hypot(control.x - centroid.x, control.y - centroid.y) >= Math.hypot(mid.x - centroid.x, mid.y - centroid.y) ? amount : -amount;
}

// The same control point arrowPaths bends through.
function controlPoint(start: Point, end: Point, bend: number): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return { x: (start.x + end.x) / 2 - dy * bend, y: (start.y + end.y) / 2 + dx * bend };
}

// Where the line from `a` toward `b` leaves `rect`, grown by `clearance`.
function exitPoint(a: Point, b: Point, rect: Rect, clearance: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const halfW = rect.width / 2 + clearance;
  const halfH = rect.height / 2 + clearance;
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function bounds(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map(r => r.x));
  const y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y };
}

function charsFor(width: number, size: number): number {
  return Math.max(4, Math.floor(width / (size * CHAR_EM)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import type { Rect, Size } from '../timeline/camera.ts';
import { arrowPaths, layoutLabel, type LabelSide } from './label.ts';
import { random, sketchCircle, sketchRect, type Point } from './sketch.ts';

export const TIMING = {
  travelMin: 0.35,
  travelMax: 0.9,
  cursorFade: 0.2,
  press: 0.18,
  circleDraw: 0.4,
  circleHold: 0.8,
  ringDraw: 0.5,
  ringHold: 1.5,
  labelHold: 2.2,
  labelPop: 0.25,
  arrowDelay: 0.15,
  arrowDraw: 0.4,
  headDraw: 0.12,
  fade: 0.35,
};

const CIRCLE_RADIUS = 24;
const RING_PADDING = 8;

export interface CursorMove {
  start: number;
  end: number;
  from: Point;
  to: Point;
  // Sideways sag of the path, as a fraction of its length; the sign picks the side.
  bend: number;
}

const TRAVEL_PX_PER_SECOND = 1500;
const MAX_BEND = 0.18;

// Short hops are quick and long crossings take longer, the way a hand moves a mouse.
export function travelTime(from: Point, to: Point): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.min(TIMING.travelMax, Math.max(TIMING.travelMin, TIMING.travelMin + distance / TRAVEL_PX_PER_SECOND));
}

export function bendFor(seed: number): number {
  const next = random(seed);
  const magnitude = 0.08 + next() * (MAX_BEND - 0.08);
  return next() < 0.5 ? -magnitude : magnitude;
}

export interface ClickMark {
  time: number;
  at: Point;
  seed: number;
  // Lets the capture re-measure the mark while the page scrolls under it.
  track?: { selector: string; offset: Point };
}

export interface Ring {
  time: number;
  rect: Rect;
  hold: number;
  seed: number;
  // The element's own corner radius, so the ring's corners run parallel to it.
  radius?: number;
  track?: string;
}

export interface Label {
  time: number;
  rect: Rect;
  text: string;
  side?: LabelSide;
  hold: number;
  seed: number;
  track?: string;
}

export interface EffectsPlan {
  pointer: 'mouse' | 'touch';
  viewport: Size;
  home: Point;
  moves: CursorMove[];
  clicks: ClickMark[];
  rings: Ring[];
  labels: Label[];
}

export interface Bubble {
  rect: Rect;
  lines: string[];
  opacity: number;
  scale: number;
}

export interface Stroke {
  d: string;
  progress: number;
  opacity: number;
}

export interface Scene {
  cursor: { at: Point; opacity: number; scale: number } | null;
  strokes: Stroke[];
  bubbles: Bubble[];
}

export function emptyPlan(pointer: EffectsPlan['pointer'], viewport: Size): EffectsPlan {
  const home = { x: viewport.width / 2, y: viewport.height / 2 };
  return { pointer, viewport, home, moves: [], clicks: [], rings: [], labels: [] };
}

export function cursorPosition(time: number, { moves, home }: EffectsPlan): Point {
  let position = home;
  for (const move of moves) {
    if (time < move.start) break;
    const span = move.end - move.start;
    const t = span <= 0 ? 1 : Math.min(1, (time - move.start) / span);
    position = curve(move, easeInOutCubic(t));
  }
  return position;
}

function curve({ from, to, bend }: CursorMove, t: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const control = { x: (from.x + to.x) / 2 - dy * bend, y: (from.y + to.y) / 2 + dx * bend };
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

export function sceneAt(time: number, plan: EffectsPlan): Scene {
  const strokes: Stroke[] = [];
  for (const click of plan.clicks) {
    const phase = strokePhase(time, click.time, TIMING.circleDraw, TIMING.circleHold);
    if (phase) strokes.push({ d: sketchCircle(click.at, CIRCLE_RADIUS, click.seed), ...phase });
  }
  for (const ring of plan.rings) {
    const phase = strokePhase(time, ring.time, TIMING.ringDraw, ring.hold);
    if (phase) strokes.push({ d: ringPath(ring, plan.viewport), ...phase });
  }
  const bubbles: Bubble[] = [];
  for (const label of plan.labels) {
    const bubble = bubbleAt(time, label);
    if (!bubble) continue;
    const layout = layoutLabel(label.rect, label.text, plan.viewport, label.side);
    const { shaft, head } = arrowPaths(layout.from, layout.to, bendFor(label.seed));
    const shaftPhase = strokePhase(time, label.time + TIMING.arrowDelay, TIMING.arrowDraw, label.hold - TIMING.arrowDelay);
    const headPhase = strokePhase(time, label.time + TIMING.arrowDelay + TIMING.arrowDraw, TIMING.headDraw,
      label.hold - TIMING.arrowDelay - TIMING.arrowDraw);
    if (shaftPhase) strokes.push({ d: shaft, ...shaftPhase });
    if (headPhase) strokes.push({ d: head, ...headPhase });
    bubbles.push({ rect: layout.bubble, lines: layout.lines, ...bubble });
  }
  return { cursor: cursorAt(time, plan), strokes, bubbles };
}

function bubbleAt(time: number, label: Label): { opacity: number; scale: number } | null {
  const elapsed = time - label.time;
  if (elapsed < 0) return null;
  const enter = Math.min(1, elapsed / TIMING.labelPop);
  const opacity = elapsed < label.hold ? enter : 1 - (elapsed - label.hold) / TIMING.fade;
  if (opacity <= 0) return null;
  return { opacity, scale: 0.85 + 0.15 * easeOutCubic(enter) };
}

export function labelVisible(time: number, label: Label): boolean {
  return bubbleAt(time, label) !== null;
}

function cursorAt(time: number, plan: EffectsPlan): Scene['cursor'] {
  const first = plan.moves[0];
  if (plan.pointer === 'touch' || !first || time < first.start) return null;
  const pressed = plan.clicks.some(click => time >= click.time && time < click.time + TIMING.press);
  return {
    at: cursorPosition(time, plan),
    opacity: Math.min(1, (time - first.start) / TIMING.cursorFade),
    scale: pressed ? 0.85 : 1,
  };
}

export function clickVisible(time: number, click: ClickMark): boolean {
  return strokePhase(time, click.time, TIMING.circleDraw, TIMING.circleHold) !== null;
}

// A mark whose element got covered (a menu opened over it) or went away (a navigation)
// fades out from `time` instead of floating over whatever replaced it. Returns how long
// it had been on screen, or null if it was already on its way out.
export function endRingAt(ring: Ring, time: number): number | null {
  const hold = Math.max(0, time - ring.time - TIMING.ringDraw);
  if (hold >= ring.hold) return null;
  ring.hold = hold;
  return time - ring.time;
}

export function endLabelAt(label: Label, time: number): number | null {
  const hold = Math.max(0, time - label.time);
  if (hold >= label.hold) return null;
  label.hold = hold;
  return time - label.time;
}

export function ringVisible(time: number, ring: Ring): boolean {
  return strokePhase(time, ring.time, TIMING.ringDraw, ring.hold) !== null;
}

export function strokePhase(time: number, start: number, draw: number, hold: number): Omit<Stroke, 'd'> | null {
  const elapsed = time - start;
  if (elapsed < 0) return null;
  const opacity = elapsed < draw + hold ? 1 : 1 - (elapsed - draw - hold) / TIMING.fade;
  if (opacity <= 0) return null;
  return { progress: easeOutCubic(Math.min(1, elapsed / draw)), opacity };
}

const RING_EDGE = 4;
const RING_CORNER = 10;

// Concentric with the element, and pulled inside the frame when the element touches its edge.
export function ringPath(ring: Ring, viewport: Size): string {
  const padded = pad(ring.rect, RING_PADDING);
  const x = Math.max(RING_EDGE, padded.x);
  const y = Math.max(RING_EDGE, padded.y);
  const right = Math.min(viewport.width - RING_EDGE, padded.x + padded.width);
  const bottom = Math.min(viewport.height - RING_EDGE, padded.y + padded.height);
  const rect = right - x > 0 && bottom - y > 0 ? { x, y, width: right - x, height: bottom - y } : padded;
  const corner = ring.radius === undefined ? RING_CORNER : ring.radius + RING_PADDING;
  return sketchRect(rect, ring.seed, corner);
}

function pad(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

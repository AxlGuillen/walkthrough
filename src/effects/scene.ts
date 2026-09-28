import type { Rect } from '../timeline/camera.ts';
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
}

export interface Ring {
  time: number;
  rect: Rect;
  hold: number;
  seed: number;
}

export interface EffectsPlan {
  pointer: 'mouse' | 'touch';
  home: Point;
  moves: CursorMove[];
  clicks: ClickMark[];
  rings: Ring[];
}

export interface Stroke {
  d: string;
  progress: number;
  opacity: number;
}

export interface Scene {
  cursor: { at: Point; opacity: number; scale: number } | null;
  strokes: Stroke[];
}

export function emptyPlan(pointer: EffectsPlan['pointer'], home: Point): EffectsPlan {
  return { pointer, home, moves: [], clicks: [], rings: [] };
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
    if (phase) strokes.push({ d: sketchRect(pad(ring.rect, RING_PADDING), ring.seed), ...phase });
  }
  return { cursor: cursorAt(time, plan), strokes };
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

export function strokePhase(time: number, start: number, draw: number, hold: number): Omit<Stroke, 'd'> | null {
  const elapsed = time - start;
  if (elapsed < 0) return null;
  const opacity = elapsed < draw + hold ? 1 : 1 - (elapsed - draw - hold) / TIMING.fade;
  if (opacity <= 0) return null;
  return { progress: easeOutCubic(Math.min(1, elapsed / draw)), opacity };
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

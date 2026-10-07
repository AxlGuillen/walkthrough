import type { Rect, Size } from '../timeline/camera.ts';
import type { Timeline } from '../timeline/build.ts';
import { isStageTransition, type Shot, type StageTransition } from '../tour/schema.ts';

// Where the recording sits on the stage. scale is of the full canvas; rotations in degrees
// (rotateY > 0 brings the left edge closer); x and y shift it, as a share of the canvas;
// depth (0..1) grows its rounded corners and shadow as it leaves the flat.
export interface Pose {
  scale: number;
  rotateX: number;
  rotateY: number;
  x: number;
  y: number;
  depth: number;
}

// One stretch of the camera: from one pose to another, eased, between two instants.
export interface Move {
  start: number;
  end: number;
  from: Pose;
  to: Pose;
}

// A change of screen the stage draws: the old screen, held at its last frame, gives way to the new one.
export interface Change {
  time: number;
  kind: StageTransition;
}

export interface StagePlan {
  moves: Move[];
  changes: Change[];
  // Stretches where the camera is off the flat or a screen is changing: only these get rendered.
  spans: { start: number; end: number }[];
  notes: { time: number; note: string }[];
}

// How one screen sits inside the camera's pose while it changes: x as a share of the width.
export interface Layer {
  x: number;
  scale: number;
  rotateY: number;
  opacity: number;
  depth: number;
}

export const CHANGE_LENGTH = 0.8;

export const FLAT: Pose = { scale: 1, rotateX: 0, rotateY: 0, x: 0, y: 0, depth: 0 };

export const CAMERA = {
  // Default tilt, in degrees: 6–8 reads like the flat, 12 is the most the schema allows.
  angle: 8,
  move: 1.2,
  // Straightening before a mark: how long it takes, and how flat it must be before the mark.
  straighten: 0.8,
  lead: 0.2,
  // A shot shown for less than this before it straightens reads as a twitch.
  shortest: 1,
};

// The shots that leave room on the stage: aside moves the screen to one side (above, in 9:16)
// and inset sets it low, tilted back like a product shot, under a title. away takes it out of
// the frame, to bring it in or send it off.
export type RoomShot = 'aside-left' | 'aside-right' | 'inset';
export const ROOM_SHOTS: readonly RoomShot[] = ['aside-left', 'aside-right', 'inset'];

export function pose(to: Shot['to'], angle = CAMERA.angle, portrait = false): Pose {
  switch (to) {
    case 'aside-left': return portrait ? ASIDE_PORTRAIT : { scale: 0.6, rotateX: 0, rotateY: -4, x: -0.17, y: 0, depth: 1 };
    case 'aside-right': return portrait ? ASIDE_PORTRAIT : { scale: 0.6, rotateX: 0, rotateY: 4, x: 0.17, y: 0, depth: 1 };
    case 'inset': return portrait ? { scale: 0.6, rotateX: 8, rotateY: 0, x: 0, y: 0.17, depth: 1 } : { scale: 0.62, rotateX: 10, rotateY: 0, x: 0, y: 0.17, depth: 1 };
    case 'away': return { scale: 0.62, rotateX: 14, rotateY: 0, x: 0, y: 0.95, depth: 1 };
    case 'flat': return FLAT;
    case 'wide': return { scale: 0.84, rotateX: 0, rotateY: 0, x: 0, y: 0, depth: 1 };
    case 'left': return { scale: 0.82, rotateX: 2, rotateY: angle, x: -0.012, y: -0.006, depth: 1 };
    case 'right': return { scale: 0.82, rotateX: 2, rotateY: -angle, x: 0.012, y: -0.006, depth: 1 };
    case 'top': return { scale: 0.8, rotateX: angle, rotateY: 0, x: 0, y: -0.03, depth: 1 };
  }
}

const ASIDE_PORTRAIT: Pose = { scale: 0.56, rotateX: 0, rotateY: 0, x: 0, y: -0.19, depth: 1 };

// The free part of the canvas beside the screen in a room shot, with a margin from both.
export function room(to: RoomShot, canvas: Size): Rect {
  const portrait = canvas.height > canvas.width;
  const p = pose(to, CAMERA.angle, portrait);
  const width = canvas.width * p.scale;
  const height = canvas.height * p.scale;
  const left = canvas.width * (0.5 + p.x) - width / 2;
  const top = canvas.height * (0.5 + p.y) - height / 2;
  const gap = Math.min(canvas.width, canvas.height) * 0.05;
  const edge = Math.min(canvas.width, canvas.height) * 0.06;
  if (to === 'inset') return { x: edge, y: edge, width: canvas.width - 2 * edge, height: top - gap - edge };
  if (portrait) {
    const y = top + height + gap;
    return { x: edge, y, width: canvas.width - 2 * edge, height: canvas.height - edge - y };
  }
  const x = to === 'aside-left' ? left + width + gap : edge;
  const right = to === 'aside-left' ? canvas.width - edge : left - gap;
  return { x, y: top, width: right - x, height };
}

const isFlat = (p: Pose) => p.depth === 0 && p.scale === 1 && p.rotateX === 0 && p.rotateY === 0 && p.x === 0 && p.y === 0;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const mix = (a: Pose, b: Pose, k: number): Pose => ({
  scale: a.scale + (b.scale - a.scale) * k,
  rotateX: a.rotateX + (b.rotateX - a.rotateX) * k,
  rotateY: a.rotateY + (b.rotateY - a.rotateY) * k,
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  depth: a.depth + (b.depth - a.depth) * k,
});

export function poseAt(moves: readonly Move[], time: number): Pose {
  let current = FLAT;
  for (const move of moves) {
    if (time < move.start) return current;
    if (time < move.end) return mix(move.from, move.to, ease((time - move.start) / (move.end - move.start)));
    current = move.to;
  }
  return current;
}

// What a viewer must read with the camera square: marks, and the clicks and typing they watch.
const READ = new Set(['highlight', 'label', 'click', 'upload', 'type']);

// Shots move the camera; before anything to read, it straightens on its own and stays flat
// until the next shot. A move cut short by the next one starts from wherever it got to.
export function stagePlan(timeline: Pick<Timeline, 'shots' | 'actions' | 'duration'>, portrait = false): StagePlan {
  const reads = timeline.actions.filter(a => READ.has(a.action.kind)).map(a => a.time);
  const moves: Move[] = [];
  const notes: StagePlan['notes'] = [];
  const shots = [...timeline.shots].sort((a, b) => a.time - b.time);

  const at = (time: number) => poseAt(moves, time);
  const push = (start: number, end: number, to: Pose) => {
    const last = moves.at(-1);
    if (last && last.end > start) {
      // Cut the move in progress where it got to.
      const reached = at(start);
      last.end = start;
      last.to = reached;
      if (last.end <= last.start) moves.pop();
    }
    const from = at(start);
    if (end > start) moves.push({ start, end, from, to });
  };

  shots.forEach(({ time, shot }, i) => {
    const target = pose(shot.to, shot.angle, portrait);
    const next = shots[i + 1]?.time ?? timeline.duration;
    const duration = shot.duration ?? CAMERA.move;
    push(time, Math.min(time + duration, timeline.duration), target);
    // Beside text the screen stays square enough to read: it does not straighten.
    if (isFlat(target) || shot.to === 'aside-left' || shot.to === 'aside-right') return;

    const read = reads.find(r => r > time && r < next);
    if (read === undefined) return;
    const flatBy = read - CAMERA.lead;
    const straighten = Math.max(time, flatBy - CAMERA.straighten);
    const reached = Math.min(time + duration, straighten);
    if (flatBy - straighten < CAMERA.straighten - 1e-6) {
      notes.push({ time: read, note: `the camera has ${Math.max(0, flatBy - time).toFixed(2)}s to straighten before what is read at ${read.toFixed(2)}s; move the shot earlier or the mark later` });
    } else if (straighten - reached < CAMERA.shortest) {
      notes.push({ time, note: `the ${shot.to} shot holds ${Math.max(0, straighten - reached).toFixed(2)}s before straightening for ${read.toFixed(2)}s; give it a sentence without marks` });
    }
    push(straighten, Math.max(straighten, flatBy), FLAT);
  });

  const changes = timeline.actions.flatMap(({ time, transition }) => (transition && isStageTransition(transition) ? [{ time, kind: transition }] : []));
  const offFlat = moves.flatMap((move, i) => (isFlat(move.from) && isFlat(move.to) ? []
    : [{ start: move.start, end: isFlat(move.to) ? move.end : (moves[i + 1]?.start ?? timeline.duration) }]));
  const changing = changes.map(({ time }) => ({ start: time, end: Math.min(time + CHANGE_LENGTH, timeline.duration) }));
  return { moves, changes, spans: merge([...offFlat, ...changing]), notes };
}

// Overlapping or touching stretches become one, in time order.
function merge(intervals: StagePlan['spans']): StagePlan['spans'] {
  const spans: StagePlan['spans'] = [];
  for (const { start, end } of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = spans.at(-1);
    if (last && start <= last.end + 1e-6) last.end = Math.max(last.end, end);
    else spans.push({ start, end });
  }
  return spans;
}

export function changeAt(changes: readonly Change[], time: number): { change: Change; progress: number } | null {
  const change = changes.findLast(c => time >= c.time - 1e-9 && time < c.time + CHANGE_LENGTH);
  return change ? { change, progress: (time - change.time) / CHANGE_LENGTH } : null;
}

const STILL: Layer = { x: 0, scale: 1, rotateY: 0, opacity: 1, depth: 0 };
const clamp = (k: number) => Math.min(1, Math.max(0, k));

// Where the old and the new screen sit at a point of the change (0..1). Both shrink a little
// mid-way so the stage shows around them and the move reads as depth, not a wipe.
export function changeLayers(kind: Change['kind'], progress: number): { old: Layer; next: Layer } {
  const { old, next } = layers(kind, ease(clamp(progress)));
  return { old: tidy(old), next: tidy(next) };
}

// No -0 or 1e-17 left over at the ends: they would only make a still frame differ.
const tidy = (layer: Layer): Layer =>
  Object.fromEntries(Object.entries(layer).map(([key, value]) => [key, Math.abs(value) < 1e-9 ? 0 : value])) as unknown as Layer;

function layers(kind: Change['kind'], k: number): { old: Layer; next: Layer } {
  const dip = k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k);
  switch (kind) {
    case 'push': {
      const scale = 1 - 0.12 * dip;
      return {
        old: { ...STILL, x: -1.04 * k, scale, depth: dip },
        next: { ...STILL, x: 1.04 * (1 - k), scale, depth: dip },
      };
    }
    case 'flip': {
      // The card turns half-way on the old face and lands on the new one.
      const scale = 1 - 0.2 * dip;
      return {
        old: { ...STILL, scale, rotateY: -180 * k, opacity: k < 0.5 ? 1 : 0, depth: dip },
        next: { ...STILL, scale, rotateY: 180 * (1 - k), opacity: k < 0.5 ? 0 : 1, depth: dip },
      };
    }
    case 'fly': {
      const gone = clamp(k / 0.7);
      const come = clamp((k - 0.3) / 0.7);
      return {
        old: { ...STILL, scale: 1 - 0.35 * gone, opacity: 1 - gone, depth: gone },
        next: { ...STILL, scale: 1.18 - 0.18 * come, opacity: come, depth: 1 - come },
      };
    }
  }
}

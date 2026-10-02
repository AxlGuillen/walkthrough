import type { Timeline } from '../timeline/build.ts';
import type { Shot } from '../tour/schema.ts';

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

export interface StagePlan {
  moves: Move[];
  // Stretches where the camera is off the flat: only these get rendered on the stage.
  spans: { start: number; end: number }[];
  notes: { time: number; note: string }[];
}

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

export function pose(to: Shot['to'], angle = CAMERA.angle): Pose {
  switch (to) {
    case 'flat': return FLAT;
    case 'wide': return { scale: 0.84, rotateX: 0, rotateY: 0, x: 0, y: 0, depth: 1 };
    case 'left': return { scale: 0.82, rotateX: 2, rotateY: angle, x: -0.012, y: -0.006, depth: 1 };
    case 'right': return { scale: 0.82, rotateX: 2, rotateY: -angle, x: 0.012, y: -0.006, depth: 1 };
    case 'top': return { scale: 0.8, rotateX: angle, rotateY: 0, x: 0, y: -0.03, depth: 1 };
  }
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
const READ = new Set(['highlight', 'label', 'click', 'type']);

// Shots move the camera; before anything to read, it straightens on its own and stays flat
// until the next shot. A move cut short by the next one starts from wherever it got to.
export function stagePlan(timeline: Pick<Timeline, 'shots' | 'actions' | 'duration'>): StagePlan {
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
    const target = pose(shot.to, shot.angle);
    const next = shots[i + 1]?.time ?? timeline.duration;
    const duration = shot.duration ?? CAMERA.move;
    push(time, Math.min(time + duration, timeline.duration), target);
    if (isFlat(target)) return;

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

  return { moves, spans: spansOf(moves, timeline.duration), notes };
}

// Merges the moves that leave, travel off or return to the flat into continuous stretches.
function spansOf(moves: readonly Move[], duration: number): StagePlan['spans'] {
  const spans: StagePlan['spans'] = [];
  moves.forEach((move, i) => {
    if (isFlat(move.from) && isFlat(move.to)) return;
    const end = isFlat(move.to) ? move.end : (moves[i + 1]?.start ?? duration);
    const last = spans.at(-1);
    if (last && move.start <= last.end + 1e-6) last.end = Math.max(last.end, end);
    else spans.push({ start: move.start, end });
  });
  return spans;
}

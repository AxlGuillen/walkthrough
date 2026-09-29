import type { Rect } from '../timeline/camera.ts';

export interface Point {
  x: number;
  y: number;
}

const SAMPLES = 56;

export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Low-frequency noise in [-1, 1]: enough to look hand-drawn without looking shaky.
function wobble(seed: number): (u: number) => number {
  const next = random(seed);
  const [f1, f2] = [1 + Math.floor(next() * 2), 3 + Math.floor(next() * 3)];
  const [p1, p2] = [next(), next()];
  return u => 0.65 * Math.sin(2 * Math.PI * (f1 * u + p1)) + 0.35 * Math.sin(2 * Math.PI * (f2 * u + p2));
}

export function sketchCircle(center: Point, radius: number, seed: number): string {
  const next = random(seed);
  const start = next() * 2 * Math.PI;
  const tilt = (next() - 0.5) * 0.5;
  const squash = 0.82 + next() * 0.12;
  const turns = 1.1 + next() * 0.08;
  const noise = wobble(seed + 1);

  const points: Point[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = (i / SAMPLES) * turns;
    const angle = start + u * 2 * Math.PI;
    const r = radius * (1 + 0.07 * noise(u) - 0.06 * (u - 0.5));
    const x = r * Math.cos(angle);
    const y = r * squash * Math.sin(angle);
    points.push({
      x: center.x + x * Math.cos(tilt) - y * Math.sin(tilt),
      y: center.y + x * Math.sin(tilt) + y * Math.cos(tilt),
    });
  }
  return smoothPath(points);
}

// The wobble pushes each point along the outline's normal, so the gap to the element stays
// even: independent x/y noise used to shear whole edges and read as a misaligned ring.
export function sketchRect(rect: Rect, seed: number, corner = 10): string {
  const next = random(seed);
  const start = next();
  const turns = 1.05 + next() * 0.04;
  const noise = wobble(seed + 1);
  const amplitude = Math.min(1.5, Math.min(rect.width, rect.height) * 0.03);
  const radius = Math.min(corner, rect.width / 2, rect.height / 2);
  const perimeter = 2 * (rect.width + rect.height);

  const points: Point[] = [];
  for (let i = 0; i <= SAMPLES * 2; i++) {
    const u = (i / (SAMPLES * 2)) * turns;
    const f = (start + u) % 1;
    const p = roundedRectPoint(rect, radius, f);
    const step = 1 / perimeter;
    const a = roundedRectPoint(rect, radius, (f - step + 1) % 1);
    const b = roundedRectPoint(rect, radius, (f + step) % 1);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Clockwise outline: the outward normal is the tangent turned left.
    const normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
    const offset = amplitude * noise(u);
    points.push({ x: p.x + normal.x * offset, y: p.y + normal.y * offset });
  }
  return smoothPath(points);
}

export function roundedRectPoint(rect: Rect, radius: number, fraction: number): Point {
  const straightX = rect.width - 2 * radius;
  const straightY = rect.height - 2 * radius;
  const arc = (Math.PI / 2) * radius;
  const corner = (cx: number, cy: number, from: number, d: number): Point => {
    const angle = from + (radius === 0 ? 0 : d / radius);
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
  const pieces: [number, (d: number) => Point][] = [
    [straightX, d => ({ x: rect.x + radius + d, y: rect.y })],
    [arc, d => corner(rect.x + rect.width - radius, rect.y + radius, -Math.PI / 2, d)],
    [straightY, d => ({ x: rect.x + rect.width, y: rect.y + radius + d })],
    [arc, d => corner(rect.x + rect.width - radius, rect.y + rect.height - radius, 0, d)],
    [straightX, d => ({ x: rect.x + rect.width - radius - d, y: rect.y + rect.height })],
    [arc, d => corner(rect.x + radius, rect.y + rect.height - radius, Math.PI / 2, d)],
    [straightY, d => ({ x: rect.x, y: rect.y + rect.height - radius - d })],
    [arc, d => corner(rect.x + radius, rect.y + radius, Math.PI, d)],
  ];

  let distance = fraction * pieces.reduce((sum, [length]) => sum + length, 0);
  for (const [length, at] of pieces) {
    if (distance <= length) return at(distance);
    distance -= length;
  }
  return pieces[0]![1](0);
}

function smoothPath(points: readonly Point[]): string {
  const f = (n: number) => n.toFixed(1);
  const [first, ...rest] = points;
  if (!first) return '';
  let d = `M${f(first.x)} ${f(first.y)}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i]!;
    const q = rest[i + 1]!;
    d += ` Q${f(p.x)} ${f(p.y)} ${f((p.x + q.x) / 2)} ${f((p.y + q.y) / 2)}`;
  }
  const last = rest.at(-1);
  if (last) d += ` L${f(last.x)} ${f(last.y)}`;
  return d;
}

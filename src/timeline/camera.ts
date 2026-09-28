export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface CameraMove {
  time: number;
  duration: number;
  rect: Rect;
}

export const DEFAULT_PADDING = 48;
// Frames are captured at 2x, so zooming past that would upscale pixels.
export const MAX_ZOOM = 2;

export function fullFrame(viewport: Size): Rect {
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
}

export function fitRect(
  target: Rect,
  viewport: Size,
  { padding = DEFAULT_PADDING, maxZoom = MAX_ZOOM }: { padding?: number; maxZoom?: number } = {},
): Rect {
  const aspect = viewport.width / viewport.height;
  let width = target.width + padding * 2;
  let height = target.height + padding * 2;

  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;

  width = Math.min(Math.max(width, viewport.width / maxZoom), viewport.width);
  height = width / aspect;

  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;
  return {
    x: clamp(centerX - width / 2, 0, viewport.width - width),
    y: clamp(centerY - height / 2, 0, viewport.height - height),
    width,
    height,
  };
}

export function cameraAt(time: number, moves: readonly CameraMove[], home: Rect): Rect {
  let origin = home;
  let position = home;
  let previous: { origin: Rect; move: CameraMove } | undefined;

  for (const move of moves) {
    if (time < move.time) break;
    origin = previous ? interpolate(previous.origin, previous.move.rect, progress(move.time, previous.move)) : home;
    position = interpolate(origin, move.rect, progress(time, move));
    previous = { origin, move };
  }
  return position;
}

function progress(time: number, move: CameraMove): number {
  return easeInOutCubic(clamp((time - move.time) / move.duration, 0, 1));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function interpolate(from: Rect, to: Rect, t: number): Rect {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    height: mix(from.height, to.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

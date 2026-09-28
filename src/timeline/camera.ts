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
  follow?: boolean;
}

export const DEFAULT_PADDING = 48;
// Frames are captured at 2x, so zooming past that would upscale pixels.
export const MAX_ZOOM = 2;
// Below this a zoom reads as a wobble rather than a close-up, so it is skipped.
export const MIN_ZOOM = 1.2;
// Share of the frame's width (or height) the target should fill.
export const FILL = 0.6;
const FOLLOW_MARGIN = 0.18;

export interface FitOptions {
  padding?: number;
  maxZoom?: number;
  minZoom?: number;
  fill?: number;
  scale?: number;
}

export function fullFrame(viewport: Size): Rect {
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
}

// Zooms as far as the target needs to fill the frame, not always to the maximum.
export function fitRect(
  target: Rect,
  viewport: Size,
  { padding = DEFAULT_PADDING, maxZoom = MAX_ZOOM, minZoom = MIN_ZOOM, fill = FILL, scale }: FitOptions = {},
): Rect {
  const aspect = viewport.width / viewport.height;
  let width: number;
  if (scale !== undefined) {
    width = viewport.width / clamp(scale, 1, maxZoom);
  } else {
    const needed = Math.max(
      Math.max(target.width + padding * 2, target.width / fill),
      Math.max(target.height + padding * 2, target.height / fill) * aspect,
    );
    if (needed > viewport.width / minZoom) return fullFrame(viewport);
    width = Math.max(needed, viewport.width / maxZoom);
  }
  const height = width / aspect;

  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;
  return {
    x: clamp(centerX - width / 2, 0, viewport.width - width),
    y: clamp(centerY - height / 2, 0, viewport.height - height),
    width,
    height,
  };
}

// `adjust` shifts the frame of moves that follow the cursor. It also applies to where the
// next move starts from, so leaving a followed zoom never jumps back to its base frame.
export function cameraAt(
  time: number, moves: readonly CameraMove[], home: Rect, adjust: (rect: Rect, time: number) => Rect = rect => rect,
): Rect {
  const placed = (origin: Rect, move: CameraMove, at: number) => {
    const rect = interpolate(origin, move.rect, progress(at, move));
    return move.follow ? adjust(rect, at) : rect;
  };
  let position = home;
  let previous: { origin: Rect; move: CameraMove } | undefined;

  for (const move of moves) {
    if (time < move.time) break;
    const origin = previous ? placed(previous.origin, previous.move, move.time) : home;
    position = placed(origin, move, time);
    previous = { origin, move };
  }
  return position;
}

// Moves the frame just enough to keep the cursor inside its inner safe area.
export function followCursor(rect: Rect, cursor: { x: number; y: number }, viewport: Size, margin = FOLLOW_MARGIN): Rect {
  const push = (position: number, start: number, size: number) => {
    const low = start + size * margin;
    const high = start + size * (1 - margin);
    return position < low ? position - low : position > high ? position - high : 0;
  };
  return {
    ...rect,
    x: clamp(rect.x + push(cursor.x, rect.x, rect.width), 0, viewport.width - rect.width),
    y: clamp(rect.y + push(cursor.y, rect.y, rect.height), 0, viewport.height - rect.height),
  };
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

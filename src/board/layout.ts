import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import type { Board } from './schema.ts';

export interface BoardItem {
  text: string;
  x: number;
  y: number;
  // The box drawn before the text, centered on (box.x, y).
  box: { x: number; size: number };
  // When the hand starts writing it, how long it takes, and when it is crossed out.
  time: number;
  write: number;
  done?: number;
}

export interface BoardScene {
  style: Board['style'];
  u: number;
  board: Rect;
  // The ledge under the board, nearer the camera: chalk and an eraser rest on it.
  tray: Rect;
  title?: { text: string; x: number; y: number; size: number };
  items: BoardItem[];
  font: number;
  warnings: string[];
}

export function boardBeats(board: Board): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  board.items.forEach((item, i) => {
    if (item.at !== undefined) beats[`i${i}`] = item.at;
    if (item.done !== undefined) beats[`d${i}`] = item.done;
  });
  return beats;
}

// Permanent Marker capitals run wide (up to 0.57 em a letter).
const CHAR_EM = 0.62;
// Letters per second a hand writes on a board.
const WRITING = 16;
const ENTER = 0.9;

export function writeTime(text: string): number {
  return Math.min(2, Math.max(0.5, text.length / WRITING));
}

export function boardScene(board: Board, canvas: Size, _lang: string, beats: Record<string, number> = {}, duration = Infinity): BoardScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const portrait = canvas.height > canvas.width;
  const warnings: string[] = [];

  // The most the board may take; a short list gets a shorter board, centered in that room.
  const space: Rect = portrait
    ? { x: canvas.width * 0.07, y: canvas.height * 0.17, width: canvas.width * 0.86, height: canvas.height * 0.56 }
    : { x: canvas.width * 0.13, y: canvas.height * 0.1, width: canvas.width * 0.74, height: canvas.height * 0.68 };
  const pad = 6 * u;
  // A long title shrinks to fit the board, down to a size that still reads.
  const titleSize = Math.min(6 * u, board.title ? (space.width - 2 * pad) / (board.title.length * CHAR_EM) : Infinity);
  const titleSpace = board.title ? titleSize * 1.9 : 0;
  const rowHeight = Math.min(10 * u, (space.height - 2 * pad - titleSpace) / board.items.length);
  const height = Math.min(space.height, Math.max(space.height * 0.55, 2 * pad + titleSpace + rowHeight * board.items.length));
  const rect: Rect = { ...space, y: space.y + (space.height - height) / 2, height };
  const tray = { x: rect.x - 2 * u, y: rect.y + rect.height + 0.6 * u, width: rect.width + 4 * u, height: 2.8 * u };
  const title = board.title ? { text: board.title, x: rect.x + pad, y: rect.y + pad + titleSize / 2, size: titleSize } : undefined;
  const top = rect.y + pad + titleSpace;
  const font = Math.min(5 * u, rowHeight * 0.56);
  const boxSize = font * 0.85;
  const boxX = rect.x + pad + boxSize / 2;
  const textX = boxX + boxSize / 2 + 2.6 * u;
  const room = rect.x + rect.width - pad - textX;
  if (title && titleSize < 3.6 * u) warnings.push(`title "${title.text}" is too long for the board; shorten it`);

  const anchored = board.items.map((_, i) => beats[`i${i}`]);
  const times = spreadTimes(anchored, ENTER, ENTER + 1.1 * (board.items.length - 1), 1.1);
  const items = board.items.map((item, i): BoardItem => {
    const time = Math.max(times[i]!, i === 0 ? ENTER : 0);
    const write = writeTime(item.text);
    if (item.text.length * font * CHAR_EM > room) warnings.push(`"${item.text}" is too long for the board; shorten it`);
    const next = times[i + 1];
    if (next !== undefined && next < time + write - 0.2) warnings.push(`"${item.text}" is still being written when the next item starts; say more between them`);
    let done = beats[`d${i}`];
    if (done !== undefined && done < time + write) {
      warnings.push(`"${item.text}" is crossed out before it is written; move its done to a later word`);
      done = time + write + 0.2;
    }
    if (done !== undefined && done > duration - 0.4) warnings.push(`"${item.text}" is crossed out as the board leaves; give it more time`);
    return {
      text: item.text, x: textX, y: top + rowHeight * (i + 0.5), box: { x: boxX, size: boxSize },
      time, write, ...(done === undefined ? {} : { done }),
    };
  });
  const last = items.at(-1)!;
  if (last.time + last.write > duration - 0.6) warnings.push('the last item is still being written as the board leaves; give the segment more time');
  return { style: board.style, u, board: rect, tray, ...(title ? { title } : {}), items, font, warnings };
}

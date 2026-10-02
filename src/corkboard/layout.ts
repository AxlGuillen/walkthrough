import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import { NOTE_COLORS, type Corkboard } from './schema.ts';

export interface CorkNote {
  text: string;
  detail?: string;
  emoji?: string;
  color: (typeof NOTE_COLORS)[number];
  rect: Rect;
  // Degrees, fixed per position so two renders match.
  tilt: number;
  time: number;
}

export interface CorkScene {
  u: number;
  board: Rect;
  title?: { text: string; x: number; y: number; size: number };
  notes: CorkNote[];
  font: { text: number; detail: number };
  warnings: string[];
}

export function corkboardBeats(cork: Corkboard): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  cork.notes.forEach((note, i) => { if (note.at !== undefined) beats[`n${i}`] = note.at; });
  return beats;
}

const TILTS = [-3, 2.2, -1.4, 2.8, -2.4, 1.6];
const CHAR_EM = 0.52;
const MAX_LINES = 4;

// Lines a text takes when wrapped by words into a width.
export function lineCount(text: string, width: number, size: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * CHAR_EM)));
  let lines = 0;
  let used = perLine;
  for (const word of text.split(/\s+/)) {
    if (used + 1 + word.length <= perLine) used += 1 + word.length;
    else {
      // A word longer than a line breaks across as many as it needs.
      lines += Math.ceil(word.length / perLine);
      used = word.length % perLine || perLine;
    }
  }
  return lines;
}

function columns(count: number, portrait: boolean): number {
  if (portrait) return count <= 2 ? 1 : 2;
  return count <= 3 ? count : count === 4 ? 2 : 3;
}

export function corkboardScene(cork: Corkboard, canvas: Size, _lang: string, beats: Record<string, number> = {}): CorkScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const portrait = canvas.height > canvas.width;
  const warnings: string[] = [];
  const board: Rect = portrait
    ? { x: canvas.width * 0.06, y: canvas.height * 0.14, width: canvas.width * 0.88, height: canvas.height * 0.64 }
    : { x: canvas.width * 0.1, y: canvas.height * 0.09, width: canvas.width * 0.8, height: canvas.height * 0.74 };
  const pad = 5 * u;
  const titleSize = 5 * u;
  const title = cork.title ? { text: cork.title, x: board.x + board.width / 2, y: board.y + pad + titleSize / 2, size: titleSize } : undefined;
  const area = { x: board.x + pad, y: board.y + pad + (title ? titleSize * 2.4 : 0), width: board.width - 2 * pad, height: 0 };
  area.height = board.y + board.height - pad - area.y;

  const cols = columns(cork.notes.length, portrait);
  const rows = Math.ceil(cork.notes.length / cols);
  const gap = 4 * u;
  const side = Math.min((area.width - gap * (cols - 1)) / cols, (area.height - gap * (rows - 1)) / rows, 34 * u);
  const text = Math.min(4.6 * u, side * 0.15);
  const detail = text * 0.68;
  const inner = side * 0.82;

  const anchored = cork.notes.map((_, i) => beats[`n${i}`]);
  const times = spreadTimes(anchored, 0.8, 0.8 + 0.5 * (cork.notes.length - 1), 0.45);
  const notes = cork.notes.map((note, i): CorkNote => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, cork.notes.length - row * cols);
    const rowWidth = inRow * side + (inRow - 1) * gap;
    const x = area.x + (area.width - rowWidth) / 2 + (i - row * cols) * (side + gap);
    const y = area.y + (area.height - (rows * side + (rows - 1) * gap)) / 2 + row * (side + gap);
    const lines = lineCount(note.text, inner, text) + (note.detail ? lineCount(note.detail, inner, detail) * 0.7 : 0) + (note.emoji ? 1.4 : 0);
    if (lines > MAX_LINES + 0.5) warnings.push(`"${note.text}" does not fit its note; shorten it or move words to detail`);
    return {
      text: note.text, ...(note.detail ? { detail: note.detail } : {}), ...(note.emoji ? { emoji: note.emoji } : {}),
      color: note.color ?? NOTE_COLORS[i % 4]!, rect: { x, y, width: side, height: side }, tilt: TILTS[i]!, time: times[i]!,
    };
  });
  return { u, board, ...(title ? { title } : {}), notes, font: { text, detail }, warnings };
}

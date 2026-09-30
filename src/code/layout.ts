import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import { tokenLines, type Token } from './highlight.ts';
import { parseLines, type Code } from './schema.ts';

export type LineKind = 'code' | 'add' | 'del' | 'command' | 'output';

// Everything code.html paints, in canvas pixels, with each line's tokens and its timing on
// the overlay's clock. `typed` lines appear character by character at `cps`.
export interface CodeLine {
  kind: LineKind;
  number: number | null;
  tokens: Token[];
  chars: number;
  start: number;
  cps: number | null;
}

export interface CodeHighlight {
  lines: number[];
  time: number;
  note?: string;
  // The code block is scaled around this point while the highlight is on (1: no zoom).
  focus: { y: number; scale: number };
}

export interface CodeScene {
  view: Code['view'];
  reveal: Code['reveal'];
  mode: Code['mode'];
  u: number;
  window: Rect;
  bar: number;
  label: string;
  body: Rect;
  font: number;
  line: number;
  gutter: number;
  lines: CodeLine[];
  highlights: CodeHighlight[];
  warnings: string[];
}

// The beat each part appears on; the loader lifts each `at` into these names.
export function codeBeats(code: Code): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  code.highlight.forEach((h, i) => { if (h.at !== undefined) beats[`h${i}`] = h.at; });
  code.run.forEach((at, i) => { beats[`r${i}`] = at; });
  return beats;
}

// Monospace advance in ems, a little generous so a line measured here never overflows.
const MONO_EM = 0.62;
const LINE = 1.55;
const TYPE_CPS = 38;
const COMMAND_CPS = 22;
const ZOOM_OVER = 14;

function split(code: Code): { kind: LineKind; text: string }[] {
  const raw = code.code.replace(/\s+$/, '').split('\n');
  if (code.view === 'diff') {
    return raw.map(line => ({ kind: line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'code', text: line.replace(/^[+\- ]/, '') }));
  }
  if (code.view === 'terminal') return raw.map(line => (line.startsWith('$ ') ? { kind: 'command', text: line.slice(2) } : { kind: 'output', text: line }));
  return raw.map(text => ({ kind: 'code', text }));
}

export function codeScene(code: Code, canvas: Size, _lang: string, beats: Record<string, number> = {}, duration = Infinity): CodeScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const portrait = canvas.height > canvas.width;
  const card = code.mode === 'card';
  const warnings: string[] = [];
  const parts = split(code);

  // Tokens over the whole text, so a comment or string spanning lines keeps its color. A
  // terminal highlights its commands as shell and leaves the output plain.
  const tokens = code.view === 'terminal'
    ? parts.map(p => (p.kind === 'command' ? tokenLines(p.text, 'bash')[0] ?? [] : [{ kind: 'plain' as const, text: p.text }]))
    : tokenLines(parts.map(p => p.text).join('\n'), code.language);

  const numbered = code.view !== 'terminal';
  const digits = numbered ? String(parts.length).length : 0;
  const longest = Math.max(1, ...parts.map(p => p.text.length + (p.kind === 'command' ? 2 : 0)));

  const frame: Rect = card
    ? portrait
      ? { x: 4 * u, y: canvas.height * 0.48, width: canvas.width - 8 * u, height: canvas.height * 0.52 - 6 * u }
      : { x: canvas.width * 0.46, y: 8 * u, width: canvas.width * 0.54 - 5 * u, height: canvas.height - 16 * u }
    : { x: canvas.width * (portrait ? 0.04 : 0.08), y: 9 * u, width: canvas.width * (portrait ? 0.92 : 0.84), height: canvas.height - 18 * u };
  const bar = (card ? 4.5 : 5.5) * u;
  const pad = (card ? 2.4 : 3) * u;
  const innerWidth = frame.width - 2 * pad;
  const innerHeight = frame.height - bar - 2 * pad;
  const gutterChars = numbered ? digits + 2 : 0;
  const fitWidth = innerWidth / ((longest + gutterChars) * MONO_EM);
  const fitHeight = innerHeight / (parts.length * LINE);
  const max = (card ? 2.2 : 2.8) * u;
  const min = 1.3 * u;
  let font = Math.min(max, fitWidth, fitHeight);
  if (font < min) {
    warnings.push(fitWidth < min
      ? `a line of ${longest} characters does not fit; break it or show less code`
      : `${parts.length} lines do not fit; show less code or highlight the part that matters`);
    font = min;
  }
  const line = font * LINE;
  const gutter = gutterChars * font * MONO_EM;
  const bodyHeight = parts.length * line;
  // The window hugs its code: as tall as the lines need, centered where the frame allows.
  const height = Math.min(frame.height, bar + 2 * pad + bodyHeight);
  const window: Rect = { ...frame, y: card ? frame.y : frame.y + (frame.height - height) / 2, height };
  const body: Rect = { x: window.x + pad, y: window.y + bar + pad, width: innerWidth, height: Math.min(bodyHeight, innerHeight) };

  // Timing: how each line appears.
  const start = beats.start ?? 0.5;
  let clock = start;
  let command = 0;
  const lines: CodeLine[] = parts.map((part, i) => {
    const chars = part.text.length;
    let lineStart = start;
    let cps: number | null = null;
    if (code.view === 'terminal') {
      if (part.kind === 'command') {
        lineStart = beats[`r${command}`] ?? (command === 0 ? 0.6 : clock + 0.4);
        cps = COMMAND_CPS;
        clock = lineStart + chars / COMMAND_CPS + 0.25;
        command++;
      } else {
        lineStart = clock;
        clock += 0.06;
      }
    } else if (code.reveal === 'type') {
      lineStart = clock;
      cps = TYPE_CPS;
      clock += chars / TYPE_CPS + 0.05;
    } else if (code.reveal === 'lines') {
      lineStart = start + i * 0.08;
      clock = lineStart + 0.3;
    } else {
      clock = start + 0.3;
    }
    return { kind: part.kind, number: numbered ? i + 1 : null, tokens: tokens[i] ?? [], chars, start: lineStart, cps };
  });

  // The zoom never pushes a line past the right edge: at most as far as the widest line fits.
  const widest = gutter + (code.view === 'editor' ? 0 : 2 * font * MONO_EM) + longest * font * MONO_EM;
  const roomToZoom = body.width / widest;
  const anchored = code.highlight.map((_, i) => beats[`h${i}`]);
  const times = spreadTimes(anchored, clock + 0.4, clock + 0.4 + 1.6 * (code.highlight.length - 1), 1.2);
  const highlights = code.highlight.map((h, i): CodeHighlight => {
    const covered = parseLines(h.lines).filter(n => n >= 1 && n <= parts.length);
    if (covered.length < parseLines(h.lines).length) warnings.push(`highlight ${i + 1} names lines past the end of the code (${parts.length} lines)`);
    const indexes = covered.map(n => n - 1);
    const middle = indexes.length ? ((Math.min(...indexes) + Math.max(...indexes) + 1) / 2) * line : bodyHeight / 2;
    const wanted = parts.length > ZOOM_OVER && indexes.length > 0 ? Math.min(1.5, Math.max(1.15, ZOOM_OVER / Math.max(4, indexes.length * 2))) : 1;
    const scale = Math.min(wanted, roomToZoom);
    return {
      lines: indexes, time: times[i]!, ...(h.note ? { note: h.note } : {}),
      // Below 1.1 a zoom reads as a jitter rather than a move.
      focus: { y: middle, scale: scale >= 1.1 ? scale : 1 },
    };
  });

  // Typing or a highlight that the overlay leaves before it can be read.
  const typedEnd = Math.max(0, ...lines.filter(l => l.cps).map(l => l.start + l.chars / l.cps!));
  if (typedEnd > duration - 0.3) warnings.push(`the code is still typing at ${typedEnd.toFixed(1)}s but the overlay leaves at ${duration.toFixed(1)}s; lengthen the narration or type less`);
  highlights.forEach((h, i) => {
    if (h.time > duration - 1) warnings.push(`highlight ${i + 1} comes at ${h.time.toFixed(1)}s, too close to the end (${duration.toFixed(1)}s) to be read`);
  });

  const label = code.title ?? code.file ?? (code.view === 'terminal' ? 'Terminal' : code.language ?? '');
  return { view: code.view, reveal: code.reveal, mode: code.mode, u, window, bar, label, body, font, line, gutter, lines, highlights, warnings };
}

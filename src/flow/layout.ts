import { arrowPaths, wrapText } from '../effects/label.ts';
import { sketchRect } from '../effects/sketch.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import type { TimedFlow } from '../timeline/build.ts';

export interface FlowBox {
  rect: Rect;
  lines: string[];
  detail: string[];
  truncated: boolean;
}

export interface FlowLayout {
  canvas: Size;
  mode: TimedFlow['mode'];
  direction: 'row' | 'column';
  panel?: Rect;
  title?: { text: string; x: number; y: number; size: number };
  font: { text: number; detail: number; line: number; detailLine: number; badge: number; badgeGap: number; detailGap: number };
  pad: number;
  gap: number;
  radius: number;
  stroke: number;
  boxes: FlowBox[];
  arrows: { shaft: string; head: string }[];
  rings: string[];
}

// Rough advance of a semibold sans glyph, in ems: layout happens in Node, before any text
// exists. Slightly generous, so a line measured here never overflows in the browser.
export const CHAR_EM = 0.58;
const MAX_LINES = 3;

// Sizes are in u, a hundredth of the canvas' short side, so a flow reads the same in 16:9
// and 9:16 and in a half-size preview.
export function layoutFlow(flow: Pick<TimedFlow, 'mode' | 'title' | 'steps'>, canvas: Size): FlowLayout {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const direction = canvas.width >= canvas.height ? 'row' : 'column';
  const card = flow.mode === 'card';
  const edge = 4 * u;
  const inset = card ? 3 * u : 0;
  const gap = (card ? 5 : direction === 'row' ? 8 : 6) * u;
  const pad = (card ? 1.8 : 2.2) * u;
  const radius = 1.6 * u;
  const n = flow.steps.length;

  const outer = card
    ? { x: edge, width: canvas.width - 2 * edge }
    : { x: canvas.width * 0.07, width: canvas.width * 0.86 };
  const innerWidth = outer.width - 2 * inset;
  const boxWidth = direction === 'row' ? Math.min((card ? 28 : 34) * u, (innerWidth - (n - 1) * gap) / n) : innerWidth * (card ? 1 : 0.9);
  const textSize = direction === 'row'
    ? clamp(boxWidth * (card ? 0.1 : 0.11), (card ? 1.9 : 2.2) * u, (card ? 2.6 : 3.4) * u)
    : (card ? 2.6 : 3.2) * u;

  const font = {
    text: textSize, detail: textSize * 0.72, line: textSize * 1.22, detailLine: textSize * 0.72 * 1.35,
    badge: textSize * 1.5, badgeGap: 1.2 * u, detailGap: 0.6 * u,
  };
  // A column puts the number beside the text; a row stacks it above, where there is height.
  const textWidth = boxWidth - 2 * pad - (direction === 'column' ? font.badge + font.badgeGap : 0);
  const content = flow.steps.map(step => {
    const lines = wrapText(step.text, charsFor(textWidth, font.text), MAX_LINES);
    const detail = step.detail ? wrapText(step.detail, charsFor(textWidth, font.detail), MAX_LINES) : [];
    const truncated = [...lines, ...detail].some(line => line.endsWith('…'));
    const body = lines.length * font.line + (detail.length ? font.detailGap + detail.length * font.detailLine : 0);
    const height = direction === 'row' ? font.badge + font.badgeGap + body : Math.max(font.badge, body);
    return { lines, detail, truncated, height: height + 2 * pad };
  });
  const boxHeight = Math.max(...content.map(c => c.height));

  const rowLength = direction === 'row' ? n * boxWidth + (n - 1) * gap : boxWidth;
  const columnLength = direction === 'row' ? boxHeight : n * boxHeight + (n - 1) * gap;
  const titleSize = card ? 2.4 * u : 4.6 * u;
  const titleSpace = flow.title ? titleSize * 1.2 + (card ? 2 : 6) * u : 0;

  let panel: Rect | undefined;
  let top: number;
  const left = outer.x + (outer.width - rowLength) / 2;
  if (card) {
    // As wide as its steps, not the screen: the title lines up with the first box.
    const height = 2 * inset + titleSpace + columnLength;
    panel = { x: left - inset, y: canvas.height - edge - height, width: rowLength + 2 * inset, height };
    top = panel.y + inset + titleSpace;
  } else {
    top = (canvas.height - (titleSpace + columnLength)) / 2 + titleSpace;
  }

  const boxes: FlowBox[] = content.map(({ lines, detail, truncated }, i) => ({
    rect: direction === 'row'
      ? { x: left + i * (boxWidth + gap), y: top, width: boxWidth, height: boxHeight }
      : { x: left, y: top + i * (boxHeight + gap), width: boxWidth, height: boxHeight },
    lines, detail, truncated,
  }));

  const clearance = u;
  const arrows = boxes.slice(1).map((box, i) => {
    const from = boxes[i]!.rect;
    const to = box.rect;
    const bend = i % 2 === 0 ? 0.06 : -0.06;
    return direction === 'row'
      ? arrowPaths({ x: from.x + from.width + clearance, y: from.y + from.height / 2 }, { x: to.x - clearance, y: to.y + to.height / 2 }, bend)
      : arrowPaths({ x: from.x + from.width / 2, y: from.y + from.height + clearance }, { x: to.x + to.width / 2, y: to.y - clearance }, bend);
  });
  const ringPad = 1.1 * u;
  const rings = boxes.map(({ rect }, i) => sketchRect(
    { x: rect.x - ringPad, y: rect.y - ringPad, width: rect.width + 2 * ringPad, height: rect.height + 2 * ringPad },
    i * 7 + 3, radius + ringPad,
  ));

  const title = flow.title
    ? { text: flow.title, x: left, y: top - titleSpace, size: titleSize }
    : undefined;

  return {
    canvas, mode: flow.mode, direction, ...(panel ? { panel } : {}), ...(title ? { title } : {}),
    font, pad, gap, radius, stroke: 0.35 * u, boxes, arrows, rings,
  };
}

function charsFor(width: number, size: number): number {
  return Math.max(4, Math.floor(width / (size * CHAR_EM)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

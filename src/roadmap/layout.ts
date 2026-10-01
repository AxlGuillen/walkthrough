import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import type { Roadmap } from './schema.ts';

// A block of text: its box is `width` wide, aligned and anchored at (x, y) as named.
export interface RoadmapText {
  x: number;
  y: number;
  width: number;
  align: 'center' | 'left';
  anchor: 'top' | 'bottom';
}

export interface RoadmapMilestone {
  x: number;
  y: number;
  status: Roadmap['milestones'][number]['status'];
  time: number;
  date?: string;
  title: string;
  detail?: string;
  emoji?: string;
  // Landscape puts the date above the line and the rest below; portrait stacks it all beside.
  dateBox?: RoadmapText;
  body: RoadmapText;
}

export interface RoadmapScene {
  mode: Roadmap['mode'];
  orientation: 'horizontal' | 'vertical';
  u: number;
  panel?: Rect;
  title?: { text: string; x: number; y: number; size: number };
  node: number;
  gap: number;
  font: { date: number; title: number; detail: number };
  milestones: RoadmapMilestone[];
  // The line into each milestone after the first, drawn as it arrives.
  segments: { from: { x: number; y: number }; to: { x: number; y: number }; start: number; end: number; upcoming: boolean }[];
  warnings: string[];
}

export function roadmapBeats(roadmap: Roadmap): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  roadmap.milestones.forEach((m, i) => { if (m.at !== undefined) beats[`m${i}`] = m.at; });
  return beats;
}

const CHAR_EM = 0.53;
const DRAW = 0.45;
const lines = (text: string | undefined, size: number, width: number) => (text ? Math.ceil((text.length * size * CHAR_EM) / width) : 0);

export function roadmapScene(roadmap: Roadmap, canvas: Size, _lang: string, beats: Record<string, number> = {}): RoadmapScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const vertical = canvas.height > canvas.width;
  const card = roadmap.mode === 'card';
  const warnings: string[] = [];
  const list = roadmap.milestones;
  const n = list.length;

  // The space it may take; the milestones are then centered in it and a card hugs them.
  const region: Rect = card
    ? vertical
      ? { x: 4 * u, y: canvas.height * 0.4, width: canvas.width - 8 * u, height: canvas.height * 0.6 - 6 * u }
      : { x: canvas.width * 0.08, y: canvas.height * 0.5, width: canvas.width * 0.84, height: canvas.height * 0.5 - 6 * u }
    : { x: canvas.width * 0.07, y: 10 * u, width: canvas.width * 0.86, height: canvas.height - 20 * u };
  const inset = card ? 3 * u : 0;
  const inner = { x: region.x + inset, width: region.width - 2 * inset };
  const titleSize = (card ? 3 : 4.4) * u;
  const titleSpace = roadmap.title ? titleSize * 1.2 + 4 * u : 0;
  const scale = card ? 0.85 : 1;
  const font = vertical
    ? { date: 2.5 * u * scale, title: 3.8 * u * scale, detail: 2.7 * u * scale }
    : { date: 2.1 * u * scale, title: 3 * u * scale, detail: 2.2 * u * scale };
  const gap = 0.8 * u;
  const node = (list.some(m => m.emoji) ? 3.8 : 1.8) * u * scale;
  const dateHeight = font.date * 1.2;

  const anchored = list.map((_, i) => beats[`m${i}`]);
  const times = spreadTimes(anchored, 0.8, 0.8 + 0.7 * (n - 1), DRAW + 0.15);

  let contentHeight: number;
  let place: (i: number, top: number) => Omit<RoadmapMilestone, 'status' | 'time' | 'title' | 'date' | 'detail' | 'emoji'>;
  if (vertical) {
    const x = inner.x + node + u;
    const width = inner.x + inner.width - (x + node + 3 * u);
    const textHeight = list.map(m => (m.date ? dateHeight + gap : 0) + lines(m.title, font.title, width) * font.title * 1.2 + (m.detail ? gap + lines(m.detail, font.detail, width) * font.detail * 1.4 : 0) + (m.status === 'now' ? gap + font.date * 1.8 : 0));
    const room = (region.height - 2 * inset - titleSpace) / n;
    const slot = Math.min(room, Math.max(...textHeight, node * 2) + 5 * u);
    textHeight.forEach((h, i) => { if (h > slot * 0.95) warnings.push(`milestone "${list[i]!.title}" is too tall for its place; shorten its detail or show fewer milestones`); });
    contentHeight = titleSpace + slot * n;
    // The title's first line sits level with the node, the date just above it.
    place = (i, top) => {
      const y = top + slot * (i + 0.5);
      const above = (list[i]!.date ? dateHeight + gap : 0) + font.title * 0.6;
      return { x, y, body: { x: x + node + 3 * u, y: y - above, width, align: 'left', anchor: 'top' } };
    };
  } else {
    const slot = inner.width / n;
    const width = slot * 0.9;
    list.forEach(m => {
      if (lines(m.title, font.title, width) > 2) warnings.push(`milestone "${m.title}" takes more than two lines; shorten it`);
      if (lines(m.detail, font.detail, width) > 3) warnings.push(`the detail of "${m.title}" takes more than three lines; shorten it`);
    });
    const dateSpace = list.some(m => m.date) ? dateHeight + 2.4 * u : 0;
    const below = Math.max(...list.map(m => lines(m.title, font.title, width) * font.title * 1.2 + (m.detail ? gap + lines(m.detail, font.detail, width) * font.detail * 1.4 : 0) + (m.status === 'now' ? gap + font.date * 1.8 : 0)));
    contentHeight = titleSpace + dateSpace + 2 * node + 2.4 * u + below;
    place = (i, top) => {
      const x = inner.x + slot * (i + 0.5);
      const y = top + dateSpace + node;
      return {
        x, y,
        ...(list[i]!.date ? { dateBox: { x, y: y - node - 2.4 * u, width, align: 'center', anchor: 'bottom' } as RoadmapText } : {}),
        body: { x, y: y + node + 2.4 * u, width, align: 'center', anchor: 'top' },
      };
    };
  }
  const contentY = region.y + inset + (region.height - 2 * inset - contentHeight) / 2;
  const panel: Rect | undefined = card ? { x: region.x, y: contentY - inset, width: region.width, height: contentHeight + 2 * inset } : undefined;
  const title = roadmap.title ? { text: roadmap.title, x: inner.x, y: contentY, size: titleSize } : undefined;

  const milestones = list.map((m, i): RoadmapMilestone => ({
    status: m.status, time: times[i]!, title: m.title,
    ...(m.date ? { date: m.date } : {}), ...(m.detail ? { detail: m.detail } : {}), ...(m.emoji ? { emoji: m.emoji } : {}),
    ...place(i, contentY + titleSpace),
  }));
  const segments = milestones.slice(1).map((m, i) => {
    const from = milestones[i]!;
    // Into the next milestone, ending as it appears; the way still ahead is drawn fainter.
    return { from: { x: from.x, y: from.y }, to: { x: m.x, y: m.y }, start: Math.max(from.time, m.time - DRAW), end: m.time, upcoming: m.status === 'next' };
  });

  if (list.filter(m => m.status === 'now').length > 1) warnings.push('more than one milestone is "now"; mark one');
  return { mode: roadmap.mode, orientation: vertical ? 'vertical' : 'horizontal', u, ...(panel ? { panel } : {}), ...(title ? { title } : {}), node, gap, font, milestones, segments, warnings };
}

import { room } from '../stage/plan.ts';
import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import type { Aside } from './schema.ts';

export interface TitleRun {
  text: string;
  em: boolean;
  // Continues the word before it: the line may not break between them.
  glued?: true;
}

export interface AsideScene {
  layout: Aside['layout'];
  align: 'left' | 'center';
  box: Rect;
  eyebrow?: string;
  // The title in runs, the emphasized ones in italics.
  title: TitleRun[];
  points: { text: string; emoji?: string; time: number }[];
  font: { eyebrow: number; title: number; point: number };
  // When the screen has set itself aside and the title can rise, and when everything leaves.
  enter: number;
  exit: number;
  warnings: string[];
}

export function asideBeats(aside: Aside): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  aside.points.forEach((p, i) => { if (p.at !== undefined) beats[`p${i}`] = p.at; });
  return beats;
}

export function titleRuns(title: string): TitleRun[] {
  const runs = title.split(/(\*[^*]+\*)/).filter(Boolean).map(run => (run.startsWith('*') && run.endsWith('*') && run.length > 2
    ? { text: run.slice(1, -1), em: true } : { text: run, em: false }));
  // An emphasis touching the letters or the comma beside it ("*placed*,") is one word. Each word
  // rises in a box of its own, and the line may break between boxes, so the pieces on either side
  // of the seam are split off and the later one marked glued.
  return runs.flatMap((run, i) => {
    const pieces: TitleRun[] = [];
    let rest = run.text;
    if (i > 0 && /\S$/.test(runs[i - 1]!.text) && /^\S/.test(rest)) {
      const head = rest.match(/^\S+/)![0];
      pieces.push({ text: head, em: run.em, glued: true });
      rest = rest.slice(head.length);
    }
    if (i < runs.length - 1 && /\S$/.test(rest) && /^\S/.test(runs[i + 1]!.text)) {
      const tail = rest.match(/\S+$/)![0];
      if (rest.length > tail.length) pieces.push({ text: rest.slice(0, -tail.length), em: run.em });
      pieces.push({ text: tail, em: run.em });
    } else if (rest) {
      pieces.push({ text: rest, em: run.em });
    }
    return pieces;
  });
}

// Average advance of the display faces, in ems (Inter 800 at -0.03em: 0.47); generous, so a fit
// here never overflows.
const CHAR_EM = 0.5;
const lines = (text: string, size: number, width: number) => Math.ceil((text.length * size * CHAR_EM) / width);
const EXIT = 0.6;

export function asideScene(aside: Aside, canvas: Size, _lang: string, beats: Record<string, number> = {}, duration = Infinity): AsideScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const box = room(aside.layout, canvas);
  const inset = aside.layout === 'inset';
  const warnings: string[] = [];
  const title = aside.title.replaceAll('*', '');

  // The largest title that keeps to three lines (two over an inset screen), within reason.
  const most = inset ? 2 : 3;
  let titleSize = (inset ? 9 : 7) * u;
  while (titleSize > 3.6 * u && lines(title, titleSize, box.width) > most) titleSize -= 0.2 * u;
  if (lines(title, titleSize, box.width) > most) warnings.push(`the title does not fit beside the screen in ${most} lines; shorten it`);
  const font = { eyebrow: 1.9 * u, title: titleSize, point: 2.6 * u };

  const height = (aside.eyebrow ? font.eyebrow * 1.2 + 2.4 * u : 0) + lines(title, titleSize, box.width) * titleSize * 1.05
    + (aside.points.length ? 3.5 * u : 0)
    + aside.points.reduce((sum, p) => sum + lines(p.text, font.point, box.width - 6 * u) * font.point * 1.35 + 1.8 * u, 0);
  if (height > box.height) warnings.push('the text is taller than the room beside the screen; use fewer points or a shorter title');
  if (inset && aside.points.length) warnings.push('an inset screen leaves room for a title, not for points; set the screen aside instead');

  const enter = 0.45;
  const titleDone = enter + 0.5 + 0.06 * title.split(/\s+/).length;
  const anchored = aside.points.map((_, i) => beats[`p${i}`]);
  const times = spreadTimes(anchored, titleDone + 0.3, titleDone + 0.3 + 0.7 * Math.max(0, aside.points.length - 1), 0.5);
  const exit = Math.max(titleDone, duration - EXIT);
  times.forEach((time, i) => {
    if (time > exit - 1) warnings.push(`point "${aside.points[i]!.text}" comes at ${time.toFixed(1)}s, too late to be read before the text leaves`);
  });

  return {
    layout: aside.layout, align: inset ? 'center' : 'left', box,
    ...(aside.eyebrow ? { eyebrow: aside.eyebrow } : {}),
    title: titleRuns(aside.title),
    points: aside.points.map((p, i) => ({ text: p.text, ...(p.emoji ? { emoji: p.emoji } : {}), time: times[i]! })),
    font, enter, exit, warnings,
  };
}

import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import { formatChange, formatNumber, niceScale, unitSuffix, type NumberStyle } from './scale.ts';
import type { Chart } from './schema.ts';

// Everything chart.html paints, in canvas pixels, with its numbers already formatted. The
// page only draws and animates it; `count` is what a counting number animates towards.
export interface Count {
  from: number;
  to: number;
  decimals: number;
  prefix: string;
  suffix: string;
}

export interface ChartText {
  text: string;
  x: number;
  y: number;
  size: number;
}

interface Base {
  mode: 'full' | 'card';
  u: number;
  panel?: Rect;
  title?: ChartText;
  truncated: string[];
}

export interface BarScene extends Base {
  type: 'bar';
  plot: Rect;
  grid: ChartText[];
  bars: { rect: Rect; label: ChartText; value: ChartText; count: Count; highlight: boolean; time: number }[];
}

export interface LineScene extends Base {
  type: 'line';
  plot: Rect;
  grid: ChartText[];
  line: string;
  area: string;
  points: { x: number; y: number; label: ChartText; value: ChartText; count: Count; time: number; fraction: number }[];
}

export interface DonutScene extends Base {
  type: 'donut';
  center: { x: number; y: number };
  radius: number;
  width: number;
  fraction: number;
  value: ChartText;
  count: Count;
  label: ChartText;
}

export interface StatScene extends Base {
  type: 'stat';
  value: ChartText;
  count: Count;
  label: ChartText;
}

export interface CompareScene extends Base {
  type: 'compare';
  before: { label: ChartText; value: ChartText; count: Count };
  after: { label: ChartText; value: ChartText; count: Count };
  arrow: string;
  change: ChartText;
}

export type ChartScene = BarScene | LineScene | DonutScene | StatScene | CompareScene;

// The beat each part of a chart appears on; the loader lifts each `at` into these names.
export function chartBeats(chart: Chart): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  if (chart.type === 'bar' || chart.type === 'line') chart.series.forEach((p, i) => { if (p.at !== undefined) beats[`p${i}`] = p.at; });
  if ((chart.type === 'donut' || chart.type === 'stat') && chart.at !== undefined) beats.value = chart.at;
  if (chart.type === 'compare') {
    if (chart.before.at !== undefined) beats.before = chart.before.at;
    if (chart.after.at !== undefined) beats.after = chart.after.at;
  }
  return beats;
}

// Rough advance of a bold sans glyph in ems, generous so text measured here never overflows.
const CHAR_EM = 0.58;

// When each point of a series appears, on the overlay's clock: on its beat when it has one,
// spread between its anchored neighbors when not, as the steps of a flow are.
export function seriesTimes(count: number, beats: Record<string, number>, first = 0.5, pace = 0.3): number[] {
  const anchored = Array.from({ length: count }, (_, i) => beats[`p${i}`]);
  return spreadTimes(anchored, first, first + pace * (count - 1), pace);
}

export function chartScene(chart: Chart, canvas: Size, lang: string, beats: Record<string, number> = {}, _duration = Infinity): ChartScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const portrait = canvas.height > canvas.width;
  const style: NumberStyle = { lang, decimals: chart.decimals ?? 0, prefix: chart.prefix ?? '', unit: chart.unit ?? '' };
  const count = (to: number, from = 0): Count => ({ from, to, decimals: style.decimals ?? 0, prefix: style.prefix ?? '', suffix: unitSuffix(style.unit) });
  const truncated: string[] = [];
  const fit = (text: string, width: number, size: number) => {
    const max = Math.max(3, Math.floor(width / (size * CHAR_EM)));
    if (text.length <= max) return text;
    truncated.push(text);
    return `${text.slice(0, max - 1)}…`;
  };

  // The area the chart lives in: the whole frame, or a panel over the app (right half in
  // 16:9, lower half in 9:16).
  const card = chart.mode === 'card';
  const panel: Rect | undefined = !card ? undefined : portrait
    ? { x: 4 * u, y: canvas.height * 0.5, width: canvas.width - 8 * u, height: canvas.height * 0.5 - 6 * u }
    : { x: canvas.width * 0.5, y: 8 * u, width: canvas.width * 0.5 - 6 * u, height: canvas.height - 16 * u };
  const area = panel
    ? { x: panel.x + 4 * u, y: panel.y + 4 * u, width: panel.width - 8 * u, height: panel.height - 8 * u }
    : { x: canvas.width * 0.08, y: 10 * u, width: canvas.width * 0.84, height: canvas.height - 20 * u };
  const titleSize = (card ? 3 : 4.6) * u;
  const title = chart.title ? { text: fit(chart.title, area.width, titleSize), x: area.x, y: area.y, size: titleSize } : undefined;
  const body = title ? { ...area, y: area.y + titleSize * 1.2 + 5 * u, height: area.height - titleSize * 1.2 - 5 * u } : area;
  const base = { mode: chart.mode, u, ...(panel ? { panel } : {}), ...(title ? { title } : {}), truncated };

  const labelSize = (card ? 1.9 : 2.3) * u;
  const valueSize = (card ? 2.1 : 2.6) * u;
  const tickSize = (card ? 1.6 : 1.9) * u;

  if (chart.type === 'bar' || chart.type === 'line') {
    const scale = niceScale(Math.max(...chart.series.map(p => p.value)));
    const tickWidth = Math.max(...scale.ticks.map(t => formatNumber(t, { ...style, unit: '' }).length)) * tickSize * CHAR_EM + 2 * u;
    const plot = { x: body.x + tickWidth, y: body.y + valueSize * 1.6, width: body.width - tickWidth, height: body.height - valueSize * 1.6 - labelSize * 2.2 };
    const yOf = (value: number) => plot.y + plot.height * (1 - value / scale.top);
    const grid = scale.ticks.map(t => ({ text: formatNumber(t, { ...style, unit: '' }), x: plot.x - 2 * u, y: yOf(t), size: tickSize }));
    const slot = plot.width / chart.series.length;

    const times = seriesTimes(chart.series.length, beats, 0.5, chart.type === 'bar' ? 0.22 : 0.35);
    if (chart.type === 'bar') {
      const width = Math.min(slot * 0.62, 16 * u);
      const bars = chart.series.map((p, i) => {
        const x = plot.x + slot * i + (slot - width) / 2;
        const top = yOf(Math.max(0, p.value));
        return {
          rect: { x, y: top, width, height: plot.y + plot.height - top },
          label: { text: fit(p.label, slot - u, labelSize), x: x + width / 2, y: plot.y + plot.height + labelSize * 1.5, size: labelSize },
          value: { text: formatNumber(p.value, style), x: x + width / 2, y: top - valueSize * 0.6, size: valueSize },
          count: count(p.value), highlight: chart.highlight === p.label, time: times[i]!,
        };
      });
      return { ...base, type: 'bar', plot, grid, bars };
    }

    const xy = chart.series.map((p, i) => ({ x: plot.x + slot * (i + 0.5), y: yOf(p.value) }));
    // How far along the line each point sits, by length: the stroke draws to it on its beat.
    const lengths = xy.map((p, i) => (i ? Math.hypot(p.x - xy[i - 1]!.x, p.y - xy[i - 1]!.y) : 0));
    const total = lengths.reduce((sum, l) => sum + l, 0) || 1;
    let run = 0;
    const points = chart.series.map((p, i) => {
      const { x, y } = xy[i]!;
      run += lengths[i]!;
      return {
        x, y, time: times[i]!, fraction: run / total,
        label: { text: fit(p.label, slot, labelSize), x, y: plot.y + plot.height + labelSize * 1.5, size: labelSize },
        value: { text: formatNumber(p.value, style), x, y: y - valueSize * 0.9, size: valueSize },
        count: count(p.value),
      };
    });
    const f = (n: number) => n.toFixed(1);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');
    const bottom = f(plot.y + plot.height);
    const area2 = `${line} L${f(points.at(-1)!.x)} ${bottom} L${f(points[0]!.x)} ${bottom} Z`;
    return { ...base, type: 'line', plot, grid, line, area: area2, points };
  }

  const cx = body.x + body.width / 2;
  const cy = body.y + body.height / 2;

  if (chart.type === 'donut') {
    const radius = Math.min(body.width, body.height) * 0.34;
    const valueText = formatNumber(chart.value, style);
    const valueSize2 = Math.min(radius * 0.55, (radius * 1.5) / (valueText.length * CHAR_EM));
    return {
      ...base, type: 'donut', center: { x: cx, y: cy - labelSize }, radius, width: radius * 0.22, fraction: chart.value / chart.total,
      value: { text: valueText, x: cx, y: cy - labelSize, size: valueSize2 }, count: count(chart.value),
      label: { text: fit(chart.label, body.width, labelSize * 1.3), x: cx, y: cy + radius + labelSize * 1.2, size: labelSize * 1.3 },
    };
  }

  if (chart.type === 'stat') {
    const text = formatNumber(chart.value, style);
    const size = Math.min((card ? 16 : 22) * u, body.width / (Math.max(text.length, formatNumber(chart.from, style).length) * CHAR_EM));
    return {
      ...base, type: 'stat', count: count(chart.value, chart.from),
      value: { text, x: cx, y: cy - size * 0.1, size },
      label: { text: fit(chart.label, body.width, labelSize * 1.5), x: cx, y: cy + size * 0.7, size: labelSize * 1.5 },
    };
  }

  // compare: the two values side by side (stacked in 9:16), an arrow between and the change.
  const halves = portrait
    ? [{ x: cx, y: body.y + body.height * 0.25 }, { x: cx, y: body.y + body.height * 0.72 }]
    : [{ x: body.x + body.width * 0.25, y: cy }, { x: body.x + body.width * 0.75, y: cy }];
  const room = portrait ? body.width : body.width * 0.42;
  const texts = [formatNumber(chart.before.value, style), formatNumber(chart.after.value, style)];
  const size = Math.min((card ? 11 : 15) * u, room / (Math.max(...texts.map(t => t.length)) * CHAR_EM));
  const side = (p: typeof chart.before, at: { x: number; y: number }, text: string) => ({
    value: { text, x: at.x, y: at.y, size }, count: count(p.value),
    label: { text: fit(p.label, room, labelSize * 1.3), x: at.x, y: at.y - size * 0.75, size: labelSize * 1.3 },
  });
  const [a, b] = halves as [{ x: number; y: number }, { x: number; y: number }];
  // One stroke, shaft then head, so it draws in a single pass.
  const head = 2.2 * u;
  const arrow = portrait
    ? `M${a.x} ${a.y + size * 0.55} L${b.x} ${b.y - size * 1.15} M${b.x - head} ${b.y - size * 1.15 - head} L${b.x} ${b.y - size * 1.15} L${b.x + head} ${b.y - size * 1.15 - head}`
    : `M${a.x + room * 0.52} ${cy} L${b.x - room * 0.52} ${cy} M${b.x - room * 0.52 - head} ${cy - head} L${b.x - room * 0.52} ${cy} L${b.x - room * 0.52 - head} ${cy + head}`;
  return {
    ...base, type: 'compare', before: side(chart.before, a, texts[0]!), after: side(chart.after, b, texts[1]!), arrow,
    change: { text: formatChange(chart.before.value, chart.after.value, lang), x: b.x, y: b.y + size * 0.75, size: labelSize * 1.4 },
  };
}

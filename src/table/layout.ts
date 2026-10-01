import { spreadTimes } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import type { Table } from './schema.ts';

export interface TableText {
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface TableCell {
  kind: 'yes' | 'no' | 'partial' | 'text';
  text: string;
  x: number;
  y: number;
}

export interface TableScene {
  mode: Table['mode'];
  u: number;
  panel?: Rect;
  title?: TableText;
  frame: Rect;
  header: { rect: Rect; labels: TableText[] };
  // The highlighted column, top to bottom.
  band?: Rect;
  highlight: number | null;
  rows: { rect: Rect; label: TableText; emoji?: { name: string; x: number; y: number; size: number }; cells: TableCell[]; time: number }[];
  font: { label: number; cell: number; mark: number };
  warnings: string[];
}

export function tableBeats(table: Table): Record<string, string | number> {
  const beats: Record<string, string | number> = {};
  table.rows.forEach((row, i) => { if (row.at !== undefined) beats[`r${i}`] = row.at; });
  return beats;
}

const CHAR_EM = 0.56;

export function tableScene(table: Table, canvas: Size, _lang: string, beats: Record<string, number> = {}): TableScene {
  const u = Math.min(canvas.width, canvas.height) / 100;
  const portrait = canvas.height > canvas.width;
  const card = table.mode === 'card';
  const warnings: string[] = [];
  if (portrait && table.columns.length > 3) warnings.push(`${table.columns.length} columns are too many for 9:16; keep 3 at most`);

  // The space the table may take; it is then shrunk to its rows and centered in it.
  const region: Rect = card
    ? portrait
      ? { x: 4 * u, y: canvas.height * 0.45, width: canvas.width - 8 * u, height: canvas.height * 0.55 - 6 * u }
      : { x: canvas.width * 0.42, y: 8 * u, width: canvas.width * 0.58 - 5 * u, height: canvas.height - 16 * u }
    : { x: canvas.width * (portrait ? 0.05 : 0.1), y: 10 * u, width: canvas.width * (portrait ? 0.9 : 0.8), height: canvas.height - 20 * u };
  const inset = card ? 3 * u : 0;
  // A wide frame with two columns leaves their marks far from the labels.
  const width = card || portrait ? region.width - 2 * inset : Math.min(region.width, canvas.width * (0.3 + 0.16 * table.columns.length));
  const area = { x: region.x + (region.width - width) / 2, width };
  const titleSize = (card ? 3 : 4.4) * u;
  const titleSpace = table.title ? titleSize * 1.2 + 4 * u : 0;
  const n = table.columns.length;
  const headerHeight = (card ? 6 : 8) * u;
  const rowHeight = Math.min((card ? 7.5 : 11) * u, (region.height - 2 * inset - titleSpace - headerHeight) / table.rows.length);
  const contentHeight = titleSpace + headerHeight + rowHeight * table.rows.length;
  const contentY = region.y + (region.height - contentHeight - 2 * inset) / 2 + inset;
  const panel: Rect | undefined = card ? { x: region.x, y: contentY - inset, width: region.width, height: contentHeight + 2 * inset } : undefined;
  const title = table.title ? { text: table.title, x: area.x, y: contentY, size: titleSize } : undefined;
  const top = contentY + titleSpace;
  const labelWidth = area.width * (n <= 2 ? 0.46 : n <= 4 ? 0.36 : 0.3);
  const colWidth = (area.width - labelWidth) / n;
  const label = Math.min((card ? 2.4 : 3.2) * u, rowHeight * 0.34);
  const cellFont = label * 0.95;
  const fits = (text: string, width: number, size: number) => text.length * size * CHAR_EM <= width;

  const frame = { x: area.x, y: top, width: area.width, height: headerHeight + rowHeight * table.rows.length };
  const highlight = table.highlight ? table.columns.indexOf(table.highlight) : null;
  const colX = (c: number) => area.x + labelWidth + colWidth * c;
  const header = {
    rect: { x: area.x, y: top, width: area.width, height: headerHeight },
    labels: table.columns.map((text, c) => {
      if (!fits(text, colWidth - u, label)) warnings.push(`column "${text}" is too long for its width`);
      return { text, x: colX(c) + colWidth / 2, y: top + headerHeight / 2, size: label };
    }),
  };

  const anchored = table.rows.map((_, i) => beats[`r${i}`]);
  const times = spreadTimes(anchored, 0.7, 0.7 + 0.45 * (table.rows.length - 1), 0.45);
  const rows = table.rows.map((row, i) => {
    const y = top + headerHeight + rowHeight * i;
    const emojiSize = row.emoji ? label * 1.5 : 0;
    const textX = area.x + 1.5 * u + (row.emoji ? emojiSize + 1.2 * u : 0);
    if (!fits(row.label, labelWidth - (textX - area.x) - u, label)) warnings.push(`row "${row.label}" is too long for its column`);
    return {
      rect: { x: area.x, y, width: area.width, height: rowHeight },
      label: { text: row.label, x: textX, y: y + rowHeight / 2, size: label },
      ...(row.emoji ? { emoji: { name: row.emoji, x: area.x + 1.5 * u + emojiSize / 2, y: y + rowHeight / 2, size: emojiSize } } : {}),
      cells: row.values.map((value, c): TableCell => {
        const kind = value === 'yes' || value === 'no' || value === 'partial' ? value : 'text';
        if (kind === 'text' && !fits(value, colWidth - u, cellFont)) warnings.push(`"${value}" is too long for its cell`);
        return { kind, text: kind === 'text' ? value : '', x: colX(c) + colWidth / 2, y: y + rowHeight / 2 };
      }),
      time: times[i]!,
    };
  });
  const band = highlight !== null && highlight >= 0 ? { x: colX(highlight), y: top, width: colWidth, height: frame.height } : undefined;
  return {
    mode: table.mode, u, ...(panel ? { panel } : {}), ...(title ? { title } : {}), frame, header, ...(band ? { band } : {}),
    highlight: highlight !== null && highlight >= 0 ? highlight : null, rows, font: { label, cell: cellFont, mark: Math.min(rowHeight * 0.42, 4.2 * u) }, warnings,
  };
}

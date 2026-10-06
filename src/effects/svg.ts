import { onAccent } from './color.ts';
import { MARKER_FAMILY } from './font.ts';
import { LABEL_FONT } from './label.ts';
import type { Scene } from './scene.ts';

const ARROW = 'M0 0 L0 17 L4.5 12.8 L7.6 19.6 L10.4 18.4 L7.4 11.7 L13.2 11.7 Z';

const MARKER_FONT = `'${MARKER_FAMILY}', 'Marker Felt', cursive`;

export function renderScene({ cursor, strokes, bubbles = [] }: Scene, accent: string): string {
  const f = (n: number) => Number(n.toFixed(3));
  const paths = strokes.map(({ d, progress, opacity, color = accent, width = 3.5, fill, evenodd }) => (fill
    ? `<path d="${d}" fill="${color}"${evenodd ? ' fill-rule="evenodd"' : ''} opacity="${f(opacity)}"/>`
    : `<path d="${d}" pathLength="1" fill="none" stroke="${color}" stroke-width="${f(width)}" stroke-linecap="round" `
      + `stroke-linejoin="round" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - progress)}" opacity="${f(opacity)}"/>`));
  for (const { rect, lines, opacity, scale } of bubbles) {
    const cx = f(rect.x + rect.width / 2);
    const cy = f(rect.y + rect.height / 2);
    const text = lines.map((line, i) => `<tspan x="${f(rect.x + LABEL_FONT.padX)}" y="${f(rect.y + LABEL_FONT.padY + LABEL_FONT.size + i * LABEL_FONT.line - 4)}">${xml(line)}</tspan>`).join('');
    paths.push(
      `<g opacity="${f(opacity)}" transform="translate(${cx} ${cy}) scale(${f(scale)}) translate(${-cx} ${-cy})">`
      + `<rect x="${f(rect.x)}" y="${f(rect.y)}" width="${f(rect.width)}" height="${f(rect.height)}" rx="14" fill="${accent}"/>`
      + `<text fill="${onAccent(accent)}" font-family="${MARKER_FONT}" font-size="${LABEL_FONT.size}" font-weight="700">${text}</text></g>`,
    );
  }
  if (cursor) {
    paths.push(
      `<g transform="translate(${f(cursor.at.x)} ${f(cursor.at.y)}) scale(${f(cursor.scale)})" opacity="${f(cursor.opacity)}">`
      + `<path d="${ARROW}" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></g>`,
    );
  }
  return paths.join('');
}

function xml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

import type { Scene } from './scene.ts';

const ARROW = 'M0 0 L0 17 L4.5 12.8 L7.6 19.6 L10.4 18.4 L7.4 11.7 L13.2 11.7 Z';

export function renderScene({ cursor, strokes }: Scene, accent: string): string {
  const f = (n: number) => Number(n.toFixed(3));
  const paths = strokes.map(({ d, progress, opacity }) =>
    `<path d="${d}" pathLength="1" fill="none" stroke="${accent}" stroke-width="3.5" stroke-linecap="round" `
    + `stroke-linejoin="round" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - progress)}" opacity="${f(opacity)}"/>`);
  if (cursor) {
    paths.push(
      `<g transform="translate(${f(cursor.at.x)} ${f(cursor.at.y)}) scale(${f(cursor.scale)})" opacity="${f(cursor.opacity)}">`
      + `<path d="${ARROW}" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></g>`,
    );
  }
  return paths.join('');
}

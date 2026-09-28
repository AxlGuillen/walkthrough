import { describe, expect, it } from 'vitest';
import { parseTour, TourError } from './load.ts';

const minimal = `
title: Board
url: https://example.com
segments:
  - say: Hola
`;

describe('parseTour', () => {
  it('applies defaults', () => {
    const tour = parseTour(minimal);
    expect(tour).toMatchObject({ device: 'desktop', language: 'es', subtitles: 'karaoke' });
    expect(tour.segments[0]).toEqual({ say: 'Hola', do: [], overlays: [] });
  });

  it('normalizes shorthand and full actions to the same shape', () => {
    const tour = parseTour(`
title: Board
url: https://example.com
segments:
  - say: Mira la tarjeta
    do:
      - goto: /board
      - click: ".card"
      - click: { on: ".card", at: tarjeta }
      - zoom: out
      - zoom: { to: ".card", padding: 10, at: 1.5 }
`);
    expect(tour.segments[0]!.do).toEqual([
      { kind: 'goto', url: '/board' },
      { kind: 'click', on: '.card' },
      { kind: 'click', on: '.card', at: 'tarjeta' },
      { kind: 'zoom', to: 'out' },
      { kind: 'zoom', to: '.card', padding: 10, at: 1.5 },
    ]);
  });

  it('rejects a silent segment without hold', () => {
    expect(() => parseTour(`
title: Board
url: https://example.com
segments:
  - do: [{ goto: / }]
`)).toThrow(/needs "hold"/);
  });

  it('rejects unknown keys so typos do not pass silently', () => {
    expect(() => parseTour(minimal.replace('segments:', 'devise: mobile\nsegments:'))).toThrow(TourError);
  });

  it('rejects an action with two verbs', () => {
    expect(() => parseTour(`
title: Board
url: https://example.com
segments:
  - say: Hola
    do:
      - { click: ".a", hover: ".b" }
`)).toThrow(TourError);
  });

  it('reports invalid YAML as a TourError', () => {
    expect(() => parseTour('title: [unclosed')).toThrow(/invalid YAML/);
  });
});

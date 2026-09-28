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
    expect(tour).toMatchObject({ device: 'desktop', language: 'es', subtitles: 'none' });
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

  it('passes overlay params through as strings', () => {
    const tour = parseTour(`
title: Board
url: https://example.com
segments:
  - say: Hola
    overlays:
      - { src: overlays/lower-third.html, params: { title: Tablero, week: 38 } }
`);
    expect(tour.segments[0]!.overlays[0]).toEqual({
      src: 'overlays/lower-third.html', fade: 0.3, params: { title: 'Tablero', week: '38' },
    });
  });

  it('reads sound effect settings in their short and long forms', () => {
    const base = 'title: x\nurl: https://a.com\nsegments:\n  - hold: 1\n';
    expect(parseTour(base).sfx).toEqual({ enabled: true, volume: 1, mute: [] });
    expect(parseTour(`sfx: false\n${base}`).sfx).toEqual({ enabled: false, volume: 1, mute: [] });
    expect(parseTour(`sfx: { volume: 0.5, mute: [scroll, whoosh] }\n${base}`).sfx).toEqual({ enabled: true, volume: 0.5, mute: ['scroll', 'whoosh'] });
    expect(() => parseTour(`sfx: { mute: [bell] }\n${base}`)).toThrow(TourError);
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

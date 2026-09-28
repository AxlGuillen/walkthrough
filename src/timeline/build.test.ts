import { describe, expect, it } from 'vitest';
import { parseTour } from '../tour/load.ts';
import { buildTimeline, TimelineError } from './build.ts';

const options = { leadIn: 0.5, tailOut: 0.5 };

const tour = parseTour(`
title: Board
url: https://example.com
segments:
  - say: Este es el tablero.
    do:
      - goto: /board
  - say: Aquí está la tarjeta, con su estimado.
    do:
      - click: { on: ".card", at: estimado }
      - zoom: { to: ".card", at: tarjeta }
    overlays:
      - { src: overlays/new.html, from: tarjeta }
  - hold: 1.5
    do:
      - zoom: { to: out, at: 0.25 }
`);

const speech = [
  { duration: 2, words: [{ text: 'Este', start: 0, end: 0.4 }, { text: 'tablero.', start: 1.2, end: 2 }] },
  {
    duration: 3,
    words: [
      { text: 'Aquí', start: 0, end: 0.3 },
      { text: 'tarjeta,', start: 1, end: 1.5 },
      { text: 'estimado.', start: 2.4, end: 3 },
    ],
  },
  undefined,
];

describe('buildTimeline', () => {
  const timeline = buildTimeline(tour, speech, options);

  it('lays segments end to end with breathing room around the voice', () => {
    expect(timeline.segments).toEqual([
      { index: 0, start: 0, end: 3, speechStart: 0.5 },
      { index: 1, start: 3, end: 7, speechStart: 3.5 },
      { index: 2, start: 7, end: 8.5, speechStart: null },
    ]);
    expect(timeline.duration).toBe(8.5);
  });

  it('anchors actions to spoken words and keeps them in time order', () => {
    expect(timeline.actions.map(({ time, action }) => [time, action.kind])).toEqual([
      [0, 'goto'],
      [4.5, 'zoom'],
      [5.9, 'click'],
      [7.25, 'zoom'],
    ]);
  });

  it('defaults overlays to run until the end of their segment', () => {
    expect(timeline.overlays).toEqual([
      { src: 'overlays/new.html', start: 4.5, end: 7, fade: 0.3, segment: 1 },
    ]);
  });

  it('shifts word times to the absolute video clock', () => {
    expect(timeline.words.map(w => [w.text, w.start])).toEqual([
      ['Este', 0.5],
      ['tablero.', 1.7],
      ['Aquí', 3.5],
      ['tarjeta,', 4.5],
      ['estimado.', 5.9],
    ]);
  });

  it('lets hold extend a spoken segment', () => {
    const held = parseTour(`
title: Board
url: https://example.com
segments:
  - { say: Hola, hold: 5 }
`);
    expect(buildTimeline(held, [{ duration: 1, words: [] }], options).duration).toBe(5);
  });

  it('fails on an anchor that is not in the narration', () => {
    const broken = parseTour(`
title: Board
url: https://example.com
segments:
  - say: Hola
    do: [{ click: { on: ".a", at: adiós } }]
`);
    expect(() => buildTimeline(broken, [{ duration: 1, words: [{ text: 'Hola', start: 0, end: 1 }] }], options))
      .toThrow(/segment 1: click "adiós" is not in the narration/);
  });

  it('fails on a numeric anchor past the segment end', () => {
    const broken = parseTour(`
title: Board
url: https://example.com
segments:
  - { hold: 1, do: [{ zoom: { to: out, at: 2 } }] }
`);
    expect(() => buildTimeline(broken, [], options)).toThrow(TimelineError);
  });

  it('fails on an overlay that ends before it starts', () => {
    const broken = parseTour(`
title: Board
url: https://example.com
segments:
  - { hold: 3, overlays: [{ src: a.html, from: 2, to: 1 }] }
`);
    expect(() => buildTimeline(broken, [], options)).toThrow(/ends before it starts/);
  });

  it('fails when a spoken segment has no speech', () => {
    expect(() => buildTimeline(tour, [], options)).toThrow(/segment 1: missing speech/);
  });
});

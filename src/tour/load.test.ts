import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTour, resolveFiles, TourError } from './load.ts';

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
      src: 'overlays/lower-third.html', fade: 0.3, params: { title: 'Tablero', week: '38' }, beats: {},
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

  it('reads a shot in its short and long forms, and keeps its angle in range', () => {
    const shots = parseTour(`
title: Board
url: https://example.com
segments:
  - say: Hola
    do:
      - shot: left
      - shot: { to: top, angle: 5, duration: 2, at: Hola }
`).segments[0]!.do;
    expect(shots).toEqual([
      { kind: 'shot', to: 'left', angle: undefined, duration: undefined, at: undefined },
      { kind: 'shot', to: 'top', angle: 5, duration: 2, at: 'Hola' },
    ]);
    expect(() => parseTour(minimal.replace('segments:', 'segments:\n  - hold: 1\n    do: [{ shot: { to: left, angle: 20 } }]'))).toThrow(TourError);
  });

  it('rejects shots with a device frame, which the stage cannot tilt yet', () => {
    expect(() => parseTour(`
title: Board
url: https://example.com
frame: laptop
segments:
  - hold: 1
    do: [{ shot: wide }]
`)).toThrow(/device frame/);
  });

  it('waits 15 s by default and takes a longer wait for a slow server', () => {
    expect(parseTour(minimal).waitTimeout).toBe(15);
    expect(parseTour(minimal.replace('segments:', 'waitTimeout: 60\nsegments:')).waitTimeout).toBe(60);
    expect(() => parseTour(minimal.replace('segments:', 'waitTimeout: 0\nsegments:'))).toThrow(TourError);
  });

  it('allows a cut with a device frame: nothing is drawn on the stage', () => {
    expect(parseTour(`title: Board\nurl: https://example.com\nframe: phone\ntransition: cut\nsegments:\n  - say: Hola\n`).transition).toBe('cut');
  });

  it('rejects stage transitions with a device frame, but not the dissolve', () => {
    const tour = (transition: string) => `title: Board\nurl: https://example.com\nframe: phone\ntransition: ${transition}\nsegments:\n  - say: Hola\n`;
    expect(() => parseTour(tour('fly'))).toThrow(/device frame/);
    expect(parseTour(tour('dissolve')).transition).toBe('dissolve');
  });

  it('reports invalid YAML as a TourError', () => {
    expect(() => parseTour('title: [unclosed')).toThrow(/invalid YAML/);
  });
});

describe('resource data', () => {
  const tour = (data: string, beats = '') => parseTour(`
title: Charts
url: https://example.com
segments:
  - say: El lunes hubo pocas, el sábado muchas.
    overlays:
      - src: ${data.includes('view:') ? 'code.html' : 'chart.html'}
        ${beats}
        data: ${data}
`);

  it('checks a chart against its schema and lifts each point\'s word into the beats', () => {
    const overlay = tour("{ type: bar, series: [{ label: Lun, value: 3, at: lunes }, { label: Sáb, value: 9, at: sábado }] }").segments[0]!.overlays[0]!;
    expect(overlay.beats).toEqual({ p0: 'lunes', p1: 'sábado' });
    expect(overlay.data).toMatchObject({ type: 'bar', mode: 'full' });
  });

  it('lifts the words of code highlights and commands too', () => {
    const overlay = tour('{ view: terminal, code: "$ bun test", run: [lunes], highlight: [{ lines: 1, at: sábado }] }').segments[0]!.overlays[0]!;
    expect(overlay.beats).toEqual({ h0: 'sábado', r0: 'lunes' });
  });

  it('lets explicit beats win over the words inside the data', () => {
    const overlay = tour('{ type: stat, label: reservas, value: 9, at: lunes }', 'beats: { value: sábado }').segments[0]!.overlays[0]!;
    expect(overlay.beats).toEqual({ value: 'sábado' });
  });

  it('fails on load with the overlay and the field that is wrong', () => {
    expect(() => tour('{ type: donut, label: x, value: 120 }')).toThrow(/overlays\[0\] \(chart.html\) data:[\s\S]*value is more than total/);
  });
});

describe('brands', () => {
  const tour = (extra: string) => parseTour(`title: B\nurl: https://example.com\n${extra}\nsegments:\n  - hold: 1\n`);

  it('fills in the brand\'s accent, theme and texture unless the tour sets them', () => {
    expect(tour('brand: dymmsa')).toMatchObject({ brand: 'dymmsa', accent: '#DC2626', theme: 'dark', texture: 'lines' });
    expect(tour('brand: dymmsa\naccent: "#00AA88"\ntexture: dots')).toMatchObject({ accent: '#00AA88', texture: 'dots' });
    expect(tour('')).toMatchObject({ accent: '#FF3B5C', texture: 'plain' });
  });

  it('names a brand that does not exist', () => {
    expect(() => tour('brand: acme')).toThrow(/brand "acme" not found/);
  });
});

describe('emojis', () => {
  const tour = (overlay: string) => parseTour(`title: E\nurl: https://example.com\nsegments:\n  - hold: 3\n    overlays:\n      - ${overlay}\n`);
  it('accepts emojis of the set in params, flow steps and charts, and names close ones otherwise', () => {
    expect(tour('{ src: sticker.html, params: { emoji: party-popper, text: Listo } }').segments[0]!.overlays[0]!.params.emoji).toBe('party-popper');
    expect(() => tour('{ src: opening.html, params: { emoji: party } }')).toThrow(/close: .*party-popper/);
    expect(() => tour('{ src: sticker.html, params: { text: Hola } }')).toThrow(/needs params.emoji/);
    expect(() => tour('{ src: chart.html, data: { type: stat, label: x, value: 1, emoji: rockets } }')).toThrow(/rockets/);
    const flow = parseTour('title: F\nurl: https://example.com\nsegments:\n  - hold: 3\n    flow: { steps: [{ text: A, emoji: rocket }, B] }\n');
    expect(flow.segments[0]!.flow!.steps[0]!.emoji).toBe('rocket');
  });
});


describe('uploads', () => {
  const tour = (file: string) => parseTour(`
title: Upload
url: https://example.com
segments:
  - hold: 2
    do:
      - upload: { on: 'button:has-text("Replace")', file: ${file}, wait: '.cropper', at: 0.5 }
`);

  it('reads the picker, the file, an optional wait and its time', () => {
    expect(tour('assets/photo.jpg').segments[0]!.do[0]).toEqual({ kind: 'upload', on: 'button:has-text("Replace")', file: 'assets/photo.jpg', wait: '.cropper', at: 0.5 });
  });

  it('resolves the file against the tour folder, and fails on load when it is missing', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const resolved = resolveFiles(tour('load.test.ts'), dir).segments[0]!.do[0] as { file: string };
    expect(resolved.file).toBe(path.join(dir, 'load.test.ts'));
    expect(() => resolveFiles(tour('nowhere.jpg'), dir)).toThrow(/nowhere\.jpg does not exist/);
  });
});

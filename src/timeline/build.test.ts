import { describe, expect, it } from 'vitest';
import { parseTour } from '../tour/load.ts';
import { buildTimeline, spreadTimes, TimelineError } from './build.ts';

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

  it('keeps camera shots apart from the actions the capture runs', () => {
    const shot = buildTimeline(parseTour(`
title: Board
url: https://example.com
segments:
  - say: Este es el tablero.
    do:
      - shot: { to: left, at: tablero }
      - goto: /board
`), [speech[0]], options);
    expect(shot.actions.map(a => a.action.kind)).toEqual(['goto']);
    expect(shot.shots).toEqual([{ time: 1.7, segment: 0, shot: { kind: 'shot', to: 'left', angle: undefined, duration: undefined, at: 'tablero' } }]);
  });

  it('turns an aside into its overlay and two shots, out and back', () => {
    const timeline = buildTimeline(parseTour(`
title: Board
url: https://example.com
segments:
  - hold: 6
    aside:
      layout: aside-right
      at: 1
      until: 5
      title: The *board*
      points: [{ text: One, at: 3 }]
`), [], options);
    expect(timeline.shots.map(s => [s.time, s.shot.to])).toEqual([[1, 'aside-right'], [4.65, 'flat']]);
    expect(timeline.overlays).toMatchObject([{ src: 'aside.html', start: 1, end: 5, beats: { p0: 2 }, data: { layout: 'aside-right', title: 'The *board*' } }]);
    expect(() => parseTour('title: x\nurl: https://example.com\nsegments:\n  - hold: 2\n    aside: { title: x, colour: red }\n')).toThrow(/aside.html[\s\S]*colour/);
  });

  it('marks the changes of screen the stage draws, by tour and by segment', () => {
    const staged = buildTimeline(parseTour(`
title: Board
url: https://example.com
transition: push
segments:
  - hold: 2
    do:
      - goto: /
      - click: { on: '.a', at: 0.5 }
      - click: { on: '.b', wait: '.c', at: 1 }
  - hold: 2
    transition: flip
    do: [{ goto: /x }]
  - hold: 2
    transition: dissolve
    do: [{ goto: /y }]
`), [], options);
    expect(staged.actions.map(a => [a.action.kind, a.transition])).toEqual([
      ['goto', undefined], ['click', undefined], ['click', 'push'], ['goto', 'flip'], ['goto', undefined],
    ]);
  });

  it('defaults overlays to run until the end of their segment', () => {
    expect(timeline.overlays).toEqual([
      { src: 'overlays/new.html', params: {}, start: 4.5, end: 7, fade: 0.3, segment: 1, beats: {} },
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

describe('flows', () => {
  const words = ['Picks', 'a', 'night,', 'chooses', 'a', 'table,', 'pays,', 'and', 'the', 'host', 'confirms', 'the', 'table.']
    .map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const flowTour = (steps: string) => parseTour(`
title: Flow
url: https://example.com
segments:
  - say: Picks a night, chooses a table, pays, and the host confirms the table.
    flow:
      title: Booking
      steps:
${steps}
`);
  const build = (steps: string) => buildTimeline(flowTour(steps), [{ duration: 6.5, words }], options);

  it('becomes a flow overlay whose steps appear on their words', () => {
    const [overlay] = build(`        - { text: Night, at: picks }
        - { text: Table, detail: Pick a section, at: table }
        - { text: Confirmed, at: confirms }`).overlays;
    expect(overlay).toMatchObject({ src: 'flow.html', start: 0, end: 7.5, fade: 0.3 });
    expect(overlay!.flow).toEqual({
      shape: 'linear', mode: 'full', title: 'Booking',
      steps: [{ text: 'Night', time: 0.5 }, { text: 'Table', detail: 'Pick a section', time: 3 }, { text: 'Confirmed', time: 5.5 }],
    });
  });

  it('looks for each word after the step above it, so a repeated word anchors a later step', () => {
    const [overlay] = build(`        - { text: Table, at: table }
        - { text: Host, at: host }
        - { text: Same table, at: table }`).overlays;
    expect(overlay!.flow!.steps.map(s => s.time)).toEqual([3, 5, 6.5]);
  });

  it('spreads steps without a word between their neighbors', () => {
    const [overlay] = build(`        - Night
        - { text: Table, at: table }
        - Pay
        - { text: Confirmed, at: confirms }`).overlays;
    expect(overlay!.flow!.steps.map(s => s.time)).toEqual([0.4, 3, 4.25, 5.5]);
  });

  it('walks a decision question, then its first branch, then its second', () => {
    const tour = parseTour(`
title: Flow
url: https://example.com
segments:
  - say: Picks a night, chooses a table, pays, and the host confirms the table.
    flow:
      shape: decision
      steps: [{ text: Tables left?, at: night }]
      branches:
        - { label: Yes, steps: [{ text: Choose, at: chooses }, { text: Pay, at: pays }] }
        - { label: No, steps: [{ text: Host call, at: host }] }
`);
    const flow = buildTimeline(tour, [{ duration: 6.5, words }], options).overlays[0]!.flow!;
    expect(flow.steps.map(s => [s.text, s.time, s.branch])).toEqual([
      ['Tables left?', 1.5, undefined], ['Choose', 2, 0], ['Pay', 3.5, 0], ['Host call', 5, 1],
    ]);
    expect(flow.branches).toEqual(['Yes', 'No']);
  });

  it('closes a cycle on its loop word, or just after its last step', () => {
    const cycle = (loop: string) => parseTour(`
title: Flow
url: https://example.com
segments:
  - say: Picks a night, chooses a table, pays, and the host confirms the table.
    flow:
      shape: cycle
      ${loop}
      steps: [{ text: Night, at: night }, { text: Table, at: table }, { text: Host, at: host }]
`);
    expect(buildTimeline(cycle('loop: confirms'), [{ duration: 6.5, words }], options).overlays[0]!.flow!.loop).toBe(5.5);
    expect(buildTimeline(cycle(''), [{ duration: 6.5, words }], options).overlays[0]!.flow!.loop).toBeCloseTo(5.6);
  });

  it('gives lane steps their lane, and tells a comparison before and then after', () => {
    const build = (flow: string) => buildTimeline(parseTour(`
title: Flow
url: https://example.com
segments:
  - say: Picks a night, chooses a table, pays, and the host confirms the table.
    flow:
${flow}
`), [{ duration: 6.5, words }], options).overlays[0]!.flow!;
    const laned = build(`      shape: lanes
      lanes: [Guest, Host]
      steps: [{ text: Night, lane: Guest, at: night }, { text: Confirm, lane: Host, at: confirms }]`);
    expect(laned.lanes).toEqual(['Guest', 'Host']);
    expect(laned.steps.map(s => s.lane)).toEqual([0, 1]);
    const compared = build(`      shape: compare
      before: { label: Before, steps: [{ text: Night, at: night }, { text: Table, at: chooses }] }
      after: { label: Now, steps: [{ text: Confirm, at: confirms }] }`);
    expect(compared.branches).toEqual(['Before', 'Now']);
    expect(compared.steps.map(s => [s.text, s.branch])).toEqual([['Night', 0], ['Table', 0], ['Confirm', 1]]);
  });

  it('rejects shapes without what they need', () => {
    const invalid = (flow: string) => () => parseTour(`title: F\nurl: https://example.com\nsegments:\n  - hold: 3\n    flow: ${flow}\n`);
    expect(invalid('{ shape: decision, steps: [A] }')).toThrow(/two branches/);
    expect(invalid('{ shape: cycle, steps: [A, B] }')).toThrow(/at least 3/);
    expect(invalid('{ steps: [A, B], loop: 1 }')).toThrow(/only a cycle/);
    expect(invalid('{ shape: lanes, lanes: [A, B], steps: [{ text: X, lane: C }, { text: Y, lane: A }] }')).toThrow(/needs a lane from: A, B/);
    expect(invalid('{ steps: [{ text: X, lane: A }, Y] }')).toThrow(/only a lanes flow/);
    expect(invalid('{ shape: compare, before: { label: A, steps: [X] } }')).toThrow(/before and after/);
  });

  it('rejects steps whose words come in the wrong order', () => {
    expect(() => build(`        - { text: Host, at: host }
        - { text: Night, at: night }`)).toThrow(TimelineError);
  });
});

describe('spreadTimes', () => {
  it('fills free steps evenly, from the first slot to the last', () => {
    expect(spreadTimes([undefined, undefined, undefined, undefined], 1, 4)).toEqual([1, 2, 3, 4]);
    expect(spreadTimes([2, undefined, undefined, 8], 0, 10)).toEqual([2, 4, 6, 8]);
    expect(spreadTimes([undefined, 5, undefined], 1, 8)).toEqual([1, 5, 8]);
  });

  it('keeps free steps apart even when the bounds leave no room', () => {
    const times = spreadTimes([5, undefined, undefined], 0, 5);
    expect(times[1]! - times[0]!).toBeCloseTo(0.6);
    expect(times[2]! - times[1]!).toBeCloseTo(0.6);
  });
});

describe('overlay beats', () => {
  const words = ['This', 'is', 'Sunset', 'Shores,', 'a', 'resort', 'where', 'every', 'venue', 'is', 'a', 'resort', 'booking.']
    .map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const build = (overlay: string) => buildTimeline(parseTour(`
title: Beats
url: https://example.com
segments:
  - say: This is Sunset Shores, a resort where every venue is a resort booking.
    overlays:
      - ${overlay}
`), [{ duration: 6.5, words }], options).overlays[0]!;

  it('puts each beat on its word, on the overlay clock, looking past the beat before', () => {
    const overlay = build('{ src: title-card.html, from: Sunset, beats: { title: Sunset, line: resort, again: resort, end: 5 } }');
    expect(overlay.start).toBe(1.5);
    // resort is said at 2.5s and 5.5s of speech; the lead-in adds 0.5s.
    expect(overlay.beats).toEqual({ title: 0, line: 1.5, again: 4.5, end: 3.5 });
  });

  it('finds a beat said before the beat above it, as a board writes its items and then ticks them', () => {
    const overlay = build('{ src: custom.html, beats: { i0: venue, d0: booking, i1: Sunset } }');
    // venue at 4s, booking at 6s, and Sunset, said first, at 1s; the lead-in adds 0.5s.
    expect(overlay.beats).toEqual({ i0: 4.5, d0: 6.5, i1: 1.5 });
  });

  it('carries structured data through untouched', () => {
    const overlay = build('{ src: custom.html, data: { series: [{ label: Mon, value: 3 }] } }');
    expect(overlay.data).toEqual({ series: [{ label: 'Mon', value: 3 }] });
  });

  it('rejects a beat before the overlay starts or on a word never said', () => {
    expect(() => build('{ src: a.html, from: resort, beats: { early: Sunset } }')).toThrow(/outside the overlay/);
    expect(() => build('{ src: a.html, beats: { missing: marina } }')).toThrow(TimelineError);
  });
});

describe('watermark', () => {
  const tour = (extra: string) => parseTour(`
title: Mark
url: https://example.com
brand: dymmsa
${extra}
segments:
  - hold: 2
  - hold: 3
  - hold: 4
`);
  it('covers the tour between its opening and closing segments, silently', () => {
    const overlay = buildTimeline(tour('watermark: true'), []).overlays.at(-1)!;
    expect(overlay).toMatchObject({ src: 'watermark.html', start: 2, end: 5, silent: true });
    expect(buildTimeline(tour(''), []).overlays).toEqual([]);
  });
});


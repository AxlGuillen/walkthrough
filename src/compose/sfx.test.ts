import { describe, expect, it } from 'vitest';
import type { CaptureEvent } from '../capture/events.ts';
import type { TimedAction, TimedOverlay } from '../timeline/build.ts';
import { audioGraph } from './audio.ts';
import { afterFrame, atFrame, eventsFromTimeline, overlayOnset, sfxGraph, soundEvents } from './sfx.ts';

const overlay = (start: number): TimedOverlay => ({ src: 'a.html', params: {}, start, end: start + 1, fade: 0, segment: 0, beats: {} });

describe('soundEvents', () => {
  const captured: CaptureEvent[] = [
    { kind: 'click', time: 1 },
    { kind: 'type', time: 2, chars: 3 },
    { kind: 'ring', time: 3 },
    { kind: 'label', time: 3.5 },
    { kind: 'zoom', time: 4, direction: 'in' },
    { kind: 'zoom', time: 5, direction: 'out' },
    { kind: 'scroll', time: 6, duration: 0.8 },
    { kind: 'scroll', time: 7, duration: 0.2 },
    { kind: 'navigate', time: 8 },
  ];

  it('turns what happened into sounds, in time order, each on the first frame its animation shows', () => {
    const sounds = soundEvents(captured, [overlay(0.5)]);
    const frame = (n: number) => n / 30;
    // What is set on a frame (a press, a letter) sounds on it; what eases in from nothing (a pen
    // stroke, the camera, a dissolve) sounds on the frame after; an overlay on its first frame shown.
    expect(sounds.map(e => e.sound)).toEqual(['pop', 'click', 'keys', 'keys', 'keys', 'draw', 'draw', 'whoosh', 'whoosh', 'scroll', 'swipe']);
    [frame(16), frame(30), frame(60), frame(63), frame(65), frame(91), frame(110), frame(121), frame(151), frame(181), frame(241)]
      .forEach((time, i) => expect(sounds[i]!.time).toBeCloseTo(time, 9));
  });

  it('never starts a sound before its frame, and never more than a frame late', () => {
    for (const fps of [15, 30]) {
      for (let i = 0; i < 200; i++) {
        const time = i * 0.0731;
        for (const onset of [atFrame(time, fps), afterFrame(time, fps)]) {
          expect(onset).toBeGreaterThanOrEqual(time - 1e-9);
          expect(onset - time).toBeLessThanOrEqual(1 / fps + 1e-9);
        }
      }
    }
  });

  it('gives zooms in and out their own sound and scrolls their length', () => {
    const sounds = soundEvents(captured, []);
    expect(sounds.filter(e => e.sound === 'whoosh').map(e => e.variant)).toEqual([0, 1]);
    expect(sounds.find(e => e.sound === 'scroll')?.duration).toBe(0.8);
  });

  it('gives a flow a single pop as it appears, not one per step', () => {
    const flow = { ...overlay(1), flow: { shape: 'linear' as const, mode: 'full' as const, steps: [0, 2, 4].map(time => ({ text: 'Step', time: 1 + time })) } };
    expect(soundEvents([], [flow]).map(e => e.sound)).toEqual(['pop']);
  });

  it("pops an overlay when what its cue marks comes in, not when it starts", () => {
    const chapter = { ...overlay(85.03), end: 89 };
    const [pop] = soundEvents([], [chapter], { mute: [] }, { fps: 30, cues: [[{ at: 1.95, sound: 'pop' }]] });
    expect(pop!.time).toBeCloseTo(overlayOnset(85.03, 1.95, 30), 9);
    expect(pop!.time).toBeGreaterThan(85.03 + 1.95);
    expect(pop!.time - (85.03 + 1.95)).toBeLessThanOrEqual(2 / 30);
  });

  it('lets each sound last as long as its animation', () => {
    const sounds = soundEvents([
      { kind: 'zoom', time: 1, direction: 'in', duration: 1.4 }, { kind: 'zoom', time: 3, direction: 'out' },
      { kind: 'navigate', time: 5 }, { kind: 'navigate', time: 7, transition: 'push' }, { kind: 'label', time: 9 },
    ], []);
    expect(sounds.map(e => [e.sound, e.duration])).toEqual([['whoosh', 1.4], ['whoosh', 0.8], ['swipe', 0.5], ['swipe', 0.8], ['draw', 0.4 + 0.12]]);
    expect(sounds[2]!.variant).not.toBe(sounds[3]!.variant);
  });

  it('sounds a click when it shows: the press, a ripple, the first stroke of a circle, or not at all', () => {
    const click: CaptureEvent[] = [{ kind: 'click', time: 1 }];
    const at = (scene: Partial<Parameters<typeof soundEvents>[3]>) => soundEvents(click, [], { mute: [] }, { fps: 30, ...scene }).map(e => e.time);
    expect(at({ pointer: 'mouse', clickStyle: 'none' })).toEqual([1]);
    expect(at({ pointer: 'touch', clickStyle: 'ripple' })).toEqual([1]);
    expect(at({ pointer: 'touch', clickStyle: 'circle' })[0]).toBeCloseTo(31 / 30, 9);
    expect(at({ pointer: 'touch', clickStyle: 'none' })).toEqual([]);
  });

  it('keeps quiet what happens while the stage holds the recording out of the frame', () => {
    const away = (time: number) => (time >= 2 && time <= 3 ? 0 : 1);
    const sounds = soundEvents([{ kind: 'click', time: 1 }, { kind: 'click', time: 2.5 }], [overlay(2.2)], { mute: [] }, { fps: 30, screen: away });
    expect(sounds.map(e => e.sound)).toEqual(['click', 'pop']);
  });

  it('varies clicks and overlays, the same way on every render', () => {
    const clicks = Array.from({ length: 30 }, (_, i): CaptureEvent => ({ kind: 'click', time: i * 1.37 }));
    const variants = soundEvents(clicks, []).map(e => e.variant);
    expect(new Set(variants).size).toBeGreaterThan(1);
    expect(soundEvents(clicks, []).map(e => e.variant)).toEqual(variants);
    expect(soundEvents([], [overlay(1), overlay(2)]).map(e => e.variant)).toEqual([0, 1]);
  });

  it('keeps quiet what the app does under an overlay that hides it', () => {
    const card = { ...overlay(2), src: 'title-card.html', end: 6 };
    const sounds = soundEvents([{ kind: 'click', time: 1 }, { kind: 'click', time: 3 }, { kind: 'type', time: 4, chars: 2 }], [card]);
    expect(sounds.map(e => e.sound)).toEqual(['click', 'pop']);
  });

  it('drops muted sounds', () => {
    const sounds = soundEvents(captured, [overlay(0)], { mute: ['keys', 'pop', 'scroll'] }).map(e => e.sound);
    expect(sounds).not.toContain('keys');
    expect(sounds).not.toContain('pop');
    expect(sounds).not.toContain('scroll');
    expect(sounds).toContain('click');
  });
});

describe('eventsFromTimeline', () => {
  it('rebuilds what it can for captures made before events were recorded', () => {
    const actions: TimedAction[] = [
      { time: 1, segment: 0, action: { kind: 'click', on: '.a', wait: undefined, at: undefined } },
      { time: 2, segment: 0, action: { kind: 'zoom', to: 'out', padding: undefined, scale: undefined, follow: undefined, duration: undefined, at: undefined } },
      { time: 3, segment: 0, action: { kind: 'upload', on: '.b', file: '/tmp/a.jpg', wait: undefined, at: undefined } },
    ];
    expect(eventsFromTimeline({ actions })).toEqual([{ kind: 'click', time: 1 }, { kind: 'zoom', time: 2, direction: 'out' }, { kind: 'click', time: 3 }]);
  });
});

describe('sfxGraph', () => {
  it('gives every event its own delayed source instead of splitting one', () => {
    const graph = sfxGraph([
      { sound: 'click', time: 1, variant: 0 }, { sound: 'click', time: 2.5, variant: 1 }, { sound: 'pop', time: 3, variant: 0 },
    ], 10)!;
    const text = graph.parts.join(';');
    expect(text).not.toContain('asplit');
    expect(text.match(/aevalsrc/g)).toHaveLength(3);
    // In samples, so a sound lands on its frame to the sample, and numbered again from zero:
    // ffmpeg 8.1 leaves adelay's padding without timestamps, and the trim after the mix dropped it.
    expect(text).toContain('adelay=120000S:all=1,asetpts=N/SR/TB[fx1]');
    expect(text).toContain('[fx0][fx1][fx2]amix=inputs=3');
  });

  it('uses fixed noise seeds and scales every effect by the tour volume', () => {
    const graph = sfxGraph([{ sound: 'scroll', time: 0, variant: 0, duration: 0.9 }, { sound: 'draw', time: 1, variant: 0 }], 2, 0.5)!.parts;
    expect(graph[0]).toContain('seed=17');
    expect(graph[0]).toContain('anoisesrc=d=0.900');
    expect(graph[1]).toContain('volume=0.06,');
  });

  it('adds nothing when there are no events', () => {
    expect(sfxGraph([], 10)).toBeNull();
  });
});

describe('audioGraph with effects', () => {
  it('mixes effects after the ducking and before loudness normalization', () => {
    const graph = audioGraph({
      clips: [{ input: 1, start: 0 }], duration: 5, music: { input: 2, volume: 0.09 }, sfx: [{ sound: 'pop', time: 1, variant: 0 }],
    });
    expect(graph.indexOf('sidechaincompress')).toBeLessThan(graph.indexOf('[mix][sfx]amix'));
    expect(graph).toMatch(/\[withsfx\]loudnorm=.*\[aout\]$/);
  });
});

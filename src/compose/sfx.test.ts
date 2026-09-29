import { describe, expect, it } from 'vitest';
import type { CaptureEvent } from '../capture/events.ts';
import type { TimedAction, TimedOverlay } from '../timeline/build.ts';
import { audioGraph } from './audio.ts';
import { eventsFromTimeline, sfxGraph, soundEvents } from './sfx.ts';

const overlay = (start: number): TimedOverlay => ({ src: 'a.html', params: {}, start, end: start + 1, fade: 0, segment: 0 });

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

  it('turns what happened into sounds, in time order', () => {
    const sounds = soundEvents(captured, [overlay(0.5)]).map(e => [e.sound, e.time]);
    expect(sounds).toEqual([
      ['pop', 0.5], ['click', 1], ['keys', 2], ['keys', 2 + 1 / 14], ['keys', 2 + 2 / 14],
      ['draw', 3], ['draw', 3.5], ['whoosh', 4], ['whoosh', 5], ['scroll', 6], ['swipe', 8],
    ]);
  });

  it('gives zooms in and out their own sound and scrolls their length', () => {
    const sounds = soundEvents(captured, []);
    expect(sounds.filter(e => e.sound === 'whoosh').map(e => e.variant)).toEqual([0, 1]);
    expect(sounds.find(e => e.sound === 'scroll')?.duration).toBe(0.8);
  });

  it('gives a flow a single pop as it appears, not one per step', () => {
    const flow = { ...overlay(1), flow: { shape: 'linear' as const, mode: 'full' as const, steps: [0, 2, 4].map(time => ({ text: 'Step', time: 1 + time })) } };
    expect(soundEvents([], [flow]).map(e => [e.sound, e.time])).toEqual([['pop', 1]]);
  });

  it('varies clicks and overlays, the same way on every render', () => {
    const clicks = Array.from({ length: 30 }, (_, i): CaptureEvent => ({ kind: 'click', time: i * 1.37 }));
    const variants = soundEvents(clicks, []).map(e => e.variant);
    expect(new Set(variants).size).toBeGreaterThan(1);
    expect(soundEvents(clicks, []).map(e => e.variant)).toEqual(variants);
    expect(soundEvents([], [overlay(1), overlay(2)]).map(e => e.variant)).toEqual([0, 1]);
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
    ];
    expect(eventsFromTimeline({ actions })).toEqual([{ kind: 'click', time: 1 }, { kind: 'zoom', time: 2, direction: 'out' }]);
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
    expect(text).toContain('adelay=2500:all=1[fx1]');
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

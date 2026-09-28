import { describe, expect, it } from 'vitest';
import type { TimedAction, TimedOverlay } from '../timeline/build.ts';
import { audioGraph } from './audio.ts';
import { sfxGraph, soundEvents } from './sfx.ts';

const action = (time: number, kind: 'click' | 'highlight' | 'zoom' | 'type'): TimedAction => ({
  time, segment: 0,
  action: kind === 'zoom' ? { kind, to: 'out', padding: undefined, duration: undefined, at: undefined }
    : kind === 'highlight' ? { kind, on: '.a', duration: undefined, at: undefined }
      : kind === 'type' ? { kind, into: '.a', text: 'x', at: undefined }
        : { kind, on: '.a', at: undefined },
});
const overlay = (start: number): TimedOverlay => ({ src: 'a.html', params: {}, start, end: start + 1, fade: 0, segment: 0 });

describe('soundEvents', () => {
  it('clicks on clicks and typing, draws on highlights and pops on overlays, in time order', () => {
    const events = soundEvents({
      actions: [action(1, 'click'), action(2, 'highlight'), action(3, 'zoom'), action(4, 'type')],
      overlays: [overlay(0.5)],
    });
    expect(events).toEqual([
      { sound: 'pop', time: 0.5 },
      { sound: 'click', time: 1 },
      { sound: 'draw', time: 2 },
      { sound: 'click', time: 4 },
    ]);
  });
});

describe('sfxGraph', () => {
  it('gives every event its own delayed source instead of splitting one', () => {
    const graph = sfxGraph([{ sound: 'click', time: 1 }, { sound: 'click', time: 2.5 }, { sound: 'pop', time: 3 }], 10)!;
    const text = graph.parts.join(';');
    expect(text).not.toContain('asplit');
    expect(text.match(/aevalsrc/g)).toHaveLength(3);
    expect(text).toContain('adelay=2500:all=1[fx1]');
    expect(text).toContain('adelay=3000:all=1[fx2]');
    expect(text).toContain('[fx0][fx1][fx2]amix=inputs=3');
    expect(graph.label).toBe('[sfx]');
  });

  it('uses a fixed noise seed so every render sounds the same', () => {
    expect(sfxGraph([{ sound: 'draw', time: 0 }], 1)!.parts[0]).toContain('seed=7');
  });

  it('adds nothing when there are no events', () => {
    expect(sfxGraph([], 10)).toBeNull();
  });
});

describe('audioGraph with effects', () => {
  it('mixes effects after the ducking and before loudness normalization', () => {
    const graph = audioGraph({
      clips: [{ input: 1, start: 0 }], duration: 5, music: { input: 2, volume: 0.09 }, sfx: [{ sound: 'pop', time: 1 }],
    });
    expect(graph.indexOf('sidechaincompress')).toBeLessThan(graph.indexOf('[mix][sfx]amix'));
    expect(graph).toMatch(/\[withsfx\]loudnorm=.*\[aout\]$/);
  });
});

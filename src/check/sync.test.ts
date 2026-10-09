import { describe, expect, it } from 'vitest';
import type { CaptureEvent } from '../capture/events.ts';
import { soundEvents } from '../compose/sfx.ts';
import type { TimedOverlay } from '../timeline/build.ts';
import { auditSync, formatSync } from './sync.ts';

const overlay = (start: number, src = 'title-card.html'): TimedOverlay => ({ src, params: {}, start, end: start + 2, fade: 0.3, segment: 0, beats: {} });

const captured: CaptureEvent[] = [
  { kind: 'click', time: 1.0 },
  { kind: 'type', time: 1.7, chars: 4 },
  { kind: 'ring', time: 2.6 },
  { kind: 'label', time: 3.45 },
  { kind: 'zoom', time: 4.31, direction: 'in', duration: 1.2 },
  { kind: 'scroll', time: 6.2, duration: 0.9 },
  { kind: 'navigate', time: 7.5 },
  { kind: 'navigate', time: 9.1, transition: 'flip' },
];
const lower = { ...overlay(10.37, 'lower-third.html'), end: 12.37 };

describe('auditSync', () => {
  it('finds every sound the mix places on the first frame the drawing code shows it', () => {
    for (const fps of [15, 30]) {
      for (const [pointer, clickStyle] of [['mouse', 'circle'], ['touch', 'ripple'], ['touch', 'circle'], ['touch', 'none']] as const) {
        const scene = { fps, pointer, clickStyle, cues: [[{ at: 0.32, sound: 'pop' as const }]] };
        const sounds = soundEvents(captured, [lower], { mute: [] }, scene);
        expect(auditSync(sounds, captured, [lower], scene)).toEqual([]);
      }
    }
  });

  it('agrees on overlays without cues too', () => {
    const scene = { fps: 30 };
    expect(auditSync(soundEvents([], [lower], { mute: [] }, scene), [], [lower], scene)).toEqual([]);
  });

  it('flags a sound early by any amount, late by more than a frame, missing, or with nothing on screen', () => {
    const scene = { fps: 30 };
    const sounds = soundEvents(captured, [], { mute: [] }, scene);
    const click = sounds.find(s => s.sound === 'click')!;
    const draw = sounds.find(s => s.sound === 'draw')!;
    const shifted = sounds
      .map(s => (s === click ? { ...s, time: s.time - 1 / 30 } : s === draw ? { ...s, time: s.time + 2 / 30 } : s))
      .filter(s => s.sound !== 'whoosh')
      .concat({ sound: 'pop', time: 13, variant: 0 });
    const notes = auditSync(shifted, captured, [], scene).map(n => n.note);
    expect(notes).toEqual([
      'click sounds 33 ms before its click shows',
      'draw sounds 2 frames after its mark shows',
      'no whoosh for the zoom',
      'pop with nothing on screen to go with',
    ]);
  });

  it('expects no sound for what nobody sees, and skips muted sounds', () => {
    const away = (time: number) => (time > 4 && time < 6 ? 0 : 1);
    const scene = { fps: 30, screen: away, mute: ['keys' as const] };
    const sounds = soundEvents(captured, [], { mute: ['keys'] }, scene);
    expect(sounds.some(s => s.sound === 'whoosh')).toBe(false);
    expect(auditSync(sounds, captured, [], scene)).toEqual([]);
  });

  it('points at a shared template that marks no cue', () => {
    const scene = { fps: 30, cues: [[]], isTemplate: (src: string) => src === 'title-card.html' };
    const card = overlay(1);
    expect(auditSync(soundEvents([], [card], { mute: [] }, scene), [], [card], scene).map(n => n.note))
      .toEqual(['title-card.html marks no cue: its sound falls on its first frame']);
  });

  it('reads as one line when all is well', () => {
    expect(formatSync([])).toBe('✓ sync: every sound on its frame');
    expect(formatSync([{ time: 1, note: 'no pop for x' }])).toContain('⚠ sync: 1 to review');
  });
});

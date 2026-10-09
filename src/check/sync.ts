import type { CaptureEvent } from '../capture/events.ts';
import { charsDue } from '../capture/schedule.ts';
import { scrollPositionAt } from '../capture/scroll.ts';
import type { SoundEvent } from '../compose/sfx.ts';
import type { Sound } from '../compose/sounds.ts';
import { emptyPlan, sceneAt, TIMING, type ClickStyle, type EffectsPlan, type Scene } from '../effects/scene.ts';
import type { Cue } from '../overlays/cues.ts';
import { changeAt } from '../stage/plan.ts';
import { coversApp, type TimedOverlay } from '../timeline/build.ts';
import { cameraAt } from '../timeline/camera.ts';
import type { TimingNote } from './timing.ts';

export interface SyncScene {
  fps: number;
  cues?: readonly (readonly Cue[])[];
  screen?: (time: number) => number;
  pointer?: 'mouse' | 'touch';
  clickStyle?: ClickStyle;
  mute?: readonly Sound[];
  // Overlays from the shared templates, which should all say when they sound.
  isTemplate?: (src: string) => boolean;
}

interface Expected {
  sound: Sound;
  onset: number;
  what: string;
}

const HEARD_SHARE = 0.5;
const SEARCH = 2;
const NEAR = 0.25;
// A sound may land a sample's rounding early, and at most one frame after what it goes with.
const EARLY = 1e-4;

// The first frame, from just before `time`, where `shows` holds. The predicates below ask
// the code that draws each effect, not the rules that place the sounds: the audit catches
// one moving without the other.
function firstFrame(time: number, fps: number, shows: (at: number) => boolean): number | undefined {
  for (let frame = Math.floor(time * fps) - 1; frame <= Math.ceil((time + SEARCH) * fps); frame++) {
    if (frame / fps >= time - 1 / fps && shows(frame / fps)) return frame / fps;
  }
  return undefined;
}

const VIEW = { width: 1440, height: 900 };
const RECT = { x: 600, y: 400, width: 240, height: 80 };

function effectOnset(plan: Partial<EffectsPlan>, time: number, fps: number, pointer: 'mouse' | 'touch', clickStyle: ClickStyle): number | undefined {
  const full: EffectsPlan = { ...emptyPlan(pointer, VIEW, clickStyle), ...plan };
  const drawn = (scene: Scene) => scene.strokes.some(s => s.progress > 0 && s.opacity > 0) || (scene.cursor !== null && scene.cursor.scale !== 1);
  return firstFrame(time, fps, at => at >= time - 1e-9 && drawn(sceneAt(at, full)));
}

function expectations(captured: readonly CaptureEvent[], overlays: readonly TimedOverlay[], scene: SyncScene): Expected[] {
  const { fps, cues, screen = () => 1, pointer = 'mouse', clickStyle = 'circle' } = scene;
  const hidden = overlays.filter(coversApp);
  const seen = (time: number) => !hidden.some(o => time >= o.start && time <= o.end) && screen(time) >= HEARD_SHARE;
  const expected: Expected[] = [];
  const add = (sound: Sound, onset: number | undefined, what: string) => { if (onset !== undefined) expected.push({ sound, onset, what }); };
  const point = { x: 720, y: 440 };
  for (const event of captured) {
    if (!seen(event.time)) continue;
    const t = event.time;
    switch (event.kind) {
      case 'click': {
        if (pointer === 'touch' && clickStyle === 'none') break;
        const moves = [{ start: t - 1, end: t - 0.5, from: { x: 0, y: 0 }, to: point, bend: 0 }];
        add('click', effectOnset({ moves, clicks: [{ time: t, at: point, seed: 1 }] }, t, fps, pointer, clickStyle), 'its click');
        break;
      }
      case 'type':
        for (let i = 0; i < event.chars; i++) add('keys', firstFrame(t, fps, at => charsDue(event.chars, t, at) > i), `letter ${i + 1}`);
        break;
      case 'ring':
        if (event.style === 'spotlight') break;
        add('draw', effectOnset({ rings: [{ time: t, rect: RECT, hold: TIMING.ringHold, seed: 1 }] }, t, fps, pointer, clickStyle), 'its mark');
        break;
      case 'label': {
        // The bubble pops silently; the pen goes with the arrow.
        const plan = { labels: [{ time: t, rect: RECT, text: 'Label', hold: TIMING.labelHold, seed: 1 }] };
        const full: EffectsPlan = { ...emptyPlan(pointer, VIEW, clickStyle), ...plan };
        add('draw', firstFrame(t, fps, at => at >= t && sceneAt(at, full).strokes.some(s => s.progress > 0)), 'its arrow');
        break;
      }
      case 'zoom': {
        const home = { x: 0, y: 0, ...VIEW };
        const move = { time: t, duration: event.duration ?? 0.8, rect: { x: 0, y: 0, width: VIEW.width / 2, height: VIEW.height / 2 } };
        add('whoosh', firstFrame(t, fps, at => cameraAt(at, [move], home).width !== home.width), 'the zoom');
        break;
      }
      case 'scroll':
        if (event.duration < 0.3) break;
        add('scroll', firstFrame(t, fps, at => scrollPositionAt({ key: 'window', from: { x: 0, y: 0 }, to: { x: 0, y: 1000 }, start: t, duration: event.duration }, at).y > 0.5), 'the scroll');
        break;
      case 'navigate':
        // The dissolve starts at full opacity on the navigation's frame; the stage's change at progress 0.
        add('swipe', event.transition
          ? firstFrame(t, fps, at => (changeAt([{ time: t, kind: event.transition! }], at)?.progress ?? 0) > 0)
          : firstFrame(t, fps, at => at > t + 1e-9), 'the change of screen');
        break;
    }
  }
  overlays.forEach((overlay, i) => {
    if (overlay.silent) return;
    const marked = cues?.[i]?.length ? cues[i]! : [{ at: 0, sound: 'pop' as const }];
    for (const cue of marked) {
      // The overlay plays from its own frame zero at its start; the video shows at each frame the
      // overlay frame laid by then, and what the cue brings in shows on the overlay frame after it.
      const shown = Math.floor(cue.at * fps + 1e-6) + 1;
      add(cue.sound, firstFrame(overlay.start, fps, at => at >= overlay.start - 1e-9 && Math.floor((at - overlay.start) * fps + 1e-6) >= shown), overlay.src);
    }
  });
  return expected.filter(e => !scene.mute?.includes(e.sound));
}

// Every sound against the first frame where what it goes with shows: early by any amount,
// late by more than a frame, missing, or heard with nothing on screen.
export function auditSync(sounds: readonly SoundEvent[], captured: readonly CaptureEvent[], overlays: readonly TimedOverlay[], scene: SyncScene): TimingNote[] {
  const { fps } = scene;
  const notes: TimingNote[] = [];
  const unmatched = new Set(sounds);
  for (const want of expectations(captured, overlays, scene)) {
    const near = [...unmatched].filter(s => s.sound === want.sound && Math.abs(s.time - want.onset) <= NEAR)
      .sort((a, b) => Math.abs(a.time - want.onset) - Math.abs(b.time - want.onset))[0];
    if (!near) {
      notes.push({ time: want.onset, note: `no ${want.sound} for ${want.what}` });
      continue;
    }
    unmatched.delete(near);
    const late = near.time - want.onset;
    if (late < -EARLY) notes.push({ time: want.onset, note: `${want.sound} sounds ${Math.round(-late * 1000)} ms before ${want.what} shows` });
    else if (late > 1 / fps + EARLY) notes.push({ time: want.onset, note: `${want.sound} sounds ${Math.round(late * fps)} frames after ${want.what} shows` });
  }
  for (const sound of unmatched) notes.push({ time: sound.time, note: `${sound.sound} with nothing on screen to go with` });
  overlays.forEach((overlay, i) => {
    if (!overlay.silent && scene.cues && !scene.cues[i]?.length && scene.isTemplate?.(overlay.src)) {
      notes.push({ time: overlay.start, note: `${overlay.src} marks no cue: its sound falls on its first frame` });
    }
  });
  return notes.sort((a, b) => a.time - b.time);
}

export function formatSync(notes: readonly TimingNote[]): string {
  if (notes.length === 0) return '✓ sync: every sound on its frame';
  return [`⚠ sync: ${notes.length} to review`, ...notes.map(n => `  ${n.time.toFixed(2).padStart(7)}s  ${n.note}`)].join('\n');
}

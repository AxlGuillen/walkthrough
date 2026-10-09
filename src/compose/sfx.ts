import type { CaptureEvent } from '../capture/events.ts';
import { TRANSITION, TYPING_RATE, ZOOM_DURATION } from '../capture/schedule.ts';
import { random } from '../effects/sketch.ts';
import { TIMING, type ClickStyle } from '../effects/scene.ts';
import type { Cue } from '../overlays/cues.ts';
import { CHANGE_LENGTH } from '../stage/plan.ts';
import { coversApp, type Timeline, type TimedOverlay } from '../timeline/build.ts';
import type { StageTransition } from '../tour/schema.ts';
import type { Sound } from './sounds.ts';

export type { Sound } from './sounds.ts';

export interface SoundEvent {
  sound: Sound;
  time: number;
  variant: number;
  duration?: number;
}

export interface SfxSettings {
  volume: number;
  mute: readonly Sound[];
}

// What the mix needs to know about the picture to place each sound on it.
export interface SoundScene {
  fps: number;
  // Each overlay's cues (walkthrough.cue), in the timeline's order; absent for overlays
  // rendered before cues existed.
  cues?: readonly (readonly Cue[])[];
  // How much of the recording is in the frame at an instant: stage shots can take it away.
  screen?: (time: number) => number;
  // How a click shows: a mouse cursor presses on its frame; on a touch screen only its mark does.
  pointer?: 'mouse' | 'touch';
  clickStyle?: ClickStyle;
}

const CLICKS = [[3200, 900, 1300, 260], [2700, 1000, 1100, 300], [3700, 800, 1500, 240]] as const;
const POPS = [[480, 1500], [420, 1900]] as const;
const KEYS = [1800, 2100, 2400] as const;
const SWIPES: Record<'dissolve' | StageTransition, readonly [number, number]> = { dissolve: [2200, 9000], push: [1800, 7000], flip: [1400, 6000], fly: [2600, 9500] };
const MIN_SCROLL_SOUND = 0.3;
// Below this share of the recording in the frame, what happens in it is out of earshot too.
const HEARD_SHARE = 0.5;
const SAMPLE_RATE = 48000;

// Synthesized with ffmpeg instead of shipped as files: no licenses, and every render
// sounds identical. Noise sources have fixed seeds for the same reason. Sounds that go with
// an animation take its length.
function source({ sound, variant, duration = 0 }: SoundEvent): string {
  switch (sound) {
    case 'click': {
      const [f1, d1, f2, d2] = CLICKS[variant % CLICKS.length]!;
      return `aevalsrc='0.9*exp(-t*${d1})*sin(2*PI*${f1}*t)+0.5*exp(-t*${d2})*sin(2*PI*${f2}*t)':s=${SAMPLE_RATE}:d=0.08`;
    }
    case 'keys': {
      const f = KEYS[variant % KEYS.length]!;
      return `aevalsrc='(0.6*sin(2*PI*${f}*t)+0.4*sin(2*PI*${Math.round(f * 2.3)}*t))*exp(-t*350)':s=${SAMPLE_RATE}:d=0.04`;
    }
    case 'draw': {
      const d = duration || TIMING.ringDraw;
      const out = Math.min(0.15, d / 2);
      return `anoisesrc=d=${seconds(d)}:c=pink:r=${SAMPLE_RATE}:a=0.5:seed=7,highpass=f=1500,lowpass=f=6000,`
        + `tremolo=f=12:d=0.55,afade=t=in:d=${seconds(Math.min(0.03, d / 4))},afade=t=out:st=${seconds(d - out)}:d=${seconds(out)}`;
    }
    case 'pop': {
      const [base, sweep] = POPS[variant % POPS.length]!;
      return `aevalsrc='sin(2*PI*(${base}*t+${sweep}*t*t))*exp(-t*18)*min(1,t*400)':s=${SAMPLE_RATE}:d=0.3`;
    }
    case 'whoosh': {
      // Zooming in swells towards the end; zooming out starts loud and trails off.
      const d = duration || ZOOM_DURATION;
      const zoomIn = variant === 0;
      const [rise, fallAt] = zoomIn ? [0.7, 0.7] : [0.16, 0.2];
      return `anoisesrc=d=${seconds(d)}:c=pink:r=${SAMPLE_RATE}:a=0.5:seed=11,highpass=f=400,lowpass=f=${zoomIn ? 3500 : 2200},`
        + `afade=t=in:d=${seconds(rise * d)}:curve=qsin,afade=t=out:st=${seconds(fallAt * d)}:d=${seconds((1 - fallAt) * d)}:curve=qsin`;
    }
    case 'swipe': {
      // One per kind of change: the dissolve hisses, the stage's moves sit lower.
      const d = duration || TRANSITION;
      const [high, low] = Object.values(SWIPES)[variant % Object.keys(SWIPES).length]!;
      return `anoisesrc=d=${seconds(d)}:c=white:r=${SAMPLE_RATE}:a=0.4:seed=13,highpass=f=${high},lowpass=f=${low},`
        + `afade=t=in:d=${seconds(0.2 * d)},afade=t=out:st=${seconds(0.27 * d)}:d=${seconds(0.73 * d)}`;
    }
    case 'scroll': {
      const edge = Math.min(0.2, duration / 3);
      return `anoisesrc=d=${seconds(duration)}:c=brown:r=${SAMPLE_RATE}:a=0.5:seed=17,lowpass=f=700,highpass=f=120,`
        + `afade=t=in:d=${seconds(edge)},afade=t=out:st=${seconds(duration - edge)}:d=${seconds(edge)}`;
    }
  }
}

const seconds = (s: number) => Math.max(0, s).toFixed(3);

// Kept well under the voice: effects accent the picture, they never talk over it.
const GAIN: Record<Sound, number> = { click: 0.45, keys: 0.18, draw: 0.12, pop: 0.16, whoosh: 0.1, swipe: 0.08, scroll: 0.08 };

const variantFor = (time: number, count: number) => Math.floor(random(Math.round(time * 1000))() * count);

// The first frame at or after an instant: what is set on a frame shows on it (a cursor that
// presses, a letter typed).
export const atFrame = (time: number, fps: number) => Math.ceil(time * fps - 1e-6) / fps;
// The first frame after an instant: what eases in from nothing shows one frame later (a pen
// stroke at progress 0, a camera still at its start).
export const afterFrame = (time: number, fps: number) => (Math.floor(time * fps + 1e-6) + 1) / fps;

// Where an overlay's cue shows in the video: the overlay plays from its own frame zero at its
// start, and what its cue brings in shows on the overlay frame after the cue. Without a cue,
// its first frame after it starts fading in.
export function overlayOnset(start: number, cue: number, fps: number): number {
  return atFrame(start + afterFrame(cue, fps), fps);
}

// Every sound comes from the animation it goes with: it starts on the first frame where that
// animation shows and lasts as long as it does. What the viewer cannot see stays silent.
export function soundEvents(
  captured: readonly CaptureEvent[], overlays: readonly TimedOverlay[], { mute }: Pick<SfxSettings, 'mute'> = { mute: [] },
  { fps, cues, screen = () => 1, pointer = 'mouse', clickStyle = 'circle' }: SoundScene = { fps: 30 },
): SoundEvent[] {
  const events: SoundEvent[] = [];
  const hidden = overlays.filter(coversApp);
  const seen = (time: number) => !hidden.some(o => time >= o.start && time <= o.end) && screen(time) >= HEARD_SHARE;
  for (const event of captured) {
    if (!seen(event.time)) continue;
    switch (event.kind) {
      case 'click': {
        // The cursor presses on the click's frame, and a ripple opens on it; a drawn circle starts
        // on the frame after. A touch screen without a click style shows nothing, so it is silent.
        if (pointer === 'touch' && clickStyle === 'none') break;
        const onset = pointer === 'touch' && clickStyle === 'circle' ? afterFrame : atFrame;
        events.push({ sound: 'click', time: onset(event.time, fps), variant: variantFor(event.time, CLICKS.length) });
        break;
      }
      case 'type':
        for (let i = 0; i < event.chars; i++) events.push({ sound: 'keys', time: atFrame(event.time + i / TYPING_RATE, fps), variant: i % KEYS.length });
        break;
      case 'ring':
        // A spotlight dims the screen without drawing anything: no pen sound. A mark retired
        // early still finishes its stroke before it fades (endRingAt), so its sound stays whole.
        if (event.style === 'spotlight') break;
        events.push({ sound: 'draw', time: afterFrame(event.time, fps), variant: 0, duration: TIMING.ringDraw });
        break;
      case 'label':
        // The bubble pops silently; the pen is heard while the arrow and its head are drawn.
        events.push({ sound: 'draw', time: afterFrame(event.time + TIMING.arrowDelay, fps), variant: 0, duration: TIMING.arrowDraw + TIMING.headDraw });
        break;
      case 'zoom':
        events.push({ sound: 'whoosh', time: afterFrame(event.time, fps), variant: event.direction === 'in' ? 0 : 1, duration: event.duration ?? ZOOM_DURATION });
        break;
      case 'scroll':
        if (event.duration >= MIN_SCROLL_SOUND) events.push({ sound: 'scroll', time: afterFrame(event.time, fps), variant: 0, duration: event.duration });
        break;
      case 'navigate': {
        const kind = event.transition ?? 'dissolve';
        events.push({ sound: 'swipe', time: afterFrame(event.time, fps), variant: Object.keys(SWIPES).indexOf(kind), duration: event.transition ? CHANGE_LENGTH : TRANSITION });
        break;
      }
    }
  }
  // One sound per cue, on the frame where what it marks comes in; a pop on its first frame for
  // an overlay without cues. A flow is an aid: its steps stay silent, they would crowd the voice.
  overlays.forEach((overlay, i) => {
    if (overlay.silent) return;
    const marked = cues?.[i]?.length ? cues[i]! : [{ at: 0, sound: 'pop' as const }];
    for (const cue of marked) events.push({ sound: cue.sound, time: overlayOnset(overlay.start, cue.at, fps), variant: i % POPS.length });
  });
  return events.filter(e => !mute.includes(e.sound)).sort((a, b) => a.time - b.time);
}

// For captures made before events.json existed: what the timeline alone can tell.
export function eventsFromTimeline({ actions }: Pick<Timeline, 'actions'>): CaptureEvent[] {
  return actions.flatMap(({ time, action }): CaptureEvent[] => {
    switch (action.kind) {
      case 'click':
      case 'upload': return [{ kind: 'click', time }];
      case 'type': return [{ kind: 'click', time }, { kind: 'type', time, chars: action.text.length }];
      case 'highlight': return [{ kind: 'ring', time }];
      case 'zoom': return [{ kind: 'zoom', time, direction: action.to === 'out' ? 'out' : 'in', ...(action.duration ? { duration: action.duration } : {}) }];
      default: return [];
    }
  });
}

// Starts a stream `time` seconds in, to the sample and never early. adelay's padding comes out
// without timestamps in ffmpeg 8.1, and the atrim after a mix then drops it: every sound slid
// earlier by the first one's delay. asetpts numbers the samples again from zero.
export function placeAt(time: number): string {
  return `adelay=${Math.ceil(time * SAMPLE_RATE - 1e-6)}S:all=1,asetpts=N/SR/TB`;
}

// One source per event on purpose: ffmpeg 8.1 spins forever on asplit → adelay → amix,
// even with two events. The sounds are a fraction of a second, so this costs nothing.
export function sfxGraph(events: readonly SoundEvent[], duration: number, volume = 1): { parts: string[]; label: string } | null {
  if (events.length === 0) return null;
  const parts = events.map((event, i) =>
    `${source(event)},aformat=channel_layouts=stereo,volume=${+(GAIN[event.sound] * volume).toFixed(4)},${placeAt(event.time)}[fx${i}]`);
  const labels = events.map((_, i) => `[fx${i}]`).join('');
  parts.push(`${labels}amix=inputs=${events.length}:normalize=0:duration=longest,apad,atrim=0:${duration.toFixed(3)}[sfx]`);
  return { parts, label: '[sfx]' };
}

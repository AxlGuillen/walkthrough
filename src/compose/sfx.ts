import type { CaptureEvent } from '../capture/events.ts';
import { TYPING_RATE } from '../capture/schedule.ts';
import { random } from '../effects/sketch.ts';
import { TIMING } from '../effects/scene.ts';
import type { Timeline, TimedOverlay } from '../timeline/build.ts';
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

const CLICKS = [[3200, 900, 1300, 260], [2700, 1000, 1100, 300], [3700, 800, 1500, 240]] as const;
const POPS = [[480, 1500], [420, 1900]] as const;
const KEYS = [1800, 2100, 2400] as const;
const MIN_SCROLL_SOUND = 0.3;

// Synthesized with ffmpeg instead of shipped as files: no licenses, and every render
// sounds identical. Noise sources have fixed seeds for the same reason.
function source({ sound, variant, duration = 0 }: SoundEvent): string {
  switch (sound) {
    case 'click': {
      const [f1, d1, f2, d2] = CLICKS[variant % CLICKS.length]!;
      return `aevalsrc='0.9*exp(-t*${d1})*sin(2*PI*${f1}*t)+0.5*exp(-t*${d2})*sin(2*PI*${f2}*t)':s=48000:d=0.08`;
    }
    case 'keys': {
      const f = KEYS[variant % KEYS.length]!;
      return `aevalsrc='(0.6*sin(2*PI*${f}*t)+0.4*sin(2*PI*${Math.round(f * 2.3)}*t))*exp(-t*350)':s=48000:d=0.04`;
    }
    case 'draw':
      return `anoisesrc=d=${TIMING.ringDraw}:c=pink:r=48000:a=0.5:seed=7,highpass=f=1500,lowpass=f=6000,`
        + `tremolo=f=12:d=0.55,afade=t=in:d=0.03,afade=t=out:st=${TIMING.ringDraw - 0.15}:d=0.15`;
    case 'pop': {
      const [base, sweep] = POPS[variant % POPS.length]!;
      return `aevalsrc='sin(2*PI*(${base}*t+${sweep}*t*t))*exp(-t*18)*min(1,t*400)':s=48000:d=0.3`;
    }
    case 'whoosh': {
      // Zooming in swells towards the end; zooming out starts loud and trails off.
      const zoomIn = variant === 0;
      return `anoisesrc=d=0.5:c=pink:r=48000:a=0.5:seed=11,highpass=f=400,lowpass=f=${zoomIn ? 3500 : 2200},`
        + `afade=t=in:d=${zoomIn ? 0.35 : 0.08}:curve=qsin,afade=t=out:st=${zoomIn ? 0.35 : 0.1}:d=${zoomIn ? 0.15 : 0.4}:curve=qsin`;
    }
    case 'swipe':
      return 'anoisesrc=d=0.3:c=white:r=48000:a=0.4:seed=13,highpass=f=2200,lowpass=f=9000,afade=t=in:d=0.06,afade=t=out:st=0.08:d=0.22';
    case 'scroll': {
      const edge = Math.min(0.2, duration / 3);
      return `anoisesrc=d=${duration.toFixed(3)}:c=brown:r=48000:a=0.5:seed=17,lowpass=f=700,highpass=f=120,`
        + `afade=t=in:d=${edge.toFixed(3)},afade=t=out:st=${(duration - edge).toFixed(3)}:d=${edge.toFixed(3)}`;
    }
  }
}

// Kept well under the voice: effects accent the picture, they never talk over it.
const GAIN: Record<Sound, number> = { click: 0.45, keys: 0.18, draw: 0.12, pop: 0.16, whoosh: 0.1, swipe: 0.08, scroll: 0.08 };

const variantFor = (time: number, count: number) => Math.floor(random(Math.round(time * 1000))() * count);

export function soundEvents(
  captured: readonly CaptureEvent[], overlays: readonly TimedOverlay[], { mute }: Pick<SfxSettings, 'mute'> = { mute: [] },
): SoundEvent[] {
  const events: SoundEvent[] = [];
  for (const event of captured) {
    switch (event.kind) {
      case 'click':
        events.push({ sound: 'click', time: event.time, variant: variantFor(event.time, CLICKS.length) });
        break;
      case 'type':
        for (let i = 0; i < event.chars; i++) events.push({ sound: 'keys', time: event.time + i / TYPING_RATE, variant: i % KEYS.length });
        break;
      case 'ring':
      case 'label':
        events.push({ sound: 'draw', time: event.time, variant: 0 });
        break;
      case 'zoom':
        events.push({ sound: 'whoosh', time: event.time, variant: event.direction === 'in' ? 0 : 1 });
        break;
      case 'scroll':
        if (event.duration >= MIN_SCROLL_SOUND) events.push({ sound: 'scroll', time: event.time, variant: 0, duration: event.duration });
        break;
      case 'navigate':
        events.push({ sound: 'swipe', time: event.time, variant: 0 });
        break;
    }
  }
  overlays.forEach((overlay, i) => events.push({ sound: 'pop', time: overlay.start, variant: i % POPS.length }));
  return events.filter(e => !mute.includes(e.sound)).sort((a, b) => a.time - b.time);
}

// For captures made before events.json existed: what the timeline alone can tell.
export function eventsFromTimeline({ actions }: Pick<Timeline, 'actions'>): CaptureEvent[] {
  return actions.flatMap(({ time, action }): CaptureEvent[] => {
    switch (action.kind) {
      case 'click': return [{ kind: 'click', time }];
      case 'type': return [{ kind: 'click', time }, { kind: 'type', time, chars: action.text.length }];
      case 'highlight': return [{ kind: 'ring', time }];
      case 'zoom': return [{ kind: 'zoom', time, direction: action.to === 'out' ? 'out' : 'in' }];
      default: return [];
    }
  });
}

// One source per event on purpose: ffmpeg 8.1 spins forever on asplit → adelay → amix,
// even with two events. The sounds are a fraction of a second, so this costs nothing.
export function sfxGraph(events: readonly SoundEvent[], duration: number, volume = 1): { parts: string[]; label: string } | null {
  if (events.length === 0) return null;
  const parts = events.map((event, i) =>
    `${source(event)},aformat=channel_layouts=stereo,volume=${+(GAIN[event.sound] * volume).toFixed(4)},adelay=${Math.round(event.time * 1000)}:all=1[fx${i}]`);
  const labels = events.map((_, i) => `[fx${i}]`).join('');
  parts.push(`${labels}amix=inputs=${events.length}:normalize=0:duration=longest,apad,atrim=0:${duration.toFixed(3)}[sfx]`);
  return { parts, label: '[sfx]' };
}

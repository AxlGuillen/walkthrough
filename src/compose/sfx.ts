import { TIMING } from '../effects/scene.ts';
import type { Timeline } from '../timeline/build.ts';

export type Sound = 'click' | 'draw' | 'pop';

export interface SoundEvent {
  sound: Sound;
  time: number;
}

// Synthesized with ffmpeg instead of shipped as files: no licenses, and every render
// sounds identical. The noise has a fixed seed for the same reason.
const SOURCES: Record<Sound, string> = {
  click: "aevalsrc='0.9*exp(-t*900)*sin(2*PI*3200*t)+0.5*exp(-t*260)*sin(2*PI*1300*t)':s=48000:d=0.08",
  draw: `anoisesrc=d=${TIMING.ringDraw}:c=pink:r=48000:a=0.5:seed=7,highpass=f=1500,lowpass=f=6000,`
    + `tremolo=f=12:d=0.55,afade=t=in:d=0.03,afade=t=out:st=${TIMING.ringDraw - 0.15}:d=0.15`,
  pop: "aevalsrc='sin(2*PI*(480*t+1500*t*t))*exp(-t*18)*min(1,t*400)':s=48000:d=0.3",
};

// Kept well under the voice: effects accent the picture, they never talk over it.
const GAIN: Record<Sound, number> = { click: 0.45, draw: 0.12, pop: 0.16 };

export function soundEvents(timeline: Pick<Timeline, 'actions' | 'overlays'>): SoundEvent[] {
  const events: SoundEvent[] = [];
  for (const { time, action } of timeline.actions) {
    if (action.kind === 'click' || action.kind === 'type') events.push({ sound: 'click', time });
    if (action.kind === 'highlight') events.push({ sound: 'draw', time });
  }
  for (const overlay of timeline.overlays) events.push({ sound: 'pop', time: overlay.start });
  return events.sort((a, b) => a.time - b.time);
}

// One source per event on purpose: ffmpeg 8.1 spins forever on asplit → adelay → amix,
// even with two events. The sounds are a fraction of a second, so this costs nothing.
export function sfxGraph(events: readonly SoundEvent[], duration: number): { parts: string[]; label: string } | null {
  if (events.length === 0) return null;
  const parts = events.map(({ sound, time }, i) =>
    `${SOURCES[sound]},aformat=channel_layouts=stereo,volume=${GAIN[sound]},adelay=${Math.round(time * 1000)}:all=1[fx${i}]`);
  const labels = events.map((_, i) => `[fx${i}]`).join('');
  parts.push(`${labels}amix=inputs=${events.length}:normalize=0:duration=longest,apad,atrim=0:${duration.toFixed(3)}[sfx]`);
  return { parts, label: '[sfx]' };
}

import { sfxGraph, type SoundEvent } from './sfx.ts';

export interface VoiceClip {
  input: number;
  start: number;
}

export interface AudioGraphOptions {
  clips: readonly VoiceClip[];
  duration: number;
  music?: { input: number; volume: number };
  sfx?: readonly SoundEvent[];
  loudness?: Loudness;
}

// What loudnorm's first pass reports. Feeding it back makes the second pass a single
// linear gain: one-pass loudnorm acts like an automatic gain control and lifts quiet
// passages, which undid turning the music down.
export interface Loudness {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

const TARGET = 'I=-16:TP=-1.5:LRA=11';

const MUSIC_FADE_IN = 1.5;
const MUSIC_FADE_OUT = 2;

// Voice lands at -16 LUFS; the bed ducks under it via sidechaincompress instead of
// hand-drawn volume curves.
export function audioGraph({ clips, duration, music, sfx = [], loudness }: AudioGraphOptions): string {
  const d = duration.toFixed(3);
  const parts: string[] = [];

  if (clips.length === 0) {
    parts.push(`anullsrc=r=48000:cl=stereo,atrim=0:${d}[voice]`);
  } else {
    clips.forEach(({ input, start }, i) => {
      const ms = Math.round(start * 1000);
      parts.push(`[${input}:a]aformat=channel_layouts=stereo,adelay=${ms}:all=1[v${i}]`);
    });
    const labels = clips.map((_, i) => `[v${i}]`).join('');
    parts.push(`${labels}amix=inputs=${clips.length}:normalize=0:duration=longest,apad,atrim=0:${d}[voice]`);
  }

  let mix = '[voice]';
  if (music) {
    const fadeOut = Math.max(0, duration - MUSIC_FADE_OUT).toFixed(3);
    parts.push('[voice]asplit=2[speech][sidechain]');
    parts.push(`[${music.input}:a]aformat=channel_layouts=stereo,atrim=0:${d},volume=${music.volume},`
      + `afade=t=in:d=${MUSIC_FADE_IN},afade=t=out:st=${fadeOut}:d=${MUSIC_FADE_OUT}[bed]`);
    parts.push('[bed][sidechain]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked]');
    parts.push('[speech][ducked]amix=inputs=2:normalize=0:duration=first[mix]');
    mix = '[mix]';
  }
  // Effects join after the ducking, so they never push the music down.
  const effects = sfxGraph(sfx, duration);
  if (effects) {
    parts.push(...effects.parts);
    parts.push(`${mix}${effects.label}amix=inputs=2:normalize=0:duration=first[withsfx]`);
    mix = '[withsfx]';
  }
  const normalize = loudness
    ? `loudnorm=${TARGET}:measured_I=${loudness.input_i}:measured_TP=${loudness.input_tp}:measured_LRA=${loudness.input_lra}`
      + `:measured_thresh=${loudness.input_thresh}:offset=${loudness.target_offset}:linear=true`
    : `loudnorm=${TARGET}:print_format=json`;
  parts.push(`${mix}${normalize},aresample=48000,atrim=0:${d}[aout]`);
  return parts.join(';');
}

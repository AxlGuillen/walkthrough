import type { TimedOverlay } from '../timeline/build.ts';

export class ProbeError extends Error {
  override name = 'ProbeError';
}

// "title=0.4,line=1.2" → { title: 0.4, line: 1.2 }; numbers for beats, text for params.
export function parsePairs(text: string | undefined): Record<string, string> {
  if (!text) return {};
  return Object.fromEntries(text.split(',').map(pair => {
    const at = pair.indexOf('=');
    if (at <= 0) throw new ProbeError(`expected name=value, got "${pair}"`);
    return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
  }));
}

export interface ProbeOptions {
  src: string;
  duration: number;
  beats?: string;
  params?: string;
  data?: unknown;
}

// One overlay on its own, as if a tour showed it from 0 to `duration`, to design a resource
// without writing a tour around it.
export function probeOverlay({ src, duration, beats, params, data }: ProbeOptions): TimedOverlay {
  if (!(duration > 0)) throw new ProbeError('duration must be a positive number of seconds');
  const timed = Object.fromEntries(Object.entries(parsePairs(beats)).map(([name, value]) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= duration) {
      throw new ProbeError(`beat "${name}" must be a number of seconds within the ${duration}s overlay`);
    }
    return [name, seconds];
  }));
  return {
    src, params: parsePairs(params), start: 0, end: duration, fade: 0, segment: 0, beats: timed,
    ...(data === undefined ? {} : { data }),
  };
}

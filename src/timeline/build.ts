import type { Action, Anchor, Tour } from '../tour/schema.ts';
import type { SpeechTiming, Word } from '../voice/types.ts';
import { findPhrase } from './words.ts';

export const LEAD_IN = 0.35;
export const TAIL_OUT = 0.65;

export class TimelineError extends Error {
  override name = 'TimelineError';
}

export interface TimedSegment {
  index: number;
  start: number;
  end: number;
  speechStart: number | null;
}

export interface TimedAction {
  time: number;
  segment: number;
  action: Action;
}

export interface TimedOverlay {
  src: string;
  start: number;
  end: number;
  fade: number;
  segment: number;
}

export interface Timeline {
  duration: number;
  segments: TimedSegment[];
  actions: TimedAction[];
  overlays: TimedOverlay[];
  words: Word[];
}

export interface TimelineOptions {
  leadIn?: number;
  tailOut?: number;
}

export function buildTimeline(
  tour: Tour,
  speech: readonly (SpeechTiming | undefined)[],
  { leadIn = LEAD_IN, tailOut = TAIL_OUT }: TimelineOptions = {},
): Timeline {
  const timeline: Timeline = { duration: 0, segments: [], actions: [], overlays: [], words: [] };

  tour.segments.forEach((segment, index) => {
    const label = `segment ${index + 1}`;
    const spoken = segment.say === undefined ? undefined : speech[index];
    if (segment.say !== undefined && spoken === undefined) throw new TimelineError(`${label}: missing speech`);

    const length = Math.max(spoken ? leadIn + spoken.duration + tailOut : 0, segment.hold ?? 0);
    const start = timeline.duration;
    const end = start + length;
    const speechStart = spoken ? start + leadIn : null;

    const locate = (phrase: string, what: string) => {
      const match = spoken && findPhrase(spoken.words, phrase);
      if (!match) throw new TimelineError(`${label}: ${what} "${phrase}" is not in the narration`);
      return match;
    };

    const resolve = (anchor: Anchor | undefined, fallback: number, what: string): number => {
      if (anchor === undefined) return fallback;
      const offset = typeof anchor === 'number' ? anchor : leadIn + locate(anchor, what).start;
      if (offset > length) {
        throw new TimelineError(`${label}: ${what} at ${offset.toFixed(2)}s is past the segment end (${length.toFixed(2)}s)`);
      }
      return start + offset;
    };

    const actions = segment.do
      .map(action => ({ time: resolve(action.at, start, action.kind), segment: index, action }))
      .sort((a, b) => a.time - b.time);
    timeline.actions.push(...actions);

    for (const overlay of segment.overlays) {
      const from = resolve(overlay.from, start, `overlay ${overlay.src}`);
      const to = resolve(overlay.to, end, `overlay ${overlay.src}`);
      if (to <= from) throw new TimelineError(`${label}: overlay ${overlay.src} ends before it starts`);
      timeline.overlays.push({ src: overlay.src, start: from, end: to, fade: overlay.fade, segment: index });
    }

    if (spoken && speechStart !== null) {
      timeline.words.push(...spoken.words.map(word => ({
        text: word.text,
        start: speechStart + word.start,
        end: speechStart + word.end,
      })));
    }

    timeline.segments.push({ index, start, end, speechStart });
    timeline.duration = end;
  });

  return timeline;
}

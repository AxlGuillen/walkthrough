import type { Action, Anchor, Flow, Shot, Tour } from '../tour/schema.ts';
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

export interface TimedShot {
  time: number;
  segment: number;
  shot: Shot;
}

// Steps in narration order: a decision's own steps, then its first branch, then its second.
export interface TimedFlowStep {
  text: string;
  detail?: string;
  time: number;
  branch?: 0 | 1;
  lane?: number;
  emoji?: string;
}

export interface TimedFlow {
  shape: Flow['shape'];
  mode: Flow['mode'];
  title?: string;
  steps: TimedFlowStep[];
  // A decision's branch labels, or a comparison's side labels (before, after).
  branches?: [string, string];
  lanes?: string[];
  loop?: number;
}

export interface TimedOverlay {
  src: string;
  params: Record<string, string>;
  start: number;
  end: number;
  fade: number;
  segment: number;
  // Seconds on the overlay's own clock, which starts at zero when it appears.
  beats: Record<string, number>;
  data?: unknown;
  flow?: TimedFlow;
  // No pop when it appears: the watermark is there all along, not an event.
  silent?: boolean;
}

export const FLOW_TEMPLATE = 'flow.html';
export const WATERMARK_TEMPLATE = 'watermark.html';
// Room for the flow to fade in before its first step, and for the last one to be read.
const FLOW_FIRST_STEP = 0.4;
const FLOW_LAST_READ = 0.8;
const FLOW_LOOP_AFTER = 0.6;

export interface Timeline {
  duration: number;
  segments: TimedSegment[];
  actions: TimedAction[];
  overlays: TimedOverlay[];
  // Camera angles for the stage, kept apart from actions: the capture never runs them.
  shots: TimedShot[];
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
  const timeline: Timeline = { duration: 0, segments: [], actions: [], overlays: [], shots: [], words: [] };

  tour.segments.forEach((segment, index) => {
    const label = `segment ${index + 1}`;
    const spoken = segment.say === undefined ? undefined : speech[index];
    if (segment.say !== undefined && spoken === undefined) throw new TimelineError(`${label}: missing speech`);

    const length = Math.max(spoken ? leadIn + spoken.duration + tailOut : 0, segment.hold ?? 0);
    const start = timeline.duration;
    const end = start + length;
    const speechStart = spoken ? start + leadIn : null;

    const locate = (phrase: string, what: string, after?: number) => {
      const match = spoken && findPhrase(spoken.words, phrase, after);
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

    const steps = segment.do.map(step => ({ time: resolve(step.at, start, step.kind), step })).sort((a, b) => a.time - b.time);
    for (const { time, step } of steps) {
      if (step.kind === 'shot') timeline.shots.push({ time, segment: index, shot: step });
      else timeline.actions.push({ time, segment: index, action: step });
    }

    for (const overlay of segment.overlays) {
      const what = `overlay ${overlay.src}`;
      const from = resolve(overlay.from, start, what);
      const to = resolve(overlay.to, end, what);
      if (to <= from) throw new TimelineError(`${label}: ${what} ends before it starts`);
      // Each word is looked for after the one before, so a repeated word can mark two beats.
      let lastWord: number | undefined;
      const beats = Object.fromEntries(Object.entries(overlay.beats).map(([name, at]) => {
        let time: number;
        if (typeof at === 'number') time = resolve(at, start, `${what} beat "${name}"`);
        else {
          const match = locate(at, `${what} beat "${name}"`, lastWord);
          lastWord = match.start;
          time = resolve(leadIn + match.start, start, `${what} beat "${name}"`);
        }
        if (time < from || time >= to) throw new TimelineError(`${label}: ${what} beat "${name}" falls outside the overlay`);
        return [name, time - from];
      }));
      timeline.overlays.push({
        src: overlay.src, params: overlay.params, start: from, end: to, fade: overlay.fade, segment: index, beats,
        ...(overlay.data === undefined ? {} : { data: overlay.data }),
      });
    }

    if (segment.flow) {
      const flow = segment.flow;
      const from = resolve(flow.from, start, 'flow');
      const to = resolve(flow.to, end, 'flow');
      if (to <= from) throw new TimelineError(`${label}: flow ends before it starts`);

      const sides = flow.branches ?? (flow.before && flow.after ? [flow.before, flow.after] as const : []);
      const steps = [
        ...flow.steps.map(step => ({ ...step, branch: undefined })),
        ...sides.flatMap((side, b) => side.steps.map(step => ({ ...step, branch: b as 0 | 1 }))),
      ];
      let lastWord: number | undefined;
      const anchor = (at: Anchor, what: string) => {
        if (typeof at === 'number') return resolve(at, start, what);
        const match = locate(at, what, lastWord);
        lastWord = match.start;
        return resolve(leadIn + match.start, start, what);
      };
      const anchored = steps.map(({ at, text }) => (at === undefined ? undefined : anchor(at, `flow step "${text}"`)));
      const speechEnd = spoken && speechStart !== null ? speechStart + spoken.duration : to;
      const times = spreadTimes(anchored, from + FLOW_FIRST_STEP, Math.min(speechEnd, to - FLOW_LAST_READ));
      times.forEach((time, i) => {
        const text = steps[i]!.text;
        if (time < from || time >= to) throw new TimelineError(`${label}: flow step "${text}" falls outside the flow`);
        if (i > 0 && time <= times[i - 1]!) {
          throw new TimelineError(`${label}: flow step "${text}" comes before the step above it; its word is said earlier`);
        }
      });
      const last = times.at(-1)!;
      const loop = flow.shape !== 'cycle' ? undefined
        : flow.loop === undefined ? Math.min(last + FLOW_LOOP_AFTER, to - FLOW_LOOP_AFTER / 2) : anchor(flow.loop, 'flow loop');
      if (loop !== undefined && (loop <= last || loop >= to)) {
        throw new TimelineError(`${label}: the flow's loop must come after its last step and before the flow ends`);
      }

      timeline.overlays.push({
        src: FLOW_TEMPLATE, params: {}, start: from, end: to, fade: flow.fade, segment: index, beats: {},
        flow: {
          shape: flow.shape, mode: flow.mode, ...(flow.title ? { title: flow.title } : {}),
          steps: steps.map(({ text, detail, branch, lane, emoji }, i) => ({
            text, ...(detail ? { detail } : {}), ...(emoji ? { emoji } : {}), time: times[i]!, ...(branch === undefined ? {} : { branch }),
            ...(lane === undefined || !flow.lanes ? {} : { lane: flow.lanes.indexOf(lane) }),
          })),
          ...(sides.length ? { branches: [sides[0]!.label, sides[1]!.label] as [string, string] } : {}),
          ...(flow.lanes ? { lanes: flow.lanes } : {}),
          ...(loop === undefined ? {} : { loop }),
        },
      });
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

  if (tour.watermark) {
    if (!tour.brand) throw new TimelineError('watermark: true needs a brand');
    // Over the tour, but not over its opening and closing segments when it has them.
    const segments = timeline.segments;
    const from = segments.length > 2 ? segments[0]!.end : 0;
    const to = segments.length > 2 ? segments.at(-1)!.start : timeline.duration;
    if (to > from) timeline.overlays.push({ src: WATERMARK_TEMPLATE, params: {}, start: from, end: to, fade: 0.6, segment: -1, beats: {}, silent: true });
  }

  return timeline;
}

const SPREAD_MIN = 0.6;

// Fills the gaps between anchored times evenly; leading and trailing gaps run from `first`
// and to `last`, which bound the steps nothing anchors.
export function spreadTimes(anchored: readonly (number | undefined)[], first: number, last: number, minGap = SPREAD_MIN): number[] {
  const times = [...anchored];
  let i = 0;
  while (i < times.length) {
    if (times[i] !== undefined) { i++; continue; }
    let j = i;
    while (j < times.length && times[j] === undefined) j++;
    const before = i > 0 ? times[i - 1]! : undefined;
    const after = j < times.length ? times[j]! : undefined;
    const count = j - i;
    const lo = before ?? (after === undefined ? first : Math.min(first, after - minGap * count));
    const hi = after ?? Math.max(last, lo + minGap * (count - (before === undefined ? 1 : 0)));
    // Open at an anchored end, closed at a free one: a free first step lands on `first`.
    const slots = count + (before === undefined ? 0 : 1) + (after === undefined ? 0 : 1) - 1;
    for (let k = i; k < j; k++) {
      const position = k - i + (before === undefined ? 0 : 1);
      times[k] = slots <= 0 ? lo : lo + ((hi - lo) * position) / slots;
    }
    i = j;
  }
  return times as number[];
}

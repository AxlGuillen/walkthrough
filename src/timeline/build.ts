import type { Action, Anchor, Flow, Tour } from '../tour/schema.ts';
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

// Steps in narration order: a decision's own steps, then its first branch, then its second.
export interface TimedFlowStep {
  text: string;
  detail?: string;
  time: number;
  branch?: 0 | 1;
}

export interface TimedFlow {
  shape: Flow['shape'];
  mode: Flow['mode'];
  title?: string;
  steps: TimedFlowStep[];
  branches?: [string, string];
  loop?: number;
}

export interface TimedOverlay {
  src: string;
  params: Record<string, string>;
  start: number;
  end: number;
  fade: number;
  segment: number;
  flow?: TimedFlow;
}

export const FLOW_TEMPLATE = 'flow.html';
// Room for the flow to fade in before its first step, and for the last one to be read.
const FLOW_FIRST_STEP = 0.4;
const FLOW_LAST_READ = 0.8;
const FLOW_LOOP_AFTER = 0.6;

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

    const actions = segment.do
      .map(action => ({ time: resolve(action.at, start, action.kind), segment: index, action }))
      .sort((a, b) => a.time - b.time);
    timeline.actions.push(...actions);

    for (const overlay of segment.overlays) {
      const from = resolve(overlay.from, start, `overlay ${overlay.src}`);
      const to = resolve(overlay.to, end, `overlay ${overlay.src}`);
      if (to <= from) throw new TimelineError(`${label}: overlay ${overlay.src} ends before it starts`);
      timeline.overlays.push({ src: overlay.src, params: overlay.params, start: from, end: to, fade: overlay.fade, segment: index });
    }

    if (segment.flow) {
      const flow = segment.flow;
      const from = resolve(flow.from, start, 'flow');
      const to = resolve(flow.to, end, 'flow');
      if (to <= from) throw new TimelineError(`${label}: flow ends before it starts`);

      const steps = [
        ...flow.steps.map(step => ({ ...step, branch: undefined })),
        ...(flow.branches ?? []).flatMap((branch, b) => branch.steps.map(step => ({ ...step, branch: b as 0 | 1 }))),
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
        src: FLOW_TEMPLATE, params: {}, start: from, end: to, fade: flow.fade, segment: index,
        flow: {
          shape: flow.shape, mode: flow.mode, ...(flow.title ? { title: flow.title } : {}),
          steps: steps.map(({ text, detail, branch }, i) => ({
            text, ...(detail ? { detail } : {}), time: times[i]!, ...(branch === undefined ? {} : { branch }),
          })),
          ...(flow.branches ? { branches: [flow.branches[0].label, flow.branches[1].label] as [string, string] } : {}),
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

  return timeline;
}

const SPREAD_MIN = 0.6;

// Fills the gaps between anchored times evenly; leading and trailing gaps run from `first`
// and to `last`, which bound the steps nothing anchors.
export function spreadTimes(anchored: readonly (number | undefined)[], first: number, last: number): number[] {
  const times = [...anchored];
  let i = 0;
  while (i < times.length) {
    if (times[i] !== undefined) { i++; continue; }
    let j = i;
    while (j < times.length && times[j] === undefined) j++;
    const before = i > 0 ? times[i - 1]! : undefined;
    const after = j < times.length ? times[j]! : undefined;
    const count = j - i;
    const lo = before ?? (after === undefined ? first : Math.min(first, after - SPREAD_MIN * count));
    const hi = after ?? Math.max(last, lo + SPREAD_MIN * (count - (before === undefined ? 1 : 0)));
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

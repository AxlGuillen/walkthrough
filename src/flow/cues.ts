// When each part of a flow moves, in seconds on the flow's own clock. The arrow toward a
// step is drawn just before its word so the box lands on it; the step then stays active
// (ringed) until the next one takes over, and the finished ones step back.
export interface StepCue {
  enter: number;
  arrow?: { start: number; duration: number };
  ringIn: number;
  ringOut?: number;
  dim?: number;
}

export const CUE = { arrowLead: 0.45, arrowMin: 0.15, arrowAfterBox: 0.2, ringDelay: 0.15 };

export function flowCues(times: readonly number[], start = 0): StepCue[] {
  return times.map((time, i) => {
    const t = time - start;
    const next = times[i + 1] === undefined ? undefined : times[i + 1]! - start;
    const cue: StepCue = { enter: t, ringIn: t + CUE.ringDelay };
    if (i > 0) {
      const previous = times[i - 1]! - start;
      const from = Math.min(Math.max(previous + CUE.arrowAfterBox, t - CUE.arrowLead), t - CUE.arrowMin);
      cue.arrow = { start: from, duration: t - from };
    }
    if (next !== undefined) {
      cue.ringOut = next;
      cue.dim = next;
    }
    return cue;
  });
}

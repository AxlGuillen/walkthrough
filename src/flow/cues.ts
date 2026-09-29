import type { FlowEdge } from './graph.ts';

// When each part of a flow moves, in seconds on the flow's own clock. The arrow toward a
// step is drawn just before its word so the box lands on it; the step then stays active
// (ringed) until the next one takes over, and the finished ones step back.
export interface StepCue {
  enter: number;
  ringIn: number;
  ringOut?: number;
  dim?: number;
  // A cycle's first step lights up again when the loop comes back to it.
  again?: number;
}

export interface ArrowCue {
  start: number;
  duration: number;
}

export interface FlowCues {
  steps: StepCue[];
  arrows: ArrowCue[];
}

export const CUE = { arrowLead: 0.45, arrowMin: 0.15, arrowAfterBox: 0.2, ringDelay: 0.15, loopDraw: 0.6 };

export function flowCues(times: readonly number[], edges: readonly FlowEdge[], start = 0, loop?: number): FlowCues {
  const at = (i: number) => times[i]! - start;
  const steps = times.map((_, i): StepCue => {
    const cue: StepCue = { enter: at(i), ringIn: at(i) + CUE.ringDelay };
    if (i + 1 < times.length) {
      cue.ringOut = at(i + 1);
      cue.dim = at(i + 1);
    }
    return cue;
  });
  const arrows = edges.map(({ from, to, closing }): ArrowCue => {
    if (closing) {
      const begin = (loop ?? times.at(-1)! + CUE.loopDraw) - start;
      const back = begin + CUE.loopDraw;
      Object.assign(steps[to]!, { again: back });
      Object.assign(steps[from]!, { ringOut: back, dim: back });
      return { start: begin, duration: CUE.loopDraw };
    }
    const end = at(to);
    const begin = Math.min(Math.max(at(from) + CUE.arrowAfterBox, end - CUE.arrowLead), end - CUE.arrowMin);
    return { start: begin, duration: end - begin };
  });
  return { steps, arrows };
}

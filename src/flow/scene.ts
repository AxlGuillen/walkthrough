import type { Size } from '../timeline/camera.ts';
import type { TimedFlow, TimedOverlay } from '../timeline/build.ts';
import { flowCues, type FlowCues } from './cues.ts';
import { flowEdges } from './graph.ts';
import { layoutFlow, type FlowLayout } from './layout.ts';

export interface FlowScene {
  layout: FlowLayout;
  cues: FlowCues;
}

// Cues on the given clock: the overlay's own, which starts at zero, or the video's (start 0).
export function timedCues(flow: TimedFlow, start = 0): FlowCues {
  return flowCues(flow.steps.map(step => step.time), flowEdges(flow), start, flow.loop);
}

// What flow.html paints.
export function flowScene(flow: TimedFlow, start: number, canvas: Size): FlowScene {
  return { layout: layoutFlow(flow, canvas), cues: timedCues(flow, start) };
}

export function overlayParams(overlay: TimedOverlay, canvas: Size): Record<string, string> {
  if (!overlay.flow) return overlay.params;
  return { ...overlay.params, scene: JSON.stringify(flowScene(overlay.flow, overlay.start, canvas)) };
}

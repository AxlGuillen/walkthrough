import type { Size } from '../timeline/camera.ts';
import type { TimedFlow, TimedOverlay } from '../timeline/build.ts';
import { flowCues, type StepCue } from './cues.ts';
import { layoutFlow, type FlowLayout } from './layout.ts';

export interface FlowScene {
  layout: FlowLayout;
  cues: StepCue[];
}

// What flow.html paints, timed on the overlay's own clock, which starts at zero.
export function flowScene(flow: TimedFlow, start: number, canvas: Size): FlowScene {
  return { layout: layoutFlow(flow, canvas), cues: flowCues(flow.steps.map(step => step.time), start) };
}

export function overlayParams(overlay: TimedOverlay, canvas: Size): Record<string, string> {
  if (!overlay.flow) return overlay.params;
  return { ...overlay.params, scene: JSON.stringify(flowScene(overlay.flow, overlay.start, canvas)) };
}

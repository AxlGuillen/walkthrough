import type { Size } from '../timeline/camera.ts';
import type { TimedFlow, TimedOverlay } from '../timeline/build.ts';
import { flowCues, type FlowCues } from './cues.ts';
import { flowEdges } from './graph.ts';
import { layoutFlow, type FlowLayout } from './layout.ts';

export interface FlowScene {
  layout: FlowLayout;
  cues: FlowCues;
  // When each group (lane or side) appears: lanes together at the start, each side just
  // before its first step.
  groups: number[];
}

const GROUP_LEAD = 0.35;
const LANE_STAGGER = 0.08;

// Cues on the given clock: the overlay's own, which starts at zero, or the video's (start 0).
export function timedCues(flow: TimedFlow, start = 0): FlowCues {
  return flowCues(flow.steps.map(step => step.time), flowEdges(flow), start, flow.loop);
}

// What flow.html paints.
export function flowScene(flow: TimedFlow, start: number, canvas: Size): FlowScene {
  const layout = layoutFlow(flow, canvas);
  const cues = timedCues(flow, start);
  const groups = layout.groups.map((group, i) => {
    if (group.kind === 'lane') return 0.1 + i * LANE_STAGGER;
    const first = flow.steps.findIndex(step => step.branch === i);
    return Math.max(0.1, cues.steps[first]!.enter - GROUP_LEAD);
  });
  return { layout, cues, groups };
}

export function overlayParams(overlay: TimedOverlay, canvas: Size): Record<string, string> {
  if (!overlay.flow) return overlay.params;
  return { ...overlay.params, scene: JSON.stringify(flowScene(overlay.flow, overlay.start, canvas)) };
}

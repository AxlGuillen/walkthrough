import type { TimedFlow } from '../timeline/build.ts';

export interface FlowEdge {
  from: number;
  to: number;
  label?: string;
  // A cycle's arrow from the last step back to the first, drawn at the flow's loop time.
  closing?: boolean;
}

type Shape = Pick<TimedFlow, 'shape' | 'steps' | 'branches'>;

export function mainLength({ steps }: Pick<TimedFlow, 'steps'>): number {
  return steps.filter(step => step.branch === undefined).length;
}

// Which step each arrow leaves and reaches, by index into the steps in narration order.
export function flowEdges(flow: Shape): FlowEdge[] {
  const main = mainLength(flow);
  const edges: FlowEdge[] = [];
  for (let i = 1; i < main; i++) edges.push({ from: i - 1, to: i });
  if (flow.shape === 'decision') {
    for (const branch of [0, 1] as const) {
      const members = flow.steps.flatMap((step, i) => (step.branch === branch ? [i] : []));
      members.forEach((to, k) => {
        const label = k === 0 ? flow.branches?.[branch] : undefined;
        edges.push({ from: k === 0 ? main - 1 : members[k - 1]!, to, ...(label ? { label } : {}) });
      });
    }
  }
  if (flow.shape === 'compare') {
    for (const side of [0, 1] as const) {
      const members = flow.steps.flatMap((step, i) => (step.branch === side ? [i] : []));
      for (let k = 1; k < members.length; k++) edges.push({ from: members[k - 1]!, to: members[k]! });
    }
  }
  if (flow.shape === 'cycle') edges.push({ from: main - 1, to: 0, closing: true });
  return edges;
}

// The question is marked "?" instead of numbered; both branches go on from the same number,
// since either one is the next step. Each side of a comparison counts from one.
export function badgeTexts(flow: Shape): string[] {
  const main = mainLength(flow);
  const first = flow.shape === 'compare' ? 1 : main;
  const position: [number, number] = [0, 0];
  return flow.steps.map((step, i) => {
    if (step.branch !== undefined) return String(first + position[step.branch]++);
    if (flow.shape === 'decision' && i === main - 1) return '?';
    return String(i + 1);
  });
}

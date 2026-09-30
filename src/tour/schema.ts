import { z } from 'zod';
import { SOUNDS } from '../compose/sounds.ts';

const selector = z.string().trim().min(1);

// A number is seconds from the segment start; a string is a word or phrase in its narration.
export const anchor = z.union([z.number().nonnegative(), z.string().trim().min(1)]);
export type Anchor = z.infer<typeof anchor>;

// Shorthands spell out every optional key so both forms of an action share one type.
const timed = { at: anchor.optional() };

const goto = z.strictObject({
  goto: z.union([
    z.string().min(1).transform(url => ({ url, at: undefined })),
    z.strictObject({ url: z.string().min(1), ...timed }),
  ]),
}).transform(({ goto }) => ({ kind: 'goto' as const, ...goto }));

// `wait` holds the video until the next screen shows that selector, off the video clock,
// so a navigation never shows half-loaded states.
const click = z.strictObject({
  click: z.union([
    selector.transform(on => ({ on, wait: undefined, at: undefined })),
    z.strictObject({ on: selector, wait: selector.optional(), ...timed }),
  ]),
}).transform(({ click }) => ({ kind: 'click' as const, ...click }));

const hover = z.strictObject({
  hover: z.union([
    selector.transform(on => ({ on, at: undefined })),
    z.strictObject({ on: selector, ...timed }),
  ]),
}).transform(({ hover }) => ({ kind: 'hover' as const, ...hover }));

const type = z.strictObject({
  type: z.strictObject({ into: selector, text: z.string(), ...timed }),
}).transform(({ type }) => ({ kind: 'type' as const, ...type }));

const zoomTarget = z.union([z.literal('out'), selector]);
const zoom = z.strictObject({
  zoom: z.union([
    zoomTarget.transform(to => ({ to, padding: undefined, scale: undefined, follow: undefined, duration: undefined, at: undefined })),
    z.strictObject({
      to: zoomTarget,
      padding: z.number().nonnegative().optional(),
      scale: z.number().min(1).max(2).optional(),
      follow: z.boolean().optional(),
      duration: z.number().positive().optional(),
      ...timed,
    }),
  ]),
}).transform(({ zoom }) => ({ kind: 'zoom' as const, ...zoom }));

const highlight = z.strictObject({
  highlight: z.union([
    selector.transform(on => ({ on, duration: undefined, at: undefined })),
    z.strictObject({ on: selector, duration: z.number().positive().optional(), ...timed }),
  ]),
}).transform(({ highlight }) => ({ kind: 'highlight' as const, ...highlight }));

const label = z.strictObject({
  label: z.strictObject({
    on: selector,
    text: z.string().trim().min(1),
    side: z.enum(['top', 'bottom', 'left', 'right']).optional(),
    duration: z.number().positive().optional(),
    ...timed,
  }),
}).transform(({ label }) => ({ kind: 'label' as const, ...label }));

const scrollTarget = z.union([z.literal('top'), z.literal('bottom'), selector]);
const scroll = z.strictObject({
  scroll: z.union([
    scrollTarget.transform(to => ({ to, within: undefined, duration: undefined, at: undefined })),
    z.strictObject({ to: scrollTarget, within: selector.optional(), duration: z.number().positive().optional(), ...timed }),
  ]),
}).transform(({ scroll }) => ({ kind: 'scroll' as const, ...scroll }));

const wait = z.strictObject({
  wait: z.union([
    selector.transform(until => ({ until, at: undefined })),
    z.strictObject({ until: selector, ...timed }),
  ]),
}).transform(({ wait }) => ({ kind: 'wait' as const, ...wait }));

const action = z.union([goto, click, hover, type, zoom, highlight, label, scroll, wait]);
export type Action = z.infer<typeof action>;

// An HTML page laid over the video. params reach it as a query string, so one
// template (a lower third, a title card) serves many texts. beats name the moments its
// animation lands on, each on a word of the narration; data is structured input (a chart's
// series, a code block) that each resource validates for itself.
const overlay = z.strictObject({
  src: z.string().min(1),
  from: anchor.optional(),
  to: anchor.optional(),
  fade: z.number().nonnegative().default(0.3),
  params: z.record(z.string(), z.union([z.string(), z.number()]).transform(String)).default({}),
  beats: z.record(z.string().regex(/^[a-zA-Z][\w-]*$/, 'use letters, digits, - and _'), anchor).default({}),
  data: z.unknown().optional(),
});
export type Overlay = z.infer<typeof overlay>;

// Connected steps that appear as the narration names them. `at` is the word of each step;
// without it, steps are spread between their anchored neighbors.
const flowStep = z.union([
  z.string().trim().min(1).max(48).transform(text => ({ text, detail: undefined, lane: undefined, at: undefined })),
  z.strictObject({
    text: z.string().trim().min(1).max(48),
    detail: z.string().trim().min(1).max(72).optional(),
    lane: z.string().trim().min(1).optional(),
    at: anchor.optional(),
  }),
]);

export const FLOW_SHAPES = ['linear', 'decision', 'cycle', 'lanes', 'compare'] as const;

// A decision's last step is the question; each branch continues from it, and the narration
// walks the first branch and then the second.
const flowBranch = z.strictObject({
  label: z.string().trim().min(1).max(16),
  steps: z.array(flowStep).min(1).max(3),
});

// One side of a before/after comparison: the narration tells the whole "before", then the "after".
const flowSide = z.strictObject({
  label: z.string().trim().min(1).max(16),
  steps: z.array(flowStep).min(1).max(5),
});

const flow = z.strictObject({
  shape: z.enum(FLOW_SHAPES).default('linear'),
  title: z.string().trim().min(1).max(60).optional(),
  // full covers the app, as an interlude; card is a panel over the bottom of the app.
  mode: z.enum(['full', 'card']).default('full'),
  steps: z.array(flowStep).max(6).default([]),
  branches: z.tuple([flowBranch, flowBranch]).optional(),
  // Who does each step: every step of a lanes flow names one of these in `lane`.
  lanes: z.array(z.string().trim().min(1).max(20)).min(2).max(4).optional(),
  before: flowSide.optional(),
  after: flowSide.optional(),
  // A cycle's closing arrow, back to the first step: a word after the last step, or 0.6s after it.
  loop: anchor.optional(),
  from: anchor.optional(),
  to: anchor.optional(),
  fade: z.number().nonnegative().default(0.3),
}).superRefine((flow, ctx) => {
  const issue = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
  if (flow.shape === 'decision') {
    if (!flow.branches) issue('a decision needs two branches', 'branches');
    else if (flow.steps.length + Math.max(...flow.branches.map(b => b.steps.length)) > 6) {
      issue('a decision fits 6 boxes across: its steps plus its longest branch', 'branches');
    }
  } else if (flow.branches) {
    issue('only a decision has branches', 'branches');
  }
  if (flow.shape === 'lanes') {
    if (!flow.lanes) issue('a lanes flow needs its lanes', 'lanes');
    else if (flow.steps.some(step => !step.lane || !flow.lanes!.includes(step.lane))) issue(`every step needs a lane from: ${flow.lanes.join(', ')}`, 'steps');
    if (flow.steps.length < 2) issue('a lanes flow needs at least 2 steps', 'steps');
  } else if (flow.lanes || flow.steps.some(step => step.lane)) {
    issue('only a lanes flow has lanes', 'lanes');
  }
  if (flow.shape === 'compare') {
    if (!flow.before || !flow.after) issue('a comparison needs before and after', 'before');
    if (flow.steps.length) issue('a comparison has its steps in before and after', 'steps');
  } else {
    if (flow.before || flow.after) issue('only a comparison has before and after', 'before');
    if (flow.steps.length === 0) issue('a flow needs steps', 'steps');
  }
  if (flow.shape === 'linear' && flow.steps.length < 2) issue('a linear flow needs at least 2 steps', 'steps');
  if (flow.shape === 'cycle' && flow.steps.length < 3) issue('a cycle needs at least 3 steps', 'steps');
  if (flow.loop !== undefined && flow.shape !== 'cycle') issue('only a cycle has a loop', 'loop');
});
export type Flow = z.infer<typeof flow>;

const segment = z.strictObject({
  say: z.string().trim().min(1).optional(),
  hold: z.number().positive().optional(),
  do: z.array(action).default([]),
  overlays: z.array(overlay).default([]),
  flow: flow.optional(),
}).refine(s => s.say !== undefined || s.hold !== undefined, {
  message: 'a segment without "say" needs "hold"',
});
export type Segment = z.infer<typeof segment>;

export const tourSchema = z.strictObject({
  title: z.string().trim().min(1),
  url: z.url(),
  session: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes').optional(),
  device: z.enum(['desktop', 'mobile']).default('desktop'),
  language: z.enum(['es', 'en']).default('es'),
  voice: z.string().min(1).optional(),
  music: z.strictObject({
    track: z.string().min(1),
    volume: z.number().min(0).max(1).default(0.04),
  }).optional(),
  subtitles: z.enum(['karaoke', 'none']).default('none'),
  // The overlays' look: dark (the default) or light, always with the tour's accent.
  theme: z.enum(['dark', 'light']).default('dark'),
  // Gets the app past its own onboarding: storage is written before every page of the
  // tour's origin loads, and dismiss selectors are clicked after each navigation.
  setup: z.strictObject({
    storage: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).transform(String)).default({}),
    dismiss: z.array(selector).default([]),
  }).prefault({}),
  sfx: z.union([
    z.boolean().transform(enabled => ({ enabled, volume: 1, mute: [] as (typeof SOUNDS)[number][] })),
    z.strictObject({
      volume: z.number().min(0).max(2).default(1),
      mute: z.array(z.enum(SOUNDS)).default([]),
    }).transform(settings => ({ enabled: true, ...settings })),
  ]).prefault(true),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a #RRGGBB color').default('#FF3B5C'),
  segments: z.array(segment).min(1),
});
export type Tour = z.infer<typeof tourSchema>;

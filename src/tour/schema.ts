import { z } from 'zod';
import { SOUNDS } from '../compose/sounds.ts';

const selector = z.string().trim().min(1);

// A number is seconds from the segment start; a string is a word or phrase in its narration.
const anchor = z.union([z.number().nonnegative(), z.string().trim().min(1)]);
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
// template (a lower third, a title card) serves many texts.
const overlay = z.strictObject({
  src: z.string().min(1),
  from: anchor.optional(),
  to: anchor.optional(),
  fade: z.number().nonnegative().default(0.3),
  params: z.record(z.string(), z.union([z.string(), z.number()]).transform(String)).default({}),
});
export type Overlay = z.infer<typeof overlay>;

const segment = z.strictObject({
  say: z.string().trim().min(1).optional(),
  hold: z.number().positive().optional(),
  do: z.array(action).default([]),
  overlays: z.array(overlay).default([]),
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
    volume: z.number().min(0).max(1).default(0.055),
  }).optional(),
  subtitles: z.enum(['karaoke', 'none']).default('none'),
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

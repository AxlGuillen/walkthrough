import { z } from 'zod';

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

const click = z.strictObject({
  click: z.union([
    selector.transform(on => ({ on, at: undefined })),
    z.strictObject({ on: selector, ...timed }),
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
    zoomTarget.transform(to => ({ to, padding: undefined, duration: undefined, at: undefined })),
    z.strictObject({
      to: zoomTarget,
      padding: z.number().nonnegative().optional(),
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

const action = z.union([goto, click, hover, type, zoom, highlight]);
export type Action = z.infer<typeof action>;

const overlay = z.strictObject({
  src: z.string().min(1),
  from: anchor.optional(),
  to: anchor.optional(),
  fade: z.number().nonnegative().default(0.3),
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
    volume: z.number().min(0).max(1).default(0.15),
  }).optional(),
  subtitles: z.enum(['karaoke', 'none']).default('karaoke'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a #RRGGBB color').default('#FF3B5C'),
  segments: z.array(segment).min(1),
});
export type Tour = z.infer<typeof tourSchema>;

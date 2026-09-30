import { z } from 'zod';
import { anchor } from '../tour/schema.ts';

// A series label sits under its bar or point; a caption (donut, stat) is a phrase.
const label = z.string().trim().min(1).max(24);
const caption = z.string().trim().min(1).max(60);
// A point of a series; `at` is the word it appears on, lifted into the overlay's beats.
const point = z.strictObject({ label, value: z.number(), at: anchor.optional() });

const style = {
  title: z.string().trim().min(1).max(60).optional(),
  prefix: z.string().max(4).optional(),
  unit: z.string().max(12).optional(),
  decimals: z.number().int().min(0).max(3).optional(),
  // full covers the app, as an interlude; card is a panel over the app.
  mode: z.enum(['full', 'card']).default('full'),
};

export const chartSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bar'), ...style, series: z.array(point).min(1).max(12), highlight: label.optional() }),
  z.strictObject({ type: z.literal('line'), ...style, series: z.array(point).min(2).max(24) }),
  // A share of a whole: value out of total (100 by default).
  z.strictObject({ type: z.literal('donut'), ...style, label: caption, value: z.number().nonnegative(), total: z.number().positive().default(100), at: anchor.optional() }),
  // One big number that counts up from `from`.
  z.strictObject({ type: z.literal('stat'), ...style, label: caption, value: z.number(), from: z.number().default(0), at: anchor.optional() }),
  // Before and after: two values and the change between them.
  z.strictObject({ type: z.literal('compare'), ...style, before: point, after: point }),
]).superRefine((chart, ctx) => {
  if (chart.type === 'donut' && chart.value > chart.total) ctx.addIssue({ code: 'custom', message: 'value is more than total', path: ['value'] });
  if (chart.type === 'bar' && chart.highlight && !chart.series.some(p => p.label === chart.highlight)) {
    ctx.addIssue({ code: 'custom', message: `highlight "${chart.highlight}" is not a label of the series`, path: ['highlight'] });
  }
});

export type Chart = z.infer<typeof chartSchema>;
export type ChartPoint = z.infer<typeof point>;

import { z } from 'zod';
import { emojiName } from '../emoji/emoji.ts';
import { anchor } from '../tour/schema.ts';

// A cell: yes and no draw a ✓ or a ✕, partial a half mark, anything else is shown as text.
const cell = z.union([z.boolean(), z.number(), z.string().trim().min(1).max(28)])
  .transform(v => (v === true || v === 'yes' ? 'yes' : v === false || v === 'no' ? 'no' : v === 'partial' ? 'partial' : String(v)));

export const tableSchema = z.strictObject({
  title: z.string().trim().min(1).max(60).optional(),
  columns: z.array(z.string().trim().min(1).max(20)).min(1).max(6),
  // The column to stand out (the product, the plan, "now"), in the accent.
  highlight: z.string().trim().min(1).optional(),
  rows: z.array(z.strictObject({
    label: z.string().trim().min(1).max(40),
    values: z.array(cell).min(1).max(6),
    emoji: emojiName.optional(),
    at: anchor.optional(),
  })).min(1).max(8),
  mode: z.enum(['full', 'card']).default('full'),
}).superRefine((table, ctx) => {
  table.rows.forEach((row, i) => {
    if (row.values.length !== table.columns.length) {
      ctx.addIssue({ code: 'custom', message: `row "${row.label}" has ${row.values.length} values for ${table.columns.length} columns`, path: ['rows', i, 'values'] });
    }
  });
  if (table.highlight && !table.columns.includes(table.highlight)) {
    ctx.addIssue({ code: 'custom', message: `highlight "${table.highlight}" is not one of the columns`, path: ['highlight'] });
  }
});

export type Table = z.infer<typeof tableSchema>;

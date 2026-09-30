import { z } from 'zod';
import { anchor } from '../tour/schema.ts';

// "3", "3-5" or "3-5, 8": line numbers as the viewer sees them, counting from 1.
const lines = z.union([z.number().int().positive(), z.string().trim().regex(/^\d+(-\d+)?(\s*,\s*\d+(-\d+)?)*$/, 'use 3, "3-5" or "3-5, 8"')]);

export const codeSchema = z.strictObject({
  // editor: a file with line numbers; terminal: "$ " lines are typed commands, the rest their
  // output; diff: lines start with "+", "-" or a space.
  view: z.enum(['editor', 'terminal', 'diff']).default('editor'),
  language: z.string().trim().min(1).optional(),
  file: z.string().trim().min(1).max(60).optional(),
  title: z.string().trim().min(1).max(60).optional(),
  code: z.string().min(1).max(4000),
  // How an editor or a diff appears: line by line, typed out, or all at once.
  reveal: z.enum(['lines', 'type', 'all']).default('lines'),
  // Lines to point at, each on a word of the narration, with an optional note beside them.
  highlight: z.array(z.strictObject({ lines, at: anchor.optional(), note: z.string().trim().min(1).max(40).optional() })).max(8).default([]),
  // A terminal's commands start typing on these words, in order.
  run: z.array(anchor).max(8).default([]),
  mode: z.enum(['full', 'card']).default('full'),
});

export type Code = z.infer<typeof codeSchema>;

// 1-based line list from "3-5, 8", for the lines a highlight covers.
export function parseLines(spec: number | string): number[] {
  if (typeof spec === 'number') return [spec];
  return spec.split(',').flatMap(part => {
    const [from, to] = part.trim().split('-').map(Number) as [number, number | undefined];
    return Array.from({ length: (to ?? from) - from + 1 }, (_, i) => from + i);
  });
}

import { z } from 'zod';
import { anchor } from '../tour/schema.ts';

export const BOARD_STYLES = ['chalk', 'white'] as const;

// A to-do list on a board: each item is written on its word and crossed out on `done`.
export const boardSchema = z.strictObject({
  title: z.string().trim().min(1).max(40).optional(),
  // chalk: a green slate written in chalk; white: a whiteboard written in marker.
  style: z.enum(BOARD_STYLES).default('chalk'),
  items: z.array(z.strictObject({
    text: z.string().trim().min(1).max(48),
    at: anchor.optional(),
    done: anchor.optional(),
  })).min(1).max(7),
});

export type Board = z.infer<typeof boardSchema>;

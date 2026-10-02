import { z } from 'zod';
import { emojiName } from '../emoji/emoji.ts';
import { anchor } from '../tour/schema.ts';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'white'] as const;

// Notes pinned to a corkboard, each landing on its word.
export const corkboardSchema = z.strictObject({
  title: z.string().trim().min(1).max(40).optional(),
  notes: z.array(z.strictObject({
    text: z.string().trim().min(1).max(60),
    detail: z.string().trim().min(1).max(60).optional(),
    color: z.enum(NOTE_COLORS).optional(),
    emoji: emojiName.optional(),
    at: anchor.optional(),
  })).min(1).max(6),
});

export type Corkboard = z.infer<typeof corkboardSchema>;

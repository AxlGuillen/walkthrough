import { z } from 'zod';
import { emojiName } from '../emoji/emoji.ts';
import { anchor } from '../tour/schema.ts';

// Text beside the screen while a room shot sets it aside. *Words between asterisks* in the
// title are set in italics, in the accent.
export const asideSchema = z.strictObject({
  layout: z.enum(['aside-left', 'aside-right', 'inset']).default('aside-left'),
  eyebrow: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(90),
  points: z.array(z.strictObject({
    text: z.string().trim().min(1).max(60),
    emoji: emojiName.optional(),
    at: anchor.optional(),
  })).max(4).default([]),
});

export type Aside = z.infer<typeof asideSchema>;

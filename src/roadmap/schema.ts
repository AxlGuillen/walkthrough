import { z } from 'zod';
import { emojiName } from '../emoji/emoji.ts';
import { anchor } from '../tour/schema.ts';

export const MILESTONE_STATUSES = ['done', 'now', 'next'] as const;

export const roadmapSchema = z.strictObject({
  title: z.string().trim().min(1).max(60).optional(),
  milestones: z.array(z.strictObject({
    date: z.string().trim().min(1).max(16).optional(),
    title: z.string().trim().min(1).max(32),
    detail: z.string().trim().min(1).max(70).optional(),
    emoji: emojiName.optional(),
    status: z.enum(MILESTONE_STATUSES).default('done'),
    at: anchor.optional(),
  })).min(2).max(7),
  mode: z.enum(['full', 'card']).default('full'),
});

export type Roadmap = z.infer<typeof roadmapSchema>;

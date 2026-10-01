import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const EMOJI_DIR = path.resolve(import.meta.dirname, '../../templates/overlays/vendor/fluent-emoji');

export interface EmojiEntry {
  glyph: string;
  name: string;
  keywords: string[];
}

export const EMOJIS: Record<string, EmojiEntry> = JSON.parse(readFileSync(path.join(EMOJI_DIR, 'index.json'), 'utf8'));

// The emojis whose name or keywords share a word with what was asked, for an error message.
export function suggestEmojis(asked: string, limit = 5): string[] {
  const words = asked.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const score = (slug: string) => {
    const entry = EMOJIS[slug]!;
    const haystack = [slug, entry.name, ...entry.keywords].join(' ').toLowerCase();
    return words.filter(word => haystack.includes(word)).length;
  };
  return Object.keys(EMOJIS).map(slug => [slug, score(slug)] as const).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([slug]) => slug);
}

export function emojiProblem(name: string): string | null {
  if (EMOJIS[name]) return null;
  const close = suggestEmojis(name);
  return `emoji "${name}" is not in the set${close.length ? `; close: ${close.join(', ')}` : ''} (all in templates/overlays/vendor/fluent-emoji/index.json)`;
}

// An emoji by its file name in the vendored set: rocket, check-mark-button, party-popper…
export const emojiName = z.string().trim().superRefine((name, ctx) => {
  const problem = emojiProblem(name);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

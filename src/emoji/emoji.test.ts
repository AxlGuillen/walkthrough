import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMOJI_DIR, EMOJIS, emojiName, emojiProblem, suggestEmojis } from './emoji.ts';

describe('the emoji set', () => {
  it('has both files of every emoji it lists', () => {
    expect(Object.keys(EMOJIS).length).toBeGreaterThan(60);
    for (const slug of Object.keys(EMOJIS)) {
      expect(existsSync(path.join(EMOJI_DIR, `${slug}.svg`)), slug).toBe(true);
      expect(existsSync(path.join(EMOJI_DIR, `${slug}.3d.png`)), slug).toBe(true);
    }
    expect(EMOJIS.rocket!.glyph).toBe('🚀');
  });

  it('accepts names in the set and suggests close ones for the rest', () => {
    expect(emojiName.safeParse('party-popper').success).toBe(true);
    expect(emojiProblem('rocket')).toBeNull();
    expect(emojiProblem('rocketship')).toMatch(/not in the set/);
    expect(suggestEmojis('chart')).toEqual(expect.arrayContaining(['bar-chart', 'chart-increasing']));
    expect(emojiProblem('party')).toMatch(/close: .*party-popper/);
  });
});

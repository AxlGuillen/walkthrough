import type { Word } from '../voice/types.ts';

export function normalizeWord(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function findPhrase(words: readonly Word[], phrase: string): { start: number; end: number } | undefined {
  const wanted = phrase.split(/\s+/).map(normalizeWord).filter(Boolean);
  const spoken = words
    .map(word => ({ word, key: normalizeWord(word.text) }))
    .filter(({ key }) => key !== '');
  if (wanted.length === 0) return undefined;

  for (let i = 0; i + wanted.length <= spoken.length; i++) {
    if (wanted.every((key, j) => spoken[i + j]!.key === key)) {
      return { start: spoken[i]!.word.start, end: spoken[i + wanted.length - 1]!.word.end };
    }
  }
  return undefined;
}

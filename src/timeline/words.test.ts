import { describe, expect, it } from 'vitest';
import { findPhrase, normalizeWord } from './words.ts';

const words = [
  { text: 'Aquí', start: 0, end: 0.3 },
  { text: 'está', start: 0.3, end: 0.6 },
  { text: 'la', start: 0.6, end: 0.7 },
  { text: 'tarjeta,', start: 0.7, end: 1.2 },
  { text: '—', start: 1.2, end: 1.2 },
  { text: 'con', start: 1.3, end: 1.5 },
  { text: 'su', start: 1.5, end: 1.6 },
  { text: 'estimado.', start: 1.6, end: 2.2 },
];

describe('normalizeWord', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeWord('¿Está?')).toBe('esta');
    expect(normalizeWord('Tarjeta,')).toBe('tarjeta');
    expect(normalizeWord('UWS-142')).toBe('uws142');
  });
});

describe('findPhrase', () => {
  it('finds a single word regardless of accents and punctuation', () => {
    expect(findPhrase(words, 'aqui')).toEqual({ start: 0, end: 0.3 });
    expect(findPhrase(words, 'Tarjeta')).toEqual({ start: 0.7, end: 1.2 });
  });

  it('matches phrases across punctuation-only tokens', () => {
    expect(findPhrase(words, 'tarjeta con su')).toEqual({ start: 0.7, end: 1.6 });
  });

  it('returns the first occurrence', () => {
    const repeated = [...words, { text: 'tarjeta', start: 3, end: 3.4 }];
    expect(findPhrase(repeated, 'tarjeta')?.start).toBe(0.7);
  });

  it('returns undefined when the phrase is missing or empty', () => {
    expect(findPhrase(words, 'ticket')).toBeUndefined();
    expect(findPhrase(words, 'la estimado')).toBeUndefined();
    expect(findPhrase(words, ' ¿? ')).toBeUndefined();
  });
});

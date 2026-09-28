import { describe, expect, it } from 'vitest';
import { assColor, assTime, groupWords, karaokeAss } from './subtitles.ts';

const w = (text: string, start: number, end: number) => ({ text, start, end });

describe('groupWords', () => {
  it('fills lines up to three words', () => {
    const words = [w('a', 0, 0.2), w('b', 0.2, 0.4), w('c', 0.4, 0.6), w('d', 0.6, 0.8)];
    expect(groupWords(words).map(line => line.map(word => word.text))).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('starts a new line after a pause', () => {
    const words = [w('a', 0, 0.2), w('b', 1, 1.2)];
    expect(groupWords(words)).toHaveLength(2);
  });
});

describe('karaokeAss', () => {
  const ass = karaokeAss([w('Hola', 1, 1.4), w('mundo', 1.5, 2)], { width: 1920, height: 1080 }, '#FF3B5C');

  it('declares the output size so libass does not rescale', () => {
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');
  });

  it('paints spoken words in the accent over white', () => {
    expect(ass).toMatch(/Style: K,Arial,\d+,&H005C3BFF,&H00FFFFFF,/);
  });

  it('holds each word until the next one starts', () => {
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.00,K,,0,0,0,,{\\k50}Hola {\\k50}mundo');
  });

  it('sits higher and larger on vertical video', () => {
    const vertical = karaokeAss([w('a', 0, 1)], { width: 1080, height: 1920 }, '#FFFFFF');
    const [, horizontalSize, horizontalMargin] = ass.match(/Style: K,Arial,(\d+),.*,(\d+),1$/m)!;
    const [, verticalSize, verticalMargin] = vertical.match(/Style: K,Arial,(\d+),.*,(\d+),1$/m)!;
    expect(Number(verticalMargin) / 1920).toBeGreaterThan(Number(horizontalMargin) / 1080);
    expect(Number(verticalSize) / 1080).toBeGreaterThan(Number(horizontalSize) / 1920);
  });

  it('strips ASS control characters from words', () => {
    expect(karaokeAss([w('{\\b1}x', 0, 1)], { width: 100, height: 100 }, '#000000')).toContain('}b1x');
  });
});

describe('ass helpers', () => {
  it('converts #RRGGBB to ASS &H00BBGGRR', () => {
    expect(assColor('#12AB9f')).toBe('&H009FAB12');
  });

  it('formats centisecond timestamps', () => {
    expect(assTime(3725.456)).toBe('1:02:05.46');
  });
});

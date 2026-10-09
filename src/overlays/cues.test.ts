import { describe, expect, it } from 'vitest';
import { validCues } from './cues.ts';

describe('validCues', () => {
  it('keeps the cues a page reported with a known sound and a real time', () => {
    expect(validCues([{ at: 1.2, sound: 'pop' }, { at: 0, sound: 'draw' }])).toEqual([{ at: 1.2, sound: 'pop' }, { at: 0, sound: 'draw' }]);
  });

  it('drops what the mix could not place', () => {
    expect(validCues([{ at: -1, sound: 'pop' }, { at: 1, sound: 'boom' }, { at: Number.NaN, sound: 'pop' }, null, 'x'])).toEqual([]);
    expect(validCues(undefined)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { onAccent } from './color.ts';

describe('onAccent', () => {
  it('puts dark text on light accents and white text on deep ones', () => {
    expect(onAccent('#D9F24A')).toBe('#111111');
    expect(onAccent('#FFD60A')).toBe('#111111');
    expect(onAccent('#E63946')).toBe('#ffffff');
    expect(onAccent('#7C5CFF')).toBe('#ffffff');
    expect(onAccent('#00FFFF')).toBe('#111111');
    expect(onAccent('#FF3B5C')).toBe('#ffffff');
  });

  it('falls back to white for anything that is not a six-digit hex color', () => {
    expect(onAccent('red')).toBe('#ffffff');
  });
});

import { describe, expect, it } from 'vitest';
import { renderScene } from './svg.ts';

describe('renderScene', () => {
  it('renders nothing for an empty scene', () => {
    expect(renderScene({ cursor: null, strokes: [] }, '#FF3B5C')).toBe('');
  });

  it('reveals each stroke through its dash offset in the accent color', () => {
    const markup = renderScene({ cursor: null, strokes: [{ d: 'M0 0 L10 10', progress: 0.25, opacity: 0.5 }] }, '#00FFFF');
    expect(markup).toContain('stroke="#00FFFF"');
    expect(markup).toContain('pathLength="1"');
    expect(markup).toContain('stroke-dashoffset="0.75"');
    expect(markup).toContain('opacity="0.5"');
  });

  it('puts the cursor tip on its position', () => {
    const markup = renderScene({ cursor: { at: { x: 12.5, y: 40 }, opacity: 1, scale: 0.85 }, strokes: [] }, '#000000');
    expect(markup).toContain('translate(12.5 40) scale(0.85)');
  });
});

import { describe, expect, it } from 'vitest';
import { parsePairs, probeOverlay, ProbeError } from './probe.ts';

describe('parsePairs', () => {
  it('reads name=value pairs, keeping = inside values', () => {
    expect(parsePairs('title=Hola, url=a=b')).toEqual({ title: 'Hola', url: 'a=b' });
    expect(parsePairs(undefined)).toEqual({});
    expect(() => parsePairs('oops')).toThrow(ProbeError);
  });
});

describe('probeOverlay', () => {
  it('shows one overlay from zero with its beats in seconds, its params and its data', () => {
    expect(probeOverlay({ src: 'title-card.html', duration: 4, beats: 'title=0.4,line=1.2', params: 'title=Sunset', data: { a: 1 } })).toEqual({
      src: 'title-card.html', params: { title: 'Sunset' }, start: 0, end: 4, fade: 0, segment: 0, beats: { title: 0.4, line: 1.2 }, data: { a: 1 },
    });
  });

  it('rejects beats that are not seconds inside the overlay', () => {
    expect(() => probeOverlay({ src: 'a.html', duration: 3, beats: 'x=soon' })).toThrow(/within the 3s/);
    expect(() => probeOverlay({ src: 'a.html', duration: 3, beats: 'x=3' })).toThrow(ProbeError);
    expect(() => probeOverlay({ src: 'a.html', duration: 0 })).toThrow(/positive/);
  });
});

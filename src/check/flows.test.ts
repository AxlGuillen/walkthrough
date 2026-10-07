import { describe, expect, it } from 'vitest';
import type { Timeline, TimedOverlay } from '../timeline/build.ts';
import { checkFlows } from './check.ts';

const canvas = { width: 1920, height: 1080 };
const asideFlow = (firstStep: number): Timeline => ({
  duration: 10, segments: [], actions: [], shots: [], words: [],
  overlays: [{
    src: 'flow.html', params: {}, start: 2, end: 9, fade: 0.3, segment: 0, beats: {},
    flow: { shape: 'linear', mode: 'aside', layout: 'aside-left', steps: [{ text: 'Pick a day', time: 2 + firstStep }, { text: 'Set the party', time: 2 + firstStep + 1.2 }] },
  } satisfies TimedOverlay],
});

describe('checkFlows', () => {
  it('warns when an aside flow\'s first step lands while the screen is still moving aside', () => {
    expect(checkFlows(asideFlow(0.4), canvas)[0]!.notes.join()).toMatch(/still moving aside/);
    expect(checkFlows(asideFlow(1.5), canvas)[0]!.status).toBe('ok');
  });
});

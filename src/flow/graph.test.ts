import { describe, expect, it } from 'vitest';
import { badgeTexts, flowEdges } from './graph.ts';

const step = (text: string, branch?: 0 | 1) => ({ text, time: 0, ...(branch === undefined ? {} : { branch }) });

describe('flow graph', () => {
  const decision = {
    shape: 'decision' as const,
    steps: [step('Request'), step('Tables left?'), step('Confirm', 0), step('Deposit', 0), step('Waitlist', 1)],
    branches: ['Yes', 'No'] as [string, string],
  };

  it('chains a line and closes a cycle back to its first step', () => {
    expect(flowEdges({ shape: 'linear', steps: [step('a'), step('b'), step('c')] })).toEqual([{ from: 0, to: 1 }, { from: 1, to: 2 }]);
    expect(flowEdges({ shape: 'cycle', steps: [step('a'), step('b'), step('c')] }).at(-1)).toEqual({ from: 2, to: 0, closing: true });
  });

  it('forks both branches from the question, labelling only their first arrow', () => {
    expect(flowEdges(decision)).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2, label: 'Yes' },
      { from: 2, to: 3 },
      { from: 1, to: 4, label: 'No' },
    ]);
  });

  it('chains each side of a comparison apart, without crossing between them', () => {
    const comparison = { shape: 'compare' as const, steps: [step('a', 0), step('b', 0), step('c', 1), step('d', 1)] };
    expect(flowEdges(comparison)).toEqual([{ from: 0, to: 1 }, { from: 2, to: 3 }]);
    expect(badgeTexts(comparison)).toEqual(['1', '2', '1', '2']);
  });

  it('marks the question and numbers both branches from the same next number', () => {
    expect(badgeTexts(decision)).toEqual(['1', '?', '2', '3', '2']);
    expect(badgeTexts({ shape: 'cycle', steps: [step('a'), step('b'), step('c')] })).toEqual(['1', '2', '3']);
  });
});

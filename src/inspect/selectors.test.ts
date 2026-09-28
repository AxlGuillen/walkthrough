import { describe, expect, it } from 'vitest';
import { dataDependent, looksGenerated, selectorFor, similarity, suggest } from './selectors.ts';
import type { ElementInfo } from './snapshot.ts';

const el = (overrides: Partial<ElementInfo>): ElementInfo => ({
  tag: 'div', role: null, text: '', dataTour: null, testId: null, ariaLabel: null, id: null,
  href: null, name: null, placeholder: null, classes: [], visible: true, ...overrides,
});

describe('selectorFor', () => {
  it('prefers anchors the app placed on purpose', () => {
    expect(selectorFor(el({ dataTour: 'board', id: 'main', text: 'Board' }))).toBe('[data-tour=board]');
    expect(selectorFor(el({ testId: 'save button' }))).toBe('[data-testid="save button"]');
  });

  it('uses internal links, labels, stable ids, form hints and short text in that order', () => {
    expect(selectorFor(el({ tag: 'a', href: '/workload', text: 'Workload' }))).toBe('a[href="/workload"]');
    expect(selectorFor(el({ tag: 'button', ariaLabel: 'Close' }))).toBe('button[aria-label="Close"]');
    expect(selectorFor(el({ id: 'filters' }))).toBe('#filters');
    expect(selectorFor(el({ tag: 'input', placeholder: 'Nombre' }))).toBe('input[placeholder="Nombre"]');
    expect(selectorFor(el({ tag: 'button', text: 'Copy report' }))).toBe('button:has-text("Copy report")');
    expect(selectorFor(el({ role: 'tab', text: 'Board' }))).toBe('[role=tab]:has-text("Board")');
  });

  it('skips long labels, generated ids and long texts', () => {
    expect(selectorFor(el({ tag: 'div', ariaLabel: 'Tareas por hacer: 2, Ongoing: 3, QA: 4, Waiting on Status Update: 6' }))).toBeNull();
    expect(selectorFor(el({ id: 'radix-:r3:', text: 'x'.repeat(60) }))).toBeNull();
  });
});

describe('looksGenerated', () => {
  it('spots framework-generated ids', () => {
    expect(['radix-12', ':r1:', 'mui-42', 'a1b2c3d4e5', 'item-2024', 'base-ui-_R_uo1t5fivb_'].map(looksGenerated)).toEqual([true, true, true, true, true, true]);
    expect(['filters', 'main-nav', 'tickets'].map(looksGenerated)).toEqual([false, false, false]);
  });
});

describe('dataDependent', () => {
  it('flags ticket keys and long numbers but not stable anchors or routes', () => {
    expect(dataDependent('[data-tour=card]:has-text("UWS-8324")')).toBe(true);
    expect(dataDependent('text="95 of 95 tickets"')).toBe(false);
    expect(dataDependent('text=Total 14250')).toBe(true);
    expect(dataDependent('a[href="/tickets/10191"]')).toBe(false);
    expect(dataDependent('[data-tour=board]')).toBe(false);
  });
});

describe('suggest', () => {
  const page = [
    el({ dataTour: 'panel', text: 'Resumen' }),
    el({ tag: 'button', text: 'Guardar cambios' }),
    el({ tag: 'a', href: '/reports', text: 'Reports' }),
  ];

  it('finds the anchor a typo meant', () => {
    expect(suggest('[data-tour=pannel]', page)[0]?.selector).toBe('[data-tour=panel]');
  });

  it('matches by visible text regardless of accents and case', () => {
    expect(suggest('button:has-text("guardar")', page)[0]?.selector).toBe('button:has-text("Guardar cambios")');
    expect(suggest('text="Réports"', page)[0]?.selector).toBe('a[href="/reports"]');
  });

  it('returns nothing when nothing is close', () => {
    expect(suggest('[data-tour=zzz]', page)).toEqual([]);
  });

  it('scores identical words as a full match', () => {
    expect(similarity('board', 'board')).toBe(1);
    expect(similarity('board', 'boards')).toBeCloseTo(5 / 6);
  });
});

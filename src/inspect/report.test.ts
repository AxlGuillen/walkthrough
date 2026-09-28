import { describe, expect, it } from 'vitest';
import { anchorsOf, inspectReport, routesToVisit } from './report.ts';
import type { ElementInfo, PageSnapshot } from './snapshot.ts';

const el = (overrides: Partial<ElementInfo>): ElementInfo => ({
  tag: 'div', role: null, text: '', dataTour: null, testId: null, ariaLabel: null, id: null,
  href: null, name: null, placeholder: null, classes: [], visible: true, ...overrides,
});

const snapshot = (overrides: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: 'https://app.test/tickets', title: 'Tickets', headings: [], elements: [], links: [],
  dialogs: [], scrollers: [], storageKeys: [], ...overrides,
});

describe('routesToVisit', () => {
  it('follows navigation links only, once each, up to the limit', () => {
    const links = [
      { href: '/tickets', text: 'Tickets', inNav: true },
      { href: '/workload', text: 'Workload', inNav: true },
      { href: '/tickets/42', text: 'A ticket', inNav: false },
      { href: '/workload', text: 'Workload', inNav: true },
      { href: '/tickets?range=7d', text: 'Last 7 days', inNav: true },
    ];
    expect(routesToVisit('/tickets', snapshot({ links }), 10)).toEqual(['/tickets', '/workload']);
    expect(routesToVisit('/tickets', snapshot({ links }), 1)).toEqual(['/tickets']);
  });
});

describe('anchorsOf', () => {
  it('lists visible elements once with their count, app anchors first', () => {
    const anchors = anchorsOf([
      el({ tag: 'button', text: 'Edit' }),
      el({ tag: 'button', text: 'Edit' }),
      el({ dataTour: 'board' }),
      el({ dataTour: 'hidden', visible: false }),
    ]);
    expect(anchors.map(a => [a.selector, a.count])).toEqual([['[data-tour=board]', 1], ['button:has-text("Edit")', 2]]);
  });
});

describe('anchorsOf with per-row controls', () => {
  it('collapses a family of data-bearing labels into one prefix selector', () => {
    const rows = ['A', 'B', 'C'].map(title => el({ tag: 'button', ariaLabel: `Edit ${title}` }));
    const anchors = anchorsOf([...rows, el({ tag: 'button', ariaLabel: 'Close' })]);
    expect(anchors.map(a => [a.selector, a.count])).toEqual([['button[aria-label^="Edit "]', 3], ['button[aria-label="Close"]', 1]]);
  });

  it('keeps small groups as they are', () => {
    const anchors = anchorsOf([el({ tag: 'button', ariaLabel: 'Edit A' }), el({ tag: 'button', ariaLabel: 'Edit B' })]);
    expect(anchors.map(a => a.selector)).toEqual(['button[aria-label="Edit A"]', 'button[aria-label="Edit B"]']);
  });
});

describe('inspectReport', () => {
  const report = inspectReport('https://app.test/tickets', [{
    route: '/tickets',
    screenshot: '01.png',
    snapshot: snapshot({
      headings: [{ level: 1, text: 'Tickets' }],
      elements: [el({ dataTour: 'views', text: 'List | Board' })],
      links: [{ href: '/workload', text: 'Workload', inNav: true }],
      dialogs: ['Everyone’s board'],
      scrollers: [{ element: el({ dataTour: 'board' }), axis: 'x' }],
      storageKeys: ['uws_tour_seen:tickets', 'theme'],
    }),
  }], new Date('2026-09-28T12:00:00Z'));

  it('gives navigation, anchors, dialogs, scroll areas and onboarding hints per page', () => {
    expect(report).toContain('- `a[href="/workload"]` — Workload');
    expect(report).toContain('![/tickets](01.png)');
    expect(report).toContain('| `[data-tour=views]` | div | List \\| Board |');
    expect(report).toContain('⚠ **Diálogo abierto** (¿onboarding?): «Everyone’s board»');
    expect(report).toContain('- horizontal: `[data-tour=board]`');
    expect(report).toContain('`uws_tour_seen:tickets`');
    expect(report).not.toContain('`theme`');
  });
});

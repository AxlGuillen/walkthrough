import { describe, expect, it } from 'vitest';
import { formatReport, looksLikeLogin, selectorOf, worst } from './report.ts';

describe('worst', () => {
  it('lets one failure or warning set the result', () => {
    expect(worst(['ok', 'warn', 'fail'])).toBe('fail');
    expect(worst(['ok', 'warn'])).toBe('warn');
    expect(worst(['ok'])).toBe('ok');
  });
});

describe('selectorOf', () => {
  it('finds the selector of every selector-bound action and none for the rest', () => {
    expect(selectorOf({ kind: 'click', on: '.a' })).toBe('.a');
    expect(selectorOf({ kind: 'type', into: '#name', text: 'x' })).toBe('#name');
    expect(selectorOf({ kind: 'zoom', to: '.card' })).toBe('.card');
    expect(selectorOf({ kind: 'zoom', to: 'out' })).toBeNull();
    expect(selectorOf({ kind: 'goto', url: '/' })).toBeNull();
    expect(selectorOf({ kind: 'scroll', to: '[data-tour=board]' })).toBe('[data-tour=board]');
    expect(selectorOf({ kind: 'scroll', to: 'bottom' })).toBeNull();
    expect(selectorOf({ kind: 'wait', until: '.ready' })).toBe('.ready');
  });
});

describe('looksLikeLogin', () => {
  const at = (path: string) => new URL(path, 'https://app.test');

  it('treats a password field or a login route as an expired session', () => {
    expect(looksLikeLogin(at('/tickets'), at('/tickets'), true)).toBe(true);
    expect(looksLikeLogin(at('/tickets'), at('/login'), false)).toBe(true);
    expect(looksLikeLogin(at('/tickets'), at('/auth/sign-in'), false)).toBe(true);
  });

  it('does not confuse other redirects or the login page itself', () => {
    expect(looksLikeLogin(at('/'), at('/dashboard'), false)).toBe(false);
    expect(looksLikeLogin(at('/login'), at('/login'), false)).toBe(false);
  });
});

describe('formatReport', () => {
  it('lists each action with its notes and ends with a summary', () => {
    const text = formatReport([
      { time: 0, label: 'goto /', status: 'ok', notes: [] },
      { time: 12.5, label: 'click .x', status: 'fail', notes: ['not found on this screen'] },
    ]);
    expect(text).toContain('✓   0.00s  goto /');
    expect(text).toContain('✗  12.50s  click .x');
    expect(text).toContain('            not found on this screen');
    expect(text.split('\n').at(-1)).toBe('1 ok · 0 warnings · 1 failures');
  });
});

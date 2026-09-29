import { describe, expect, it } from 'vitest';
import { looksLikeLogin } from './session.ts';

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

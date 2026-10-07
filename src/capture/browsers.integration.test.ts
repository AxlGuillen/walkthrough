import { describe, expect, it } from 'vitest';
import { headlessBrowsers } from './browsers.ts';

describe('headlessBrowsers', () => {
  it('gives work running at once a browser each and reuses them afterwards', async () => {
    const browsers = headlessBrowsers();
    try {
      const [a, b] = await Promise.all([browsers.use(async browser => browser), browsers.use(async browser => browser)]);
      expect(a).not.toBe(b);
      const reused = await browsers.use(async browser => browser);
      expect([a, b]).toContain(reused);
    } finally {
      await browsers.close();
    }
  }, 60_000);
});

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openContext } from './session.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('openContext', () => {
  it('gives the page the tour language, whatever the system speaks', async () => {
    const context = await openContext(ROOT, { headless: true, locale: 'en-US' });
    try {
      const page = await context.newPage();
      const seen = await page.evaluate(() => [navigator.language, new Date(2026, 9, 5).toLocaleDateString(undefined, { month: 'long' })]);
      expect(seen).toEqual(['en-US', 'October']);
    } finally {
      await context.close();
    }
  }, 60_000);
});

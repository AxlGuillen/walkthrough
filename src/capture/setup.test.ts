import { describe, expect, it } from 'vitest';
import { parseTour } from '../tour/load.ts';
import { storagePlan } from './setup.ts';

describe('storagePlan', () => {
  it("writes the tour's storage on its own site and each origin's on that site", () => {
    const tour = parseTour(`title: Two sites
url: https://studio.test/
setup:
  storage: { account: acc-1 }
  origins:
    https://portal.test: { view: calendar, seen: true }
segments:
  - hold: 1
`);
    expect(storagePlan(tour)).toEqual([
      { protocol: 'https:', host: 'studio.test', entries: [['account', 'acc-1']] },
      { protocol: 'https:', host: 'portal.test', entries: [['view', 'calendar'], ['seen', 'true']] },
    ]);
  });

  it('writes nothing for a tour without storage', () => {
    expect(storagePlan(parseTour('title: x\nurl: https://a.test/\nsegments:\n  - hold: 1\n'))).toEqual([]);
  });
});

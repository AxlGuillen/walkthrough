import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkTour } from '../check/check.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { captureTour } from './capture.ts';
import { SessionExpiredError } from './setup.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const url = pathToFileURL(path.join(ROOT, 'tests/fixtures/setup/index.html')).href;
const tourWith = (setup: string) => parseTour(`title: Setup\nurl: ${url}\n${setup}segments:\n  - hold: 0.5\n    do:\n      - goto: index.html\n`);
const dialogNotes = async (setup: string) => {
  const tour = tourWith(setup);
  const [item] = await checkTour(ROOT, tour, buildTimeline(tour, []));
  return item!.notes.filter(note => note.startsWith('dialog open'));
};

describe('tour setup', () => {
  it('shows the onboarding and the banner when nothing is set up', async () => {
    expect(await dialogNotes('')).toHaveLength(1);
  }, 60_000);

  it('skips the onboarding through storage and closes the banner through dismiss', async () => {
    expect(await dialogNotes('setup:\n  storage: { demo_seen: 1 }\n  dismiss: ["#dismiss-banner"]\n')).toEqual([]);
  }, 60_000);
});

describe('expired sessions', () => {
  it('stop a render with the command that fixes them', async () => {
    const login = pathToFileURL(path.join(ROOT, 'tests/fixtures/check/index.html')).href;
    const tour = parseTour(`title: Login\nurl: ${login}\nsegments:\n  - hold: 1\n    do:\n      - goto: private.html\n`);
    const capture = captureTour({ root: ROOT, tour, timeline: buildTimeline(tour, []), file: path.join(ROOT, 'out-never.mp4'), fps: 5 });
    await expect(capture).rejects.toThrow(SessionExpiredError);
    await expect(capture).rejects.toThrow(/sign in again with: walkthrough login/);
  }, 60_000);
});

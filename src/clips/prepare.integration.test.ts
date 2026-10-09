import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkClips } from '../check/check.ts';
import { publishVideo } from '../library/library.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { ClipMissingError } from './plan.ts';
import { prepareClips } from './prepare.ts';

let root: string;
let storage: { work: string; videos: string };
let tourDir: string;
const frames = (file: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'framemd5', '-']).toString()
  .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)!.trim());

const tour = parseTour(`
title: Global
url: https://example.com
clips:
  booking: { tour: phone-booking.yaml, from: 3 }
  itinerary: { tour: phone-itinerary.yaml, from: 1.2, hold: 4.96 }
segments:
  - hold: 8
    overlays:
      - { src: overlays/phone.html, from: 2, params: { clip: "clip:booking", clip2: "clip:itinerary" } }
`);

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'clips-'));
  storage = { work: path.join(root, 'work'), videos: path.join(root, 'videos') };
  tourDir = path.join(root, 'tours', 'gpm');
  await mkdir(tourDir, { recursive: true });
  for (const name of ['phone-booking', 'phone-itinerary']) await writeFile(path.join(tourDir, `${name}.yaml`), 'title: Phone\n');
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

async function renderSource(name: string, at: Date): Promise<string> {
  const source = path.join(root, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=8', '-f', 'lavfi', '-i', 'sine=d=8',
    '-pix_fmt', 'yuv420p', '-shortest', source]);
  return (await publishVideo(source, path.join(storage.videos, 'gpm', name), { title: name, project: 'gpm', tour: name, device: 'mobile', duration: 8 }, at)).file;
}

describe('clips', () => {
  it('stops with the command to run when the source tour has no render on this machine', async () => {
    const timeline = buildTimeline(tour, []);
    const [booking] = await checkClips(tour, timeline, tourDir, root, storage);
    expect(booking).toMatchObject({ time: 2, status: 'fail', notes: [expect.stringContaining('run: walkthrough render tours/gpm/phone-booking.yaml')] });
    await expect(prepareClips(tour, tourDir, root, storage, path.join(root, 'out'))).rejects.toThrow(ClipMissingError);
  });

  it('cuts the same frames as the commands the GPM clips were made with by hand', async () => {
    const later = new Date(Date.now() + 60_000);
    const booking = await renderSource('phone-booking', later);
    const itinerary = await renderSource('phone-itinerary', later);
    const out = path.join(root, 'out');
    const files = await prepareClips(tour, tourDir, root, storage, out);

    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '3', '-i', booking, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-an', path.join(root, 'hand-booking.mp4')]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', itinerary, '-vf', 'trim=start=1.2,setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=4.96',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-an', path.join(root, 'hand-itinerary.mp4')]);

    expect(frames(files.booking!)).toEqual(frames(path.join(root, 'hand-booking.mp4')));
    expect(frames(files.itinerary!)).toEqual(frames(path.join(root, 'hand-itinerary.mp4')));
  }, 120_000);

  it('warns when the source tour changed after its last render', async () => {
    await utimes(path.join(tourDir, 'phone-booking.yaml'), new Date(), new Date(Date.now() + 3_600_000));
    const warnings: string[] = [];
    await prepareClips(tour, tourDir, root, storage, path.join(root, 'out'), message => warnings.push(message));
    expect(warnings).toEqual([expect.stringContaining('clip "booking" comes from a render older than tours/gpm/phone-booking.yaml')]);
    const items = await checkClips(tour, buildTimeline(tour, []), tourDir, root, storage);
    expect(items.map(item => item.status)).toEqual(['warn', 'ok']);
  }, 120_000);
});

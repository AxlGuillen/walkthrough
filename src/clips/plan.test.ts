import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { VideoEntry } from '../library/library.ts';
import type { TimedOverlay } from '../timeline/build.ts';
import { ClipMissingError, clipFile, commandPath, isStale, newestRender, trimArgs, withClips } from './plan.ts';

const render = (createdAt: string): VideoEntry => ({
  title: 'Phone', project: 'gpm', tour: 'phone-booking', device: 'mobile', duration: 10, bytes: 1, createdAt, file: `/v/${createdAt}.mp4`,
});

describe('newestRender', () => {
  it('picks the most recent render, and nothing when there is none', () => {
    expect(newestRender([render('2026-10-06T10:00:00.000Z'), render('2026-10-07T09:00:00.000Z'), render('2026-10-05T23:00:00.000Z')])!.createdAt)
      .toBe('2026-10-07T09:00:00.000Z');
    expect(newestRender([])).toBeUndefined();
  });
});

describe('isStale', () => {
  it('flags a render made before its tour last changed', () => {
    expect(isStale(render('2026-10-07T09:00:00.000Z'), new Date('2026-10-07T10:00:00.000Z'))).toBe(true);
    expect(isStale(render('2026-10-07T09:00:00.000Z'), new Date('2026-10-07T08:00:00.000Z'))).toBe(false);
  });
});

describe('trimArgs', () => {
  it('starts on a frame-exact cut, holds the first frame if asked, and drops the sound', () => {
    expect(trimArgs('in.mp4', { from: 3, hold: 0 }, 'out.mp4').join(' '))
      .toBe('-y -v error -i in.mp4 -vf trim=start=3,setpts=PTS-STARTPTS -an -c:v libx264 -pix_fmt yuv420p -crf 16 out.mp4');
    expect(trimArgs('in.mp4', { from: 1.2, hold: 4.96 }, 'out.mp4')).toContain('trim=start=1.2,setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=4.96');
  });
});

describe('withClips', () => {
  const overlay = (params: Record<string, string>): TimedOverlay => ({ src: 'overlays/phone.html', params, start: 0, end: 5, fade: 0, segment: 0, beats: {} });

  it('gives each clip:<name> param the address of the clip cut on this machine, and leaves the rest', () => {
    const file = clipFile(path.resolve('/w/gpm/global'), 'booking');
    const [result] = withClips([overlay({ clip: 'clip:booking', title: 'Desktop. And the phone.' })], { booking: file });
    expect(result!.params).toEqual({ clip: pathToFileURL(file).href, title: 'Desktop. And the phone.' });
  });

  it('refuses a clip that was not prepared', () => {
    expect(() => withClips([overlay({ clip: 'clip:hero' })], {})).toThrow(ClipMissingError);
  });
});

describe('commandPath', () => {
  it('names a tour with forward slashes, relative to the repo', () => {
    expect(commandPath(path.resolve('/repo'), path.resolve('/repo/tours/gpm/phone-booking.yaml'))).toBe('tours/gpm/phone-booking.yaml');
  });
});

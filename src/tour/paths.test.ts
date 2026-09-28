import { describe, expect, it } from 'vitest';
import { defaultStorage, tourPaths, voiceCacheDir } from './paths.ts';

describe('defaultStorage', () => {
  it('keeps work in the user cache and videos in Movies, outside the repo', () => {
    expect(defaultStorage({}, '/Users/me')).toEqual({
      work: '/Users/me/Library/Caches/walkthrough',
      videos: '/Users/me/Movies/walkthrough',
    });
  });

  it('can be moved with environment variables', () => {
    expect(defaultStorage({ WALKTHROUGH_WORK: '/tmp/w', WALKTHROUGH_VIDEOS: '/tmp/v' }, '/Users/me'))
      .toEqual({ work: '/tmp/w', videos: '/tmp/v' });
  });
});

describe('tourPaths', () => {
  it('mirrors tours/<project>/<name>.yaml in both places', () => {
    expect(tourPaths('tours/uws-tasks/board.yaml', '/repo', { work: '/w', videos: '/v' })).toEqual({
      project: 'uws-tasks',
      name: 'board',
      file: '/repo/tours/uws-tasks/board.yaml',
      dir: '/repo/tours/uws-tasks',
      workDir: '/w/tours/uws-tasks/board',
      videoDir: '/v/uws-tasks/board',
    });
    expect(voiceCacheDir({ work: '/w', videos: '/v' })).toBe('/w/voice');
  });
});

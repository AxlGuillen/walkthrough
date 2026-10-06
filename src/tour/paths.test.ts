import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultStorage, tourPaths, voiceCacheDir } from './paths.ts';

describe('defaultStorage', () => {
  it('keeps work in the system cache and videos with the user videos, outside the repo', () => {
    expect(defaultStorage({}, '/Users/me', 'darwin')).toEqual({
      work: '/Users/me/Library/Caches/walkthrough',
      videos: '/Users/me/Movies/walkthrough',
    });
    expect(defaultStorage({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me', 'win32')).toEqual({
      work: 'C:\\Users\\me\\AppData\\Local\\walkthrough',
      videos: 'C:\\Users\\me\\Videos\\walkthrough',
    });
    expect(defaultStorage({}, '/home/me', 'linux')).toEqual({
      work: '/home/me/.cache/walkthrough',
      videos: '/home/me/Videos/walkthrough',
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
      file: path.resolve('/repo/tours/uws-tasks/board.yaml'),
      dir: path.resolve('/repo/tours/uws-tasks'),
      workDir: path.join('/w/tours/uws-tasks/board'),
      videoDir: path.join('/v/uws-tasks/board'),
    });
    expect(voiceCacheDir({ work: '/w', videos: '/v' })).toBe(path.join('/w/voice'));
  });
});

import { describe, expect, it } from 'vitest';
import { tourPaths } from './paths.ts';

describe('tourPaths', () => {
  it('mirrors tours/<project>/<name>.yaml under out/', () => {
    expect(tourPaths('tours/uws-tasks/board.yaml', '/repo')).toEqual({
      project: 'uws-tasks',
      name: 'board',
      dir: '/repo/tours/uws-tasks',
      outDir: '/repo/out/uws-tasks/board',
    });
  });
});

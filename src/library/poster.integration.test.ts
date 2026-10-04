import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensurePoster, posterFile } from './poster.ts';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'poster-'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=10:d=2', '-pix_fmt', 'yuv420p', path.join(dir, 'a.mp4')]);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('posters', () => {
  it('keeps videos and previews apart under the work folder', () => {
    expect(posterFile('/w', { file: 'uws/tablero/a.mp4' })).toBe(path.join('/w/posters/videos/uws/tablero/a.jpg'));
    expect(posterFile('/w', { preview: 'uws/tablero' })).toBe(path.join('/w/posters/previews/uws/tablero.jpg'));
  });

  it('cuts a still once, and again only when the video is newer', async () => {
    const video = path.join(dir, 'a.mp4');
    const poster = path.join(dir, 'posters', 'a.jpg');
    await ensurePoster(video, poster, 1);
    const first = (await stat(poster)).mtimeMs;
    expect((await stat(poster)).size).toBeGreaterThan(500);

    await ensurePoster(video, poster, 1);
    expect((await stat(poster)).mtimeMs).toBe(first);

    const later = new Date(first + 60_000);
    await utimes(video, later, later);
    await ensurePoster(video, poster, 1);
    expect((await stat(poster)).mtimeMs).toBeGreaterThan(first);
  }, 30_000);
});

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clean } from './clean.ts';
import { listVideos, moveToTrash, olderThanKept, publishVideo, stamp, type VideoEntry } from './library.ts';

let dir: string;
let storage: { work: string; videos: string };
let trash: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'library-'));
  storage = { work: path.join(dir, 'work'), videos: path.join(dir, 'videos') };
  trash = path.join(dir, 'trash');
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const meta = { title: 'Tour', project: 'uws-tasks', tour: 'tablero', device: 'desktop' as const, duration: 64.7 };

async function source(name = 'video.mp4', bytes = 10) {
  const file = path.join(dir, name);
  await writeFile(file, Buffer.alloc(bytes));
  return file;
}

describe('stamp', () => {
  it('sorts chronologically as text', () => {
    expect(stamp(new Date(2026, 8, 28, 9, 5, 7))).toBe('2026-09-28_090507');
  });
});

describe('publishVideo and listVideos', () => {
  it('keeps each render as its own dated file with metadata beside it', async () => {
    const videoDir = path.join(storage.videos, 'uws-tasks', 'tablero');
    await publishVideo(await source(), videoDir, meta, new Date(2026, 8, 28, 10, 0, 0));
    await publishVideo(await source('b.mp4', 20), videoDir, meta, new Date(2026, 8, 28, 11, 0, 0));

    const videos = await listVideos(storage.videos);
    expect(videos.map(v => path.basename(v.file))).toEqual(['2026-09-28_110000.mp4', '2026-09-28_100000.mp4']);
    expect(videos[0]).toMatchObject({ ...meta, bytes: 20 });
  });

  it('ignores metadata whose video is gone and folders that do not exist', async () => {
    await mkdir(storage.videos, { recursive: true });
    await writeFile(path.join(storage.videos, 'orphan.json'), '{}');
    expect(await listVideos(storage.videos)).toEqual([]);
    expect(await listVideos(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('olderThanKept', () => {
  const entry = (tour: string, createdAt: string) => ({ ...meta, tour, createdAt, file: `${tour}-${createdAt}`, bytes: 1 }) as VideoEntry;

  it('keeps the newest renders of each tour independently', () => {
    const entries = [entry('a', '1'), entry('a', '3'), entry('a', '2'), entry('b', '1')];
    expect(olderThanKept(entries, 2).map(e => e.file)).toEqual(['a-1']);
    expect(olderThanKept(entries, 0)).toHaveLength(4);
  });
});

describe('moveToTrash', () => {
  it('never overwrites something already in the Trash', async () => {
    await moveToTrash(await source('same.mp4'), trash);
    await moveToTrash(await source('same.mp4'), trash);
    expect((await readdir(trash)).sort()).toEqual(['same 2.mp4', 'same.mp4']);
  });
});

describe('clean', () => {
  it('deletes working files, keeps the voice cache unless asked and trashes old videos', async () => {
    await mkdir(path.join(storage.work, 'tours', 'p', 't'), { recursive: true });
    await writeFile(path.join(storage.work, 'tours', 'p', 't', 'capture.mp4'), Buffer.alloc(100));
    await mkdir(path.join(storage.work, 'voice'), { recursive: true });
    await writeFile(path.join(storage.work, 'voice', 'x.wav'), Buffer.alloc(50));
    const videoDir = path.join(storage.videos, 'uws-tasks', 'tablero');
    for (const hour of [9, 10, 11]) await publishVideo(await source(), videoDir, meta, new Date(2026, 8, 28, hour));

    const report = await clean(storage, { keepVideos: 1, trash });

    expect(existsSync(path.join(storage.work, 'tours'))).toBe(false);
    expect(existsSync(path.join(storage.work, 'voice', 'x.wav'))).toBe(true);
    expect((await listVideos(storage.videos)).map(v => path.basename(v.file))).toEqual(['2026-09-28_110000.mp4']);
    expect(report.freed).toBe(100 + 10 * 2);
    expect(report.trashed).toHaveLength(2);
    expect(await readdir(trash)).toHaveLength(4);
  });

  it('removes the voice cache and moves a legacy folder to the Trash when asked', async () => {
    await mkdir(path.join(storage.work, 'voice'), { recursive: true });
    const legacy = path.join(dir, 'out');
    await mkdir(legacy);
    await writeFile(path.join(legacy, 'old.mp4'), Buffer.alloc(5));

    const report = await clean(storage, { voice: true, legacy, trash });

    expect(existsSync(path.join(storage.work, 'voice'))).toBe(false);
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(path.join(trash, 'out', 'old.mp4'))).toBe(true);
    expect(report.freed).toBe(5);
  });
});

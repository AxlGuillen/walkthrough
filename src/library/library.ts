import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface VideoMeta {
  title: string;
  project: string;
  tour: string;
  device: 'desktop' | 'mobile';
  duration: number;
  bytes: number;
  createdAt: string;
}

export interface VideoEntry extends VideoMeta {
  file: string;
}

export function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Every render is kept as its own file, named by when it was made, with its metadata beside it.
export async function publishVideo(
  source: string, videoDir: string, meta: Omit<VideoMeta, 'bytes' | 'createdAt'>, now = new Date(),
): Promise<VideoEntry> {
  await mkdir(videoDir, { recursive: true });
  const file = path.join(videoDir, `${stamp(now)}.mp4`);
  await copyFile(source, file);
  const entry: VideoEntry = { ...meta, file, bytes: (await stat(file)).size, createdAt: now.toISOString() };
  const { file: _, ...stored } = entry;
  await writeFile(file.replace(/\.mp4$/, '.json'), JSON.stringify(stored, null, 2));
  return entry;
}

export function previewMetaFile(video: string): string {
  return video.replace(/\.mp4$/, '.json');
}

// Previews live in the working cache, one per tour, replaced by each preview render.
export async function listPreviews(workRoot: string): Promise<(VideoEntry & { key: string })[]> {
  const toursDir = path.join(workRoot, 'tours');
  if (!existsSync(toursDir)) return [];
  const previews: (VideoEntry & { key: string })[] = [];
  for (const project of await readdir(toursDir)) {
    if (!existsSync(path.join(toursDir, project)) || !(await stat(path.join(toursDir, project))).isDirectory()) continue;
    for (const tour of await readdir(path.join(toursDir, project))) {
      const file = path.join(toursDir, project, tour, 'preview', 'video.mp4');
      const sidecar = previewMetaFile(file);
      if (!existsSync(file) || !existsSync(sidecar)) continue;
      const meta = JSON.parse(await readFile(sidecar, 'utf8')) as Omit<VideoMeta, 'bytes'>;
      previews.push({ ...meta, file, bytes: (await stat(file)).size, key: `${project}/${tour}` });
    }
  }
  return previews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listVideos(videosRoot: string): Promise<VideoEntry[]> {
  if (!existsSync(videosRoot)) return [];
  const entries: VideoEntry[] = [];
  for (const sidecar of await findFiles(videosRoot, '.json')) {
    const file = sidecar.replace(/\.json$/, '.mp4');
    if (!existsSync(file)) continue;
    const meta = JSON.parse(await readFile(sidecar, 'utf8')) as VideoMeta;
    entries.push({ ...meta, file });
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Keeps the newest `keep` renders of each tour and returns the rest.
export function olderThanKept(entries: readonly VideoEntry[], keep: number): VideoEntry[] {
  const seen = new Map<string, number>();
  return [...entries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(entry => {
      const key = `${entry.project}/${entry.tour}`;
      const rank = (seen.get(key) ?? 0) + 1;
      seen.set(key, rank);
      return rank > keep;
    });
}

// Videos go to the macOS Trash, never straight to deletion, so a slip can be undone.
export async function moveToTrash(file: string, trash = path.join(os.homedir(), '.Trash')): Promise<string> {
  await mkdir(trash, { recursive: true });
  const { name, ext } = path.parse(file);
  let target = path.join(trash, `${name}${ext}`);
  for (let n = 2; existsSync(target); n++) target = path.join(trash, `${name} ${n}${ext}`);
  try {
    await rename(file, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    const { cp, rm } = await import('node:fs/promises');
    await cp(file, target, { recursive: true });
    await rm(file, { recursive: true, force: true });
  }
  return target;
}

export async function trashVideo(entry: Pick<VideoEntry, 'file'>, trash?: string): Promise<void> {
  const sidecar = entry.file.replace(/\.mp4$/, '.json');
  await moveToTrash(entry.file, trash);
  if (existsSync(sidecar)) await moveToTrash(sidecar, trash);
}

export async function sizeOf(target: string): Promise<number> {
  if (!existsSync(target)) return 0;
  const info = await stat(target);
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const child of await readdir(target)) total += await sizeOf(path.join(target, child));
  return total;
}

async function findFiles(dir: string, extension: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await findFiles(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

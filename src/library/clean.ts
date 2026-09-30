import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { voiceCacheDir, type Storage } from '../tour/paths.ts';
import { listVideos, moveToTrash, olderThanKept, sizeOf, trashVideo } from './library.ts';

export interface CleanOptions {
  voice?: boolean;
  keepVideos?: number;
  legacy?: string;
  trash?: string;
}

export interface CleanReport {
  freed: number;
  deleted: string[];
  trashed: string[];
}

// Working files, gallery stills and the voice cache are regenerable, so they are deleted outright.
// Anything a person might want back (videos, the old in-repo out/) goes to the Trash.
export async function clean(storage: Storage, { voice = false, keepVideos, legacy, trash }: CleanOptions = {}): Promise<CleanReport> {
  const report: CleanReport = { freed: 0, deleted: [], trashed: [] };

  const disposable = [path.join(storage.work, 'tours'), path.join(storage.work, 'posters'), ...(voice ? [voiceCacheDir(storage)] : [])];
  for (const dir of disposable.filter(existsSync)) {
    report.freed += await sizeOf(dir);
    await rm(dir, { recursive: true, force: true });
    report.deleted.push(dir);
  }

  if (legacy && existsSync(legacy)) {
    report.freed += await sizeOf(legacy);
    report.trashed.push(await moveToTrash(legacy, trash));
  }

  if (keepVideos !== undefined) {
    for (const entry of olderThanKept(await listVideos(storage.videos), keepVideos)) {
      report.freed += entry.bytes;
      await trashVideo(entry, trash);
      report.trashed.push(entry.file);
    }
  }
  return report;
}

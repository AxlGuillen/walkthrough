import { execFile } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { listVideos, type VideoEntry } from '../library/library.ts';
import { tourPaths, type Storage } from '../tour/paths.ts';
import type { Clip, Tour } from '../tour/schema.ts';
import { ClipMissingError, clipFile, commandPath, isStale, newestRender, trimArgs } from './plan.ts';

const run = promisify(execFile);

export interface ClipSource {
  name: string;
  clip: Clip;
  // The source tour as a command names it: tours/<project>/<name>.yaml.
  tourFile: string;
  render: VideoEntry | undefined;
  stale: boolean;
}

// Where each clip comes from on this machine: the newest final render of its tour.
export async function clipSources(tour: Pick<Tour, 'clips'>, tourDir: string, root: string, storage: Storage): Promise<ClipSource[]> {
  return Promise.all(Object.entries(tour.clips).map(async ([name, clip]) => {
    const paths = tourPaths(path.resolve(tourDir, clip.tour), root, storage);
    const render = newestRender(await listVideos(paths.videoDir));
    const changed = await stat(paths.file).then(info => info.mtime, () => undefined);
    return { name, clip, tourFile: commandPath(root, paths.file), render, stale: Boolean(render && changed && isStale(render, changed)) };
  }));
}

export function missingMessage({ name, tourFile }: ClipSource): string {
  return `clip "${name}" needs a render of ${tourFile} on this machine; run: walkthrough render ${tourFile}`;
}

export function staleMessage({ name, tourFile }: ClipSource): string {
  return `clip "${name}" comes from a render older than ${tourFile}; render it again if the clip should change`;
}

// Cuts every clip from its source render into outDir/clips; returns their files by name.
export async function prepareClips(
  tour: Pick<Tour, 'clips'>, tourDir: string, root: string, storage: Storage, outDir: string,
  warn: (message: string) => void = console.warn,
): Promise<Record<string, string>> {
  const sources = await clipSources(tour, tourDir, root, storage);
  const missing = sources.find(source => !source.render);
  if (missing) throw new ClipMissingError(missingMessage(missing));
  if (sources.length) await mkdir(path.join(outDir, 'clips'), { recursive: true });
  const files: Record<string, string> = {};
  for (const source of sources) {
    if (source.stale) warn(`  ⚠ ${staleMessage(source)}`);
    const file = clipFile(outDir, source.name);
    await run('ffmpeg', trimArgs(source.render!.file, source.clip, file));
    files[source.name] = file;
  }
  return files;
}

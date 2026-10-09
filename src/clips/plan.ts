import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { VideoEntry } from '../library/library.ts';
import type { TimedOverlay } from '../timeline/build.ts';
import { clipName, type Clip } from '../tour/schema.ts';

export class ClipMissingError extends Error {
  override name = 'ClipMissingError';
}

export function newestRender(videos: readonly VideoEntry[]): VideoEntry | undefined {
  return [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

// A render made before its tour last changed may no longer match it.
export function isStale(render: Pick<VideoEntry, 'createdAt'>, tourChanged: Date): boolean {
  return tourChanged.getTime() > Date.parse(render.createdAt);
}

export function clipFile(outDir: string, name: string): string {
  return path.join(outDir, 'clips', `${name}.mp4`);
}

// The same cut the GPM clips were made with by hand: a frame-accurate start, then the first
// frame held still, without sound.
export function trimArgs(source: string, { from, hold }: Pick<Clip, 'from' | 'hold'>, file: string): string[] {
  const filters = [`trim=start=${from}`, 'setpts=PTS-STARTPTS', ...(hold ? [`tpad=start_mode=clone:start_duration=${hold}`] : [])];
  return ['-y', '-v', 'error', '-i', source, '-vf', filters.join(','), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', file];
}

// Overlays receive each clip:<name> param as the address of the clip cut on this machine.
export function withClips(overlays: readonly TimedOverlay[], files: Readonly<Record<string, string>>): TimedOverlay[] {
  return overlays.map(overlay => ({
    ...overlay,
    params: Object.fromEntries(Object.entries(overlay.params).map(([key, value]) => {
      const name = clipName(value);
      if (name === undefined) return [key, value];
      const file = files[name];
      if (!file) throw new ClipMissingError(`clip "${name}" was not prepared`);
      return [key, pathToFileURL(file).href];
    })),
  }));
}

// How a tour file is named in a command to run from the repo, on any system.
export function commandPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

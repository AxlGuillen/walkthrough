import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Stills for the gallery cards, cut once per video and kept with the other disposable work
// files. Browsers paint a paused video's frame unreliably, so the page never relies on it.
export function posterFile(workRoot: string, source: { file: string } | { preview: string }): string {
  return 'file' in source
    ? path.join(workRoot, 'posters', 'videos', source.file.replace(/\.mp4$/, '.jpg'))
    : path.join(workRoot, 'posters', 'previews', `${source.preview}.jpg`);
}

// A preview is rendered again in place, so a still older than its video is cut again.
export async function ensurePoster(video: string, poster: string, at: number): Promise<void> {
  if (existsSync(poster) && (await stat(poster)).mtimeMs >= (await stat(video)).mtimeMs) return;
  await mkdir(path.dirname(poster), { recursive: true });
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '4', poster]);
}

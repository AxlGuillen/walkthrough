import os from 'node:os';
import path from 'node:path';

export interface Storage {
  work: string;
  videos: string;
}

// Nothing generated lives in the repo: working files are a disposable cache and finished
// videos are the user's, next to their other movies.
export function defaultStorage(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): Storage {
  return {
    work: env.WALKTHROUGH_WORK ?? path.join(home, 'Library', 'Caches', 'walkthrough'),
    videos: env.WALKTHROUGH_VIDEOS ?? path.join(home, 'Movies', 'walkthrough'),
  };
}

export interface TourPaths {
  project: string;
  name: string;
  file: string;
  dir: string;
  workDir: string;
  videoDir: string;
}

// Tours live at tours/<project>/<name>.yaml; their output mirrors that layout.
export function tourPaths(tourFile: string, root: string, storage: Storage): TourPaths {
  const file = path.resolve(root, tourFile);
  const dir = path.dirname(file);
  const project = path.basename(dir);
  const name = path.basename(file, path.extname(file));
  return {
    project, name, file, dir,
    workDir: path.join(storage.work, 'tours', project, name),
    videoDir: path.join(storage.videos, project, name),
  };
}

export function voiceCacheDir(storage: Storage): string {
  return path.join(storage.work, 'voice');
}

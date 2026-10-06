import os from 'node:os';
import path from 'node:path';

export interface Storage {
  work: string;
  videos: string;
}

// Nothing generated lives in the repo: working files go to the system's cache folder and
// finished videos are the user's, next to their other videos.
export function defaultStorage(env: NodeJS.ProcessEnv = process.env, home = os.homedir(), platform = process.platform): Storage {
  const fallback = platformStorage(env, home, platform);
  return {
    work: env.WALKTHROUGH_WORK ?? fallback.work,
    videos: env.WALKTHROUGH_VIDEOS ?? fallback.videos,
  };
}

function platformStorage(env: NodeJS.ProcessEnv, home: string, platform: NodeJS.Platform): Storage {
  if (platform === 'darwin') {
    return { work: path.posix.join(home, 'Library', 'Caches', 'walkthrough'), videos: path.posix.join(home, 'Movies', 'walkthrough') };
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local');
    return { work: path.win32.join(local, 'walkthrough'), videos: path.win32.join(home, 'Videos', 'walkthrough') };
  }
  const cache = env.XDG_CACHE_HOME ?? path.posix.join(home, '.cache');
  return { work: path.posix.join(cache, 'walkthrough'), videos: path.posix.join(home, 'Videos', 'walkthrough') };
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

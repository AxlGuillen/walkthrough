import path from 'node:path';

export interface TourPaths {
  project: string;
  name: string;
  dir: string;
  outDir: string;
}

// Tours live at tours/<project>/<name>.yaml; their output mirrors that under out/.
export function tourPaths(tourFile: string, root: string): TourPaths {
  const file = path.resolve(root, tourFile);
  const dir = path.dirname(file);
  const project = path.basename(dir);
  const name = path.basename(file, path.extname(file));
  return { project, name, dir, outDir: path.join(root, 'out', project, name) };
}

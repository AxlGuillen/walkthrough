import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PageFont {
  family: string;
  data: string;
}

export const MARKER_FAMILY = 'Permanent Marker';
const MARKER_FILE = path.resolve(import.meta.dirname, '../../templates/overlays/vendor/fonts/PermanentMarker-Regular.ttf');

// Labels are drawn inside the recorded app, which cannot load files from the repo.
export async function markerFont(): Promise<PageFont> {
  return { family: MARKER_FAMILY, data: (await readFile(MARKER_FILE)).toString('base64') };
}

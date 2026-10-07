import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTimeline } from '../../timeline/build.ts';
import { parseTour, resolveFiles } from '../../tour/load.ts';
import { tourPaths, voiceCacheDir } from '../../tour/paths.ts';
import { withCache } from '../../voice/cache.ts';
import { createFishProvider } from '../../voice/fish/provider.ts';
import { synthesizeTour } from '../../voice/stage.ts';
import { ROOT, STORAGE } from '../context.ts';

export async function voice(tourFile: string) {
  const paths = tourPaths(tourFile, ROOT, STORAGE);
  const tour = resolveFiles(parseTour(await readFile(paths.file, 'utf8')), paths.dir);

  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new Error('FISH_API_KEY is missing from .env');
  const provider = withCache(createFishProvider({ apiKey }), voiceCacheDir(STORAGE));

  await mkdir(paths.workDir, { recursive: true });
  const speech = await synthesizeTour(tour, provider, paths.workDir);
  const timeline = buildTimeline(tour, speech);
  await writeFile(path.join(paths.workDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

  for (const segment of timeline.segments) {
    const words = speech[segment.index]?.words.length ?? 0;
    console.log(`  ${segment.index + 1}. ${segment.start.toFixed(2)}s → ${segment.end.toFixed(2)}s  (${words} words)`);
  }
  console.log(`${paths.project}/${paths.name}: ${timeline.duration.toFixed(2)}s`);
  return { tour, paths, timeline };
}

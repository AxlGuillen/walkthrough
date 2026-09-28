import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { tourPaths } from '../tour/paths.ts';
import { withCache } from '../voice/cache.ts';
import { createFishProvider } from '../voice/fish/provider.ts';
import { synthesizeTour } from '../voice/stage.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const USAGE = `usage:
  walkthrough voice <tour.yaml>   synthesize narration and write the timeline`;

async function voice(tourFile: string): Promise<void> {
  const paths = tourPaths(tourFile, ROOT);
  const tour = parseTour(await readFile(path.resolve(ROOT, tourFile), 'utf8'));

  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new Error('FISH_API_KEY is missing from .env');
  const provider = withCache(createFishProvider({ apiKey }), path.join(ROOT, 'out', '.cache', 'voice'));

  const speech = await synthesizeTour(tour, provider, paths.outDir);
  const timeline = buildTimeline(tour, speech);
  await writeFile(path.join(paths.outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

  for (const segment of timeline.segments) {
    const words = speech[segment.index]?.words.length ?? 0;
    console.log(`  ${segment.index + 1}. ${segment.start.toFixed(2)}s → ${segment.end.toFixed(2)}s  (${words} words)`);
  }
  console.log(`${paths.project}/${paths.name}: ${timeline.duration.toFixed(2)}s → ${path.relative(ROOT, paths.outDir)}`);
}

const { positionals } = parseArgs({ allowPositionals: true });
const [command, target] = positionals;
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

try {
  if (command === 'voice' && target) await voice(target);
  else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
}

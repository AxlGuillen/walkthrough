import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { captureTour, DEFAULT_FPS } from '../capture/capture.ts';
import { login } from '../capture/session.ts';
import { composeTour } from '../compose/compose.ts';
import { deviceProfile } from '../capture/devices.ts';
import { renderOverlays } from '../overlays/render.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { tourPaths } from '../tour/paths.ts';
import { withCache } from '../voice/cache.ts';
import { createFishProvider } from '../voice/fish/provider.ts';
import { synthesizeTour } from '../voice/stage.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const USAGE = `usage:
  walkthrough login <session> <url>   sign in by hand once; the profile is reused by renders
  walkthrough voice <tour.yaml>       synthesize narration and write the timeline
  walkthrough render <tour.yaml>      voice, timeline, capture and compose into video.mp4
      --from=overlays                 reuse capture.mp4; re-render overlays and compose
      --from=compose                  reuse capture.mp4 and overlays; only rebuild the final video`;

async function voice(tourFile: string) {
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
  return { tour, paths, timeline };
}

async function render(tourFile: string, from: string | undefined): Promise<void> {
  if (from !== undefined && from !== 'overlays' && from !== 'compose') throw new Error(`unknown --from value: ${from}`);
  const { tour, paths, timeline } = await voice(tourFile);

  if (from === undefined) {
    const started = Date.now();
    const { frames } = await captureTour({
      root: ROOT, tour, timeline, file: path.join(paths.outDir, 'capture.mp4'),
      onFrame: (frame, total) => process.stderr.write(`\r  capturing ${frame}/${total}`),
    });
    process.stderr.write('\n');
    console.log(`${frames} frames in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } else if (!existsSync(path.join(paths.outDir, 'capture.mp4'))) {
    throw new Error('no capture.mp4 to reuse; run render without --from first');
  }

  if (from !== 'compose') {
    await renderOverlays({
      overlays: timeline.overlays, tourDir: paths.dir, outDir: paths.outDir,
      output: deviceProfile(tour.device).output, fps: DEFAULT_FPS,
      onFrame: (overlay, frame, total) => process.stderr.write(`\r  overlay ${overlay}: ${frame}/${total}   `),
    });
    if (timeline.overlays.length) process.stderr.write('\n');
  }

  const video = await composeTour(tour, timeline, paths.outDir, paths.dir);
  console.log(`✓ ${path.relative(ROOT, video)}`);
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { from: { type: 'string' } } });
const [command, target, url] = positionals;
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

try {
  if (command === 'voice' && target) await voice(target);
  else if (command === 'render' && target) await render(target, values.from);
  else if (command === 'login' && target && url) {
    console.log(`Sign in to ${url} in the Chrome window, then close it. The session is kept in .auth/${target}.`);
    await login(ROOT, target, url);
    console.log('Session saved.');
  }
  else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
}

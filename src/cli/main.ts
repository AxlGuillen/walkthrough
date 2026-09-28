import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { captureTour, DEFAULT_FPS } from '../capture/capture.ts';
import { deviceProfile } from '../capture/devices.ts';
import { login } from '../capture/session.ts';
import { composeTour } from '../compose/compose.ts';
import { clean } from '../library/clean.ts';
import { GALLERY_PORT, startGallery } from '../library/gallery.ts';
import { publishVideo } from '../library/library.ts';
import { formatBytes } from '../library/page.ts';
import { renderOverlays } from '../overlays/render.ts';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { defaultStorage, tourPaths, voiceCacheDir } from '../tour/paths.ts';
import { withCache } from '../voice/cache.ts';
import { createFishProvider } from '../voice/fish/provider.ts';
import { synthesizeTour } from '../voice/stage.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const STORAGE = defaultStorage();
const USAGE = `usage:
  walkthrough login <session> <url>   sign in by hand once; the profile is reused by renders
  walkthrough voice <tour.yaml>       synthesize narration and write the timeline
  walkthrough render <tour.yaml>      voice, timeline, capture, overlays and compose
      --from=overlays                 reuse the capture; re-render overlays and compose
      --from=compose                  reuse capture and overlays; only rebuild the final video
  walkthrough gallery                 browse, reveal and trash generated videos
  walkthrough clean                   delete working files (videos are never touched)
      --voice                         also delete the voice cache
      --keep=<n>                      move all but the newest n renders of each tour to the Trash

videos: ${STORAGE.videos}
cache:  ${STORAGE.work}`;

async function voice(tourFile: string) {
  const paths = tourPaths(tourFile, ROOT, STORAGE);
  const tour = parseTour(await readFile(paths.file, 'utf8'));

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

async function render(tourFile: string, from: string | undefined): Promise<void> {
  if (from !== undefined && from !== 'overlays' && from !== 'compose') throw new Error(`unknown --from value: ${from}`);
  const { tour, paths, timeline } = await voice(tourFile);
  const capture = path.join(paths.workDir, 'capture.mp4');

  if (from === undefined) {
    const started = Date.now();
    const { frames } = await captureTour({
      root: ROOT, tour, timeline, file: capture,
      onFrame: (frame, total) => process.stderr.write(`\r  capturing ${frame}/${total}`),
    });
    process.stderr.write('\n');
    console.log(`${frames} frames in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } else if (!existsSync(capture)) {
    throw new Error('no capture to reuse; run render without --from first');
  }

  if (from !== 'compose') {
    await renderOverlays({
      overlays: timeline.overlays, tourDir: paths.dir, outDir: paths.workDir,
      output: deviceProfile(tour.device).output, fps: DEFAULT_FPS,
      onFrame: (overlay, frame, total) => process.stderr.write(`\r  overlay ${overlay}: ${frame}/${total}   `),
    });
    if (timeline.overlays.length) process.stderr.write('\n');
  }

  const composed = await composeTour(tour, timeline, paths.workDir, paths.dir);
  const video = await publishVideo(composed, paths.videoDir, {
    title: tour.title, project: paths.project, tour: paths.name, device: tour.device, duration: timeline.duration,
  });
  console.log(`✓ ${video.file}`);
}

async function gallery(open: boolean): Promise<void> {
  const server = await startGallery(STORAGE).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') throw error;
    return startGallery(STORAGE, 0);
  });
  const address = server.address();
  const url = `http://localhost:${typeof address === 'object' && address ? address.port : GALLERY_PORT}`;
  console.log(`gallery at ${url} (ctrl+c to stop)`);
  if (open) execFile('open', [url]);
}

async function cleanUp(voiceCache: boolean, keep: string | undefined): Promise<void> {
  const keepVideos = keep === undefined ? undefined : Number(keep);
  if (keepVideos !== undefined && (!Number.isInteger(keepVideos) || keepVideos < 0)) throw new Error('--keep needs a whole number');
  // out/ held every render before storage moved out of the repo.
  const report = await clean(STORAGE, {
    voice: voiceCache, legacy: path.join(ROOT, 'out'), ...(keepVideos === undefined ? {} : { keepVideos }),
  });
  for (const dir of report.deleted) console.log(`  deleted ${dir}`);
  for (const file of report.trashed) console.log(`  trashed ${file}`);
  console.log(`freed ${formatBytes(report.freed)}`);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { from: { type: 'string' }, voice: { type: 'boolean' }, keep: { type: 'string' }, 'no-open': { type: 'boolean' } },
});
const [command, target, url] = positionals;
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

try {
  if (command === 'voice' && target) await voice(target);
  else if (command === 'render' && target) await render(target, values.from);
  else if (command === 'gallery') await gallery(!values['no-open']);
  else if (command === 'clean') await cleanUp(values.voice ?? false, values.keep);
  else if (command === 'login' && target && url) {
    console.log(`Sign in to ${url} in the Chrome window, then close it. The session is kept in .auth/${target}.`);
    await login(ROOT, target, url);
    console.log('Session saved.');
  } else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
}

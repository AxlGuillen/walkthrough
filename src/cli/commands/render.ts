import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureTour } from '../../capture/capture.ts';
import { deviceProfile, FPS, type Quality } from '../../capture/devices.ts';
import { composeTour } from '../../compose/compose.ts';
import { execFile } from 'node:child_process';
import { ensureGallery } from '../../library/launch.ts';
import { previewMetaFile, publishVideo } from '../../library/library.ts';
import { previewAnchor, videoAnchor } from '../../library/page.ts';
import { renderOverlays } from '../../overlays/render.ts';
import { ROOT, STORAGE } from '../context.ts';
import { voice } from './voice.ts';

export async function render(tourFile: string, from: string | undefined, preview: boolean, open: boolean): Promise<void> {
  if (from !== undefined && from !== 'overlays' && from !== 'compose') throw new Error(`unknown --from value: ${from}`);
  const { tour, paths, timeline } = await voice(tourFile);
  const quality: Quality = preview ? 'preview' : 'final';
  // Previews keep their own capture and overlays next to the shared voice and timeline.
  const outDir = preview ? path.join(paths.workDir, 'preview') : paths.workDir;
  await mkdir(outDir, { recursive: true });
  const capture = path.join(outDir, 'capture.mp4');
  const started = Date.now();

  if (from === undefined) {
    const { frames } = await captureTour({
      root: ROOT, tour, timeline, file: capture, quality,
      onFrame: (frame, total) => process.stderr.write(`\r  capturing ${frame}/${total}`),
    });
    process.stderr.write('\n');
    console.log(`${frames} frames in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } else if (!existsSync(capture)) {
    throw new Error(`no ${preview ? 'preview ' : ''}capture to reuse; run render${preview ? ' --preview' : ''} without --from first`);
  }

  if (from !== 'compose') {
    await renderOverlays({
      overlays: timeline.overlays, tourDir: paths.dir, outDir,
      canvas: deviceProfile(tour.device).output, output: deviceProfile(tour.device, quality).output, fps: FPS[quality], accent: tour.accent,
      onFrame: (overlay, frame, total) => process.stderr.write(`\r  overlay ${overlay}: ${frame}/${total}   `),
    });
    if (timeline.overlays.length) process.stderr.write('\n');
  }

  const composed = await composeTour(tour, timeline, outDir, paths.dir, { quality, ...(preview ? { voiceDir: '../voice' } : {}) });
  const meta = { title: tour.title, project: paths.project, tour: paths.name, device: tour.device, duration: timeline.duration };
  let anchor: string;
  if (preview) {
    await writeFile(previewMetaFile(composed), JSON.stringify({ ...meta, createdAt: new Date().toISOString() }, null, 2));
    console.log(`✓ preview in ${((Date.now() - started) / 1000).toFixed(1)}s: ${composed}`);
    anchor = previewAnchor(`${paths.project}/${paths.name}`);
  } else {
    const video = await publishVideo(composed, paths.videoDir, meta);
    console.log(`✓ ${video.file}`);
    anchor = videoAnchor(path.relative(STORAGE.videos, video.file));
  }

  if (open) {
    const url = `${await ensureGallery(ROOT)}/#${anchor}`;
    execFile('open', [url]);
    console.log(`  opened ${url}`);
  } else {
    console.log('  see it in the gallery: bun run gallery  (or render with --open)');
  }
}

import { existsSync } from 'node:fs';
import path from 'node:path';
import { captureTour, DEFAULT_FPS } from '../../capture/capture.ts';
import { deviceProfile } from '../../capture/devices.ts';
import { composeTour } from '../../compose/compose.ts';
import { publishVideo } from '../../library/library.ts';
import { renderOverlays } from '../../overlays/render.ts';
import { ROOT } from '../context.ts';
import { voice } from './voice.ts';

export async function render(tourFile: string, from: string | undefined): Promise<void> {
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

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureTour } from '../../capture/capture.ts';
import { deviceProfile, FPS, type Quality } from '../../capture/devices.ts';
import { composeTour } from '../../compose/compose.ts';
import { openPath } from '../../desktop/desktop.ts';
import { ensureGallery } from '../../library/launch.ts';
import { previewMetaFile, publishVideo } from '../../library/library.ts';
import { previewAnchor, videoAnchor } from '../../library/page.ts';
import { tourLook } from '../../brands/look.ts';
import { auditTiming, formatTiming } from '../../check/timing.ts';
import { EVENTS_FILE, type CaptureEvent } from '../../capture/events.ts';
import { renderOverlays } from '../../overlays/render.ts';
import { renderFrame } from '../../frame/render.ts';
import { stagePlan } from '../../stage/plan.ts';
import { renderStage, spanFrames } from '../../stage/render.ts';
import { frameCount } from '../../capture/schedule.ts';
import { defaultJobs, together } from '../parallel.ts';
import { renderProgress } from '../progress.ts';
import { ROOT, STORAGE } from '../context.ts';
import { voice } from './voice.ts';

export async function render(
  tourFile: string, from: string | undefined, preview: boolean, open: boolean,
  jobs = defaultJobs(os.totalmem(), os.availableParallelism()),
): Promise<void> {
  if (from !== undefined && from !== 'overlays' && from !== 'compose') throw new Error(`unknown --from value: ${from}`);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs must be a whole number from 1 up, not ${jobs}`);
  const { tour, paths, timeline } = await voice(tourFile);
  const quality: Quality = preview ? 'preview' : 'final';
  // Previews keep their own capture and overlays next to the shared voice and timeline.
  const outDir = preview ? path.join(paths.workDir, 'preview') : paths.workDir;
  await mkdir(outDir, { recursive: true });
  const capture = path.join(outDir, 'capture.mp4');
  const started = Date.now();
  if (from !== undefined && !existsSync(capture)) {
    throw new Error(`no ${preview ? 'preview ' : ''}capture to reuse; run render${preview ? ' --preview' : ''} without --from first`);
  }

  if (from !== 'compose') {
    const canvas = deviceProfile(tour.device).output;
    const output = deviceProfile(tour.device, quality).output;
    const fps = FPS[quality];
    const look = tourLook(tour);
    const plan = stagePlan(timeline, tour.device === 'mobile');
    const progress = renderProgress({
      ...(from === undefined ? { capturing: frameCount(timeline.duration, fps) } : {}),
      overlays: timeline.overlays.reduce((sum, overlay) => sum + frameCount(overlay.end - overlay.start, fps), 0),
      stage: plan.spans.reduce((sum, span) => sum + spanFrames(span, fps).count, 0),
    });
    // Overlays need nothing from the capture, so they render alongside it on the cores the
    // capture's single busy browser leaves free; the stage needs the capture and follows it.
    await together([
      async signal => {
        if (from === undefined) {
          const { frames } = await captureTour({ root: ROOT, tour, timeline, file: capture, quality, signal, onFrame: frame => progress('capturing', frame) });
          progress.log(`${frames} frames in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        }
        await renderStage({
          plan, capture, tourDir: paths.dir, outDir, draft: preview, canvas, output, fps, look, jobs, signal,
          onFrame: (span, frame) => progress('stage', frame, span),
        });
      },
      signal => renderOverlays({
        overlays: timeline.overlays, tourDir: paths.dir, outDir, canvas, output, fps, look, jobs, signal,
        onFrame: (overlay, frame) => progress('overlays', frame, overlay),
      }),
    ]);
    progress.end();
    if (tour.frame !== 'none') {
      await renderFrame({ frame: tour.frame, device: tour.device, url: tour.url, tourDir: paths.dir, outDir, canvas, output, look });
    }
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

  const events = path.join(outDir, EVENTS_FILE);
  if (existsSync(events)) {
    const notes = [...auditTiming(JSON.parse(await readFile(events, 'utf8')) as CaptureEvent[], timeline), ...stagePlan(timeline, tour.device === 'mobile').notes];
    console.log(formatTiming(notes.sort((a, b) => a.time - b.time)));
  }

  if (open) {
    const url = `${await ensureGallery(ROOT)}/#${anchor}`;
    openPath(url);
    console.log(`  opened ${url}`);
  } else {
    console.log('  see it in the gallery: bun run gallery  (or render with --open)');
  }
}

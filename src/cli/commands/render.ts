import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureTour } from '../../capture/capture.ts';
import { withClips } from '../../clips/plan.ts';
import { prepareClips } from '../../clips/prepare.ts';
import { deviceProfile, FPS, type Quality } from '../../capture/devices.ts';
import { capturedEvents, composeTour, SFX_FILE, soundScene } from '../../compose/compose.ts';
import { auditSync, formatSync } from '../../check/sync.ts';
import type { SoundEvent } from '../../compose/sfx.ts';
import { openPath } from '../../desktop/desktop.ts';
import { ensureGallery } from '../../library/launch.ts';
import { previewMetaFile, publishVideo } from '../../library/library.ts';
import { previewAnchor, videoAnchor } from '../../library/page.ts';
import { tourLook } from '../../brands/look.ts';
import { auditTiming, formatTiming } from '../../check/timing.ts';
import { EVENTS_FILE, type CaptureEvent } from '../../capture/events.ts';
import { renderOverlays, resolveOverlay, TEMPLATES_DIR } from '../../overlays/render.ts';
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
    // Before anything long starts: a missing source render stops here, with the command to make it.
    const overlays = withClips(timeline.overlays, await prepareClips(tour, paths.dir, ROOT, STORAGE, outDir));
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
        // Only now is it known which clicks that wait really left their page.
        const navigations = (JSON.parse(await readFile(path.join(outDir, EVENTS_FILE), 'utf8')) as CaptureEvent[])
          .filter(e => e.kind === 'navigate').map(e => e.time);
        await renderStage({
          plan: stagePlan(timeline, tour.device === 'mobile', navigations), capture, tourDir: paths.dir, outDir, draft: preview, canvas, output, fps, look, jobs, signal,
          onFrame: (span, frame) => progress('stage', frame, span),
        });
      },
      signal => renderOverlays({
        overlays, tourDir: paths.dir, outDir, canvas, output, fps, look, jobs, signal,
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
  const sfx = path.join(outDir, SFX_FILE);
  if (tour.sfx.enabled && existsSync(sfx)) {
    const scene = { ...await soundScene(tour, timeline, outDir, quality), mute: tour.sfx.mute, isTemplate: (src: string) => isSharedTemplate(paths.dir, src) };
    const mixed = JSON.parse(await readFile(sfx, 'utf8')) as SoundEvent[];
    console.log(formatSync(auditSync(mixed, await capturedEvents(outDir, timeline), timeline.overlays, scene)));
  }

  if (open) {
    const url = `${await ensureGallery(ROOT)}/#${anchor}`;
    openPath(url);
    console.log(`  opened ${url}`);
  } else {
    console.log('  see it in the gallery: bun run gallery  (or render with --open)');
  }
}

// An overlay that comes from templates/overlays rather than the tour's own folder.
function isSharedTemplate(tourDir: string, src: string): boolean {
  return resolveOverlay(tourDir, src)?.startsWith(TEMPLATES_DIR) ?? false;
}

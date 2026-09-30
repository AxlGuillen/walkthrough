import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cursorPosition, sceneAt } from '../effects/scene.ts';
import { renderScene } from '../effects/svg.ts';
import type { Timeline } from '../timeline/build.ts';
import { cameraAt, followCursor, fullFrame } from '../timeline/camera.ts';
import type { Tour } from '../tour/schema.ts';
import { continueTyping, fadeHiddenMarks, perform, retrackMarks } from './actions.ts';
import { installClock } from './clock.ts';
import { prepareTargets } from './prep.ts';
import { deviceProfile, FPS, type Quality } from './devices.ts';
import { EVENTS_FILE } from './events.ts';
import { startEncoder } from './encoder.ts';
import { effectsLayer, scrollControl, transitionLayer } from './runtime.ts';
import { applyScrolls } from './scroll.ts';
import { dueActions, frameCount } from './schedule.ts';
import { openContext } from './session.ts';
import { installSetup } from './setup.ts';
import { createStage } from './stage.ts';

export const DEFAULT_FPS = FPS.final;

export interface CaptureOptions {
  root: string;
  tour: Tour;
  timeline: Timeline;
  file: string;
  quality?: Quality;
  fps?: number;
  headless?: boolean;
  onFrame?: (frame: number, total: number) => void;
}

export async function captureTour({
  root, tour, timeline, file, quality = 'final', fps = FPS[quality], headless = true, onFrame,
}: CaptureOptions): Promise<{ frames: number }> {
  const device = deviceProfile(tour.device, quality);
  const context = await openContext(root, { headless, device, ...(tour.session ? { session: tour.session } : {}) });
  const encoder = startEncoder({ fps, output: device.output, file, draft: quality === 'preview' });
  const total = frameCount(timeline.duration, fps);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const clock = await installClock(page);
    await page.addInitScript(effectsLayer);
    await page.addInitScript(scrollControl);
    await page.addInitScript(transitionLayer);
    await installSetup(page, tour);
    const stage = createStage(page, clock, tour, device, timeline);
    const home = fullFrame(device.viewport);

    let previous = -Infinity;
    for (let frame = 0; frame < total; frame++) {
      stage.time = frame / fps;
      await prepareTargets(stage);
      for (const action of dueActions(timeline.actions, previous, stage.time)) {
        await perform(stage, action, timeline.actions.indexOf(action));
      }
      await continueTyping(stage);
      await applyScrolls(page, stage.scrolls, previous, stage.time);
      // Every frame, not only after our own scrolls: the app may move the page itself, as a
      // menu that scrolls to the top when it opens.
      await retrackMarks(stage);
      await fadeHiddenMarks(stage);
      previous = stage.time;

      await clock.syncAnimations();
      const markup = renderScene(sceneAt(stage.time, stage.effects), tour.accent);
      await page.evaluate(markup => window.__walkthrough?.draw?.(markup), markup);
      const follow = (rect: typeof home, at: number) => followCursor(rect, cursorPosition(at, stage.effects), device.viewport);
      await encoder.write(await page.screenshot({ clip: cameraAt(stage.time, stage.camera, home, follow) }));
      await clock.advance(1000 / fps);
      onFrame?.(frame + 1, total);
    }
    await encoder.finish();
    await writeFile(path.join(path.dirname(file), EVENTS_FILE), JSON.stringify(stage.log, null, 2));
  } catch (error) {
    await encoder.finish().catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
  return { frames: total };
}

import { deviceProfile } from '../../capture/devices.ts';
import { checkClips, checkFlows, checkOverlays, checkResources, checkShots, checkTour } from '../../check/check.ts';
import { formatReport } from '../../check/report.ts';
import { ROOT, STORAGE } from '../context.ts';
import { voice } from './voice.ts';

export async function check(tourFile: string): Promise<void> {
  const { tour, timeline, paths } = await voice(tourFile);
  const started = Date.now();
  const items = [...await checkTour(ROOT, tour, timeline), ...checkOverlays(paths.dir, timeline),
    ...await checkClips(tour, timeline, paths.dir, ROOT, STORAGE),
    ...checkFlows(timeline, deviceProfile(tour.device).output), ...checkShots(timeline, tour.device === 'mobile'),
    ...checkResources(timeline, deviceProfile(tour.device).output, tour.language)].sort((a, b) => a.time - b.time);
  console.log(`\n${formatReport(items)} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (items.some(item => item.status === 'fail')) process.exitCode = 1;
}

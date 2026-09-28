import { checkTour } from '../../check/check.ts';
import { formatReport } from '../../check/report.ts';
import { ROOT } from '../context.ts';
import { voice } from './voice.ts';

export async function check(tourFile: string): Promise<void> {
  const { tour, timeline } = await voice(tourFile);
  const started = Date.now();
  const items = await checkTour(ROOT, tour, timeline);
  console.log(`\n${formatReport(items)} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (items.some(item => item.status === 'fail')) process.exitCode = 1;
}

import path from 'node:path';
import { clean } from '../../library/clean.ts';
import { formatBytes } from '../../library/page.ts';
import { ROOT, STORAGE } from '../context.ts';

export async function cleanUp(voiceCache: boolean, keep: string | undefined): Promise<void> {
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

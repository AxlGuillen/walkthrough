import path from 'node:path';
import { inspectApp } from '../../inspect/inspect.ts';
import { ROOT, STORAGE } from '../context.ts';

export async function inspect(url: string, session: string | undefined, device: string | undefined): Promise<void> {
  if (device !== undefined && device !== 'desktop' && device !== 'mobile') throw new Error('--device must be desktop or mobile');
  const outDir = path.join(STORAGE.work, 'inspect', new URL(url).host || 'local');
  const report = await inspectApp({
    root: ROOT, url, outDir, ...(session ? { session } : {}), ...(device ? { device } : {}),
  });
  console.log(`✓ ${report}`);
}

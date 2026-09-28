import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deviceProfile, type Device } from '../capture/devices.ts';
import { openContext } from '../capture/session.ts';
import { inspectReport, routesToVisit, type InspectedPage } from './report.ts';
import { snapshotPage } from './snapshot.ts';

export interface InspectOptions {
  root: string;
  url: string;
  outDir: string;
  session?: string;
  device?: Device;
  maxPages?: number;
}

const SETTLE_MS = 800;

export async function inspectApp({ root, url, outDir, session, device = 'desktop', maxPages = 15 }: InspectOptions): Promise<string> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const context = await openContext(root, {
    headless: true, device: { ...deviceProfile(device), deviceScaleFactor: 1 }, ...(session ? { session } : {}),
  });
  const pages: InspectedPage[] = [];
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const visit = async (route: string) => {
      await page.goto(new URL(route, url).href);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
      const screenshot = `${String(pages.length + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(outDir, screenshot) });
      const snapshot = await snapshotPage(page);
      pages.push({ route, snapshot, screenshot });
      return snapshot;
    };

    const start = new URL(url).pathname + new URL(url).search;
    const first = await visit(start);
    for (const route of routesToVisit(start, first, maxPages).slice(1)) await visit(route);
  } finally {
    await context.close();
  }
  const report = path.join(outDir, 'report.md');
  await writeFile(report, inspectReport(url, pages));
  return report;
}

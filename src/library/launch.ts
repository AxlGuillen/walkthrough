import { spawn } from 'node:child_process';
import path from 'node:path';
import { GALLERY_PORT } from './gallery.ts';
import { GALLERY_TITLE } from './page.ts';

const BASE = `http://localhost:${GALLERY_PORT}`;
const PROBE_TIMEOUT = 800;
const START_TIMEOUT = 8_000;

// Another app may hold the port; only a page with our title counts as the gallery.
export function isGallery(html: string): boolean {
  return html.includes(`<title>${GALLERY_TITLE}</title>`);
}

async function running(): Promise<boolean> {
  try {
    const response = await fetch(BASE, { signal: AbortSignal.timeout(PROBE_TIMEOUT) });
    return isGallery(await response.text());
  } catch {
    return false;
  }
}

// Reuses a gallery that is already up, or starts one that outlives this command.
export async function ensureGallery(root: string): Promise<string> {
  if (await running()) return BASE;
  const child = spawn(process.execPath, [path.join(root, 'src/cli/main.ts'), 'gallery', '--no-open'], {
    cwd: root, detached: true, stdio: 'ignore',
  });
  child.unref();
  const deadline = Date.now() + START_TIMEOUT;
  while (Date.now() < deadline) {
    if (await running()) return BASE;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`the gallery did not start on ${BASE}; run: bun run gallery`);
}

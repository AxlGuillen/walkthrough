import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { formatBytes } from '../library/page.ts';
import { sizeOf } from '../library/library.ts';
import type { Storage } from '../tour/paths.ts';
import { DEFAULT_VOICE } from '../voice/fish/provider.ts';
import { ffmpegFinding, nodeFinding, sessionFindings, sessionOf, type Finding } from './checks.ts';

const run = promisify(execFile);
const NETWORK_TIMEOUT = 8_000;

export interface DoctorOptions {
  root: string;
  storage: Storage;
  apiKey?: string;
  fetch?: typeof fetch;
}

export async function runDoctor({ root, storage, apiKey, fetch: request = fetch }: DoctorOptions): Promise<Finding[]> {
  const appleSilicon = process.platform === 'darwin' && os.cpus()[0]?.model.startsWith('Apple') === true;
  const findings: Finding[] = [nodeFinding(process.version, process.arch, appleSilicon)];

  const banner = await run('ffmpeg', ['-hide_banner', '-version']).then(r => r.stdout, () => null);
  const filters = banner ? await run('ffmpeg', ['-hide_banner', '-filters']).then(r => r.stdout, () => '') : '';
  findings.push(ffmpegFinding(banner, filters));
  findings.push(await run('ffprobe', ['-version']).then(
    () => ({ name: 'ffprobe', status: 'ok' as const, detail: 'found' }),
    () => ({ name: 'ffprobe', status: 'fail' as const, detail: 'not found on PATH' }),
  ));

  findings.push(await chromeFinding());
  findings.push(await fishFinding(apiKey, request));
  findings.push(...await sessions(root));

  const cache = await sizeOf(storage.work);
  findings.push({ name: 'cache', status: 'ok', detail: `${formatBytes(cache)} in ${storage.work}` });
  findings.push({ name: 'videos', status: 'ok', detail: storage.videos });
  return findings;
}

async function chromeFinding(): Promise<Finding> {
  try {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 30_000 });
    const version = browser.version();
    await browser.close();
    return { name: 'chrome', status: 'ok', detail: version };
  } catch (error) {
    return { name: 'chrome', status: 'fail', detail: `cannot start Google Chrome: ${(error as Error).message.split('\n')[0]}` };
  }
}

async function fishFinding(apiKey: string | undefined, request: typeof fetch): Promise<Finding> {
  if (!apiKey) return { name: 'fish', status: 'fail', detail: 'FISH_API_KEY is missing from .env' };
  try {
    const response = await request(`https://api.fish.audio/model/${DEFAULT_VOICE}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(NETWORK_TIMEOUT),
    });
    if (response.status === 401 || response.status === 403) return { name: 'fish', status: 'fail', detail: `the API key was rejected (${response.status})` };
    if (!response.ok) return { name: 'fish', status: 'warn', detail: `default voice lookup answered ${response.status}` };
    const voice = await response.json() as { title?: string };
    return { name: 'fish', status: 'ok', detail: `key works; default voice «${voice.title ?? DEFAULT_VOICE}»` };
  } catch (error) {
    return { name: 'fish', status: 'warn', detail: `could not reach Fish Audio: ${(error as Error).message}` };
  }
}

async function sessions(root: string): Promise<Finding[]> {
  const authDir = path.join(root, '.auth');
  const saved = existsSync(authDir)
    ? await Promise.all((await readdir(authDir, { withFileTypes: true })).filter(e => e.isDirectory()).map(async e => ({
      name: e.name,
      ageDays: Math.floor((Date.now() - (await stat(path.join(authDir, e.name))).mtimeMs) / 86_400_000),
    })))
    : [];
  return sessionFindings(saved, await sessionsWanted(path.join(root, 'tours')));
}

async function sessionsWanted(toursDir: string): Promise<string[]> {
  if (!existsSync(toursDir)) return [];
  const wanted: string[] = [];
  for (const project of await readdir(toursDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const file of (await readdir(path.join(toursDir, project.name))).filter(name => name.endsWith('.yaml'))) {
      const session = sessionOf(await readFile(path.join(toursDir, project.name, file), 'utf8'));
      if (session) wanted.push(session);
    }
  }
  return wanted;
}

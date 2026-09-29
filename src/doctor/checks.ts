import { parse } from 'yaml';

export type Health = 'ok' | 'warn' | 'fail';

export interface Finding {
  name: string;
  status: Health;
  detail: string;
}

export const REQUIRED_FILTERS = ['ass', 'sidechaincompress', 'loudnorm', 'overlay', 'aevalsrc', 'anoisesrc', 'amix', 'adelay'] as const;
// Subtitles are off by default, so a build without libass only loses an option.
const OPTIONAL_FILTERS = new Set(['ass']);

export function nodeFinding(version: string, arch: string, appleSilicon: boolean): Finding {
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  if (major < 24) return { name: 'node', status: 'fail', detail: `${version}; this repo needs Node 24 (fnm use)` };
  if (appleSilicon && arch !== 'arm64') return { name: 'node', status: 'warn', detail: `${version} ${arch} runs under Rosetta; reinstall with FNM_ARCH=arm64` };
  return { name: 'node', status: 'ok', detail: `${version} ${arch}` };
}

export function ffmpegVersion(banner: string): string | null {
  return banner.match(/^ffmpeg version (\S+)/)?.[1] ?? null;
}

export function ffmpegFinding(banner: string | null, filters: string): Finding {
  const version = banner && ffmpegVersion(banner);
  if (!version) return { name: 'ffmpeg', status: 'fail', detail: 'not found on PATH' };
  const available = new Set(filters.split('\n').map(line => line.trim().split(/\s+/)[1]).filter(Boolean));
  const missing = REQUIRED_FILTERS.filter(filter => !available.has(filter));
  const blocking = missing.filter(filter => !OPTIONAL_FILTERS.has(filter));
  if (blocking.length) return { name: 'ffmpeg', status: 'fail', detail: `${version} lacks ${blocking.join(', ')}` };
  if (missing.length) return { name: 'ffmpeg', status: 'warn', detail: `${version} lacks ${missing.join(', ')} (karaoke subtitles unavailable)` };
  return { name: 'ffmpeg', status: 'ok', detail: version };
}

export function sessionFindings(saved: readonly { name: string; ageDays: number }[], wanted: readonly string[]): Finding[] {
  const names = new Set(saved.map(s => s.name));
  const findings = saved.map(({ name, ageDays }) => ({
    name: `session ${name}`, status: 'ok' as Health, detail: `saved ${ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`}`,
  }));
  for (const name of new Set(wanted)) {
    if (!names.has(name)) findings.push({ name: `session ${name}`, status: 'fail', detail: `a tour needs it; run: walkthrough login ${name} <url>` });
  }
  return findings;
}

// A broken tour is check's business; here it only must not hide the others.
export function sessionOf(tourYaml: string): string | undefined {
  try {
    const session = (parse(tourYaml) as { session?: unknown } | null)?.session;
    return typeof session === 'string' ? session : undefined;
  } catch {
    return undefined;
  }
}

const SYMBOL: Record<Health, string> = { ok: '✓', warn: '⚠', fail: '✗' };

export function formatFindings(findings: readonly Finding[]): string {
  const width = Math.max(...findings.map(f => f.name.length));
  const lines = findings.map(f => `${SYMBOL[f.status]} ${f.name.padEnd(width)}  ${f.detail}`);
  const failures = findings.filter(f => f.status === 'fail').length;
  lines.push('', failures ? `${failures} problem${failures === 1 ? '' : 's'} to fix` : 'ready to render');
  return lines.join('\n');
}

import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { deviceProfile, type Device } from '../../capture/devices.ts';
import { probeOverlay } from '../../overlays/probe.ts';
import { overlayFile, renderOverlays } from '../../overlays/render.ts';
import { STORAGE } from '../context.ts';

// Flags as parseArgs hands them over: any of them may be missing.
export interface OverlayCommand {
  src: string;
  duration: string | undefined;
  beats: string | undefined;
  params: string | undefined;
  data: string | undefined;
  device: string | undefined;
  theme: string | undefined;
  accent: string | undefined;
  lang: string | undefined;
  open: boolean;
}

const FPS = 30;
// Mid grey under the overlay, so both a dark and a light design show their edges.
const BACKDROP = '0x5a5a5a';

export async function overlay(options: OverlayCommand): Promise<void> {
  const device: Device = options.device === 'mobile' ? 'mobile' : 'desktop';
  const data = options.data === undefined ? undefined : parse(await readFile(options.data, 'utf8')) as unknown;
  const timed = probeOverlay({
    src: options.src, duration: Number(options.duration ?? 5),
    ...(options.beats ? { beats: options.beats } : {}), ...(options.params ? { params: options.params } : {}),
    ...(data === undefined ? {} : { data }),
  });
  const name = path.basename(options.src, '.html');
  const outDir = path.join(STORAGE.work, 'probe', `${name}-${device}`);
  await mkdir(outDir, { recursive: true });

  const { output } = deviceProfile(device);
  const started = Date.now();
  await renderOverlays({
    overlays: [timed], tourDir: process.cwd(), outDir, canvas: output, output, fps: FPS,
    look: { accent: options.accent ?? '#FF3B5C', theme: options.theme ?? 'dark', lang: options.lang ?? 'es' },
    onFrame: (_, frame, total) => process.stderr.write(`\r  frame ${frame}/${total}   `),
  });
  process.stderr.write('\n');

  const video = path.join(outDir, 'probe.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=${BACKDROP}:s=${output.width}x${output.height}:r=${FPS}:d=${timed.end}`,
    '-i', path.join(outDir, overlayFile(0)),
    '-filter_complex', '[0][1]overlay=eof_action=pass,format=yuv420p', '-c:v', 'libx264', '-crf', '18', video]);
  console.log(`✓ ${video} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (options.open) execFile('open', [video]);
}

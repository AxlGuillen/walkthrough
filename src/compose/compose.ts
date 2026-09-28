import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { deviceProfile } from '../capture/devices.ts';
import type { Timeline } from '../timeline/build.ts';
import { overlayFile } from '../overlays/render.ts';
import type { Tour } from '../tour/schema.ts';
import { audioGraph } from './audio.ts';
import { karaokeAss } from './subtitles.ts';
import { videoGraph } from './video.ts';

const run = promisify(execFile);

export interface ComposeInputs {
  capture: string;
  clips: { file: string; start: number }[];
  music?: { file: string; volume: number };
  overlays?: { file: string; start: number; end: number; fade: number }[];
  subtitles?: string;
  duration: number;
  output: string;
}

export function composeArgs({ capture, clips, music, overlays = [], subtitles, duration, output }: ComposeInputs): string[] {
  const inputs = ['-i', capture, ...clips.flatMap(clip => ['-i', clip.file])];
  if (music) inputs.push('-stream_loop', '-1', '-i', music.file);
  const firstOverlay = 1 + clips.length + (music ? 1 : 0);
  inputs.push(...overlays.flatMap(overlay => ['-i', overlay.file]));

  const audio = audioGraph({
    clips: clips.map((clip, i) => ({ input: i + 1, start: clip.start })),
    duration,
    ...(music ? { music: { input: clips.length + 1, volume: music.volume } } : {}),
  });
  const video = videoGraph(overlays.map((overlay, i) => ({ ...overlay, input: firstOverlay + i })), subtitles);

  return [
    '-y', '-v', 'error', ...inputs,
    '-filter_complex', `${video};${audio}`,
    '-map', '[vout]', '-map', '[aout]', '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    output,
  ];
}

// Runs from outDir with relative paths: the ass filter's own escaping rules make
// absolute paths fragile.
export async function composeTour(tour: Tour, timeline: Timeline, outDir: string, tourDir: string): Promise<string> {
  const clips = timeline.segments.flatMap(segment => segment.speechStart === null ? [] : [{
    file: path.join('voice', `${String(segment.index + 1).padStart(2, '0')}.wav`),
    start: segment.speechStart,
  }]);

  let subtitles: string | undefined;
  if (tour.subtitles === 'karaoke') {
    subtitles = 'subs.ass';
    await writeFile(path.join(outDir, subtitles), karaokeAss(timeline.words, deviceProfile(tour.device).output, tour.accent));
  }

  let music: ComposeInputs['music'];
  if (tour.music) {
    const file = path.resolve(tourDir, tour.music.track);
    if (!existsSync(file)) throw new Error(`music track not found: ${file}`);
    music = { file, volume: tour.music.volume };
  }

  const overlays = timeline.overlays.map(({ start, end, fade }, i) => ({ file: overlayFile(i), start, end, fade }));
  const missing = overlays.find(overlay => !existsSync(path.join(outDir, overlay.file)));
  if (missing) throw new Error(`${missing.file} is missing; render without --from=compose first`);

  const output = 'video.mp4';
  const args = composeArgs({
    capture: 'capture.mp4', clips, overlays, duration: timeline.duration, output,
    ...(subtitles ? { subtitles } : {}),
    ...(music ? { music } : {}),
  });
  await run('ffmpeg', args, { cwd: outDir, maxBuffer: 16 * 1024 * 1024 });
  return path.join(outDir, output);
}

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { deviceProfile, type Quality } from '../capture/devices.ts';
import type { Timeline } from '../timeline/build.ts';
import { overlayFile } from '../overlays/render.ts';
import type { Tour } from '../tour/schema.ts';
import { audioGraph, type Loudness } from './audio.ts';
import { soundEvents, type SoundEvent } from './sfx.ts';
import { karaokeAss } from './subtitles.ts';
import { videoGraph } from './video.ts';

const run = promisify(execFile);

export interface ComposeInputs {
  capture: string;
  clips: { file: string; start: number }[];
  music?: { file: string; volume: number };
  overlays?: { file: string; start: number; end: number; fade: number }[];
  sfx?: SoundEvent[];
  subtitles?: string;
  duration: number;
  output: string;
  draft?: boolean;
}

function graphs({ capture, clips, music, overlays = [], sfx = [], subtitles, duration }: ComposeInputs, loudness?: Loudness) {
  const inputs = ['-i', capture, ...clips.flatMap(clip => ['-i', clip.file])];
  if (music) inputs.push('-stream_loop', '-1', '-i', music.file);
  const firstOverlay = 1 + clips.length + (music ? 1 : 0);
  inputs.push(...overlays.flatMap(overlay => ['-i', overlay.file]));

  const audio = audioGraph({
    clips: clips.map((clip, i) => ({ input: i + 1, start: clip.start })),
    duration,
    sfx,
    ...(loudness ? { loudness } : {}),
    ...(music ? { music: { input: clips.length + 1, volume: music.volume } } : {}),
  });
  const video = videoGraph(overlays.map((overlay, i) => ({ ...overlay, input: firstOverlay + i })), subtitles);
  return { inputs, audio, video };
}

// loudnorm's first pass: the audio alone, measured and discarded.
export function measureArgs(compose: ComposeInputs): string[] {
  const { inputs, audio } = graphs(compose);
  return ['-hide_banner', '-nostats', ...inputs, '-filter_complex', audio, '-map', '[aout]', '-f', 'null', '-'];
}

export function composeArgs(compose: ComposeInputs, loudness: Loudness): string[] {
  const { inputs, audio, video } = graphs(compose, loudness);
  return [
    '-y', '-v', 'error', ...inputs,
    '-filter_complex', `${video};${audio}`,
    '-map', '[vout]', '-map', '[aout]', '-t', compose.duration.toFixed(3),
    '-c:v', 'libx264', ...(compose.draft ? ['-preset', 'veryfast', '-crf', '26'] : ['-preset', 'medium', '-crf', '18']), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    compose.output,
  ];
}

export interface ComposeOptions {
  quality?: Quality;
  // Relative to outDir: a preview lives in a subfolder and reuses the tour's voice.
  voiceDir?: string;
}

// Runs from outDir with relative paths: the ass filter's own escaping rules make
// absolute paths fragile.
export async function composeTour(
  tour: Tour, timeline: Timeline, outDir: string, tourDir: string, { quality = 'final', voiceDir = 'voice' }: ComposeOptions = {},
): Promise<string> {
  const clips = timeline.segments.flatMap(segment => segment.speechStart === null ? [] : [{
    file: path.join(voiceDir, `${String(segment.index + 1).padStart(2, '0')}.wav`),
    start: segment.speechStart,
  }]);

  let subtitles: string | undefined;
  if (tour.subtitles === 'karaoke') {
    subtitles = 'subs.ass';
    await writeFile(path.join(outDir, subtitles), karaokeAss(timeline.words, deviceProfile(tour.device, quality).output, tour.accent));
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
  const inputs: ComposeInputs = {
    capture: 'capture.mp4', clips, overlays, duration: timeline.duration, output, draft: quality === 'preview',
    sfx: tour.sfx ? soundEvents(timeline) : [],
    ...(subtitles ? { subtitles } : {}),
    ...(music ? { music } : {}),
  };
  // A stuck filter graph ignores SIGTERM and would spin forever; kill it hard instead.
  const timeout = Math.round(Math.max(120, timeline.duration * 10) * 1000);
  const options = { cwd: outDir, maxBuffer: 16 * 1024 * 1024, timeout, killSignal: 'SIGKILL' as const };

  const { stderr } = await run('ffmpeg', measureArgs(inputs), options);
  await run('ffmpeg', composeArgs(inputs, parseLoudness(stderr)), options);
  return path.join(outDir, output);
}

export function parseLoudness(stderr: string): Loudness {
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  const measured = JSON.parse(json) as Partial<Loudness>;
  const keys = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'] as const;
  if (keys.some(key => measured[key] === undefined)) throw new Error('loudnorm did not report its measurement');
  return measured as Loudness;
}

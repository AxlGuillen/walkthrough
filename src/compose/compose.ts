import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { deviceProfile, FPS, type Quality } from '../capture/devices.ts';
import type { Timeline } from '../timeline/build.ts';
import type { Rect, Size } from '../timeline/camera.ts';
import { FRAME_FILE, outputLayout } from '../frame/render.ts';
import { overlayFile } from '../overlays/render.ts';
import type { Tour } from '../tour/schema.ts';
import { audioGraph, type Loudness } from './audio.ts';
import { EVENTS_FILE, type CaptureEvent } from '../capture/events.ts';
import { eventsFromTimeline, soundEvents, type SoundEvent } from './sfx.ts';
import { karaokeAss } from './subtitles.ts';
import { poseAt, screenShare, stagePlan } from '../stage/plan.ts';
import { readCues } from '../overlays/cues.ts';
import { spanFrames, stageFile } from '../stage/render.ts';
import { videoGraph } from './video.ts';

const run = promisify(execFile);

export interface ComposeInputs {
  capture: string;
  clips: { file: string; start: number }[];
  music?: { file: string; volume: number };
  overlays?: { file: string; start: number; end: number; fade: number }[];
  sfx?: SoundEvent[];
  sfxVolume?: number;
  subtitles?: string;
  // The device still and where the recording goes inside it.
  frame?: { file: string; screen: Rect; output: Size };
  // Stretches rendered on the stage, in place of the capture while the camera is off the flat.
  stage?: { file: string; start: number }[];
  duration: number;
  output: string;
  draft?: boolean;
}

function graphs({ capture, clips, music, overlays = [], sfx = [], sfxVolume = 1, subtitles, frame, stage = [], duration }: ComposeInputs, loudness?: Loudness) {
  const inputs = ['-i', capture, ...clips.flatMap(clip => ['-i', clip.file])];
  if (music) inputs.push('-stream_loop', '-1', '-i', music.file);
  const firstOverlay = 1 + clips.length + (music ? 1 : 0);
  inputs.push(...overlays.flatMap(overlay => ['-i', overlay.file]));
  if (frame) inputs.push('-i', frame.file);
  const firstStage = firstOverlay + overlays.length + (frame ? 1 : 0);
  inputs.push(...stage.flatMap(clip => ['-i', clip.file]));

  const audio = audioGraph({
    clips: clips.map((clip, i) => ({ input: i + 1, start: clip.start })),
    duration,
    sfx,
    sfxVolume,
    ...(loudness ? { loudness } : {}),
    ...(music ? { music: { input: clips.length + 1, volume: music.volume } } : {}),
  });
  const video = videoGraph(overlays.map((overlay, i) => ({ ...overlay, input: firstOverlay + i })), subtitles,
    frame ? { input: firstOverlay + overlays.length, screen: frame.screen, output: frame.output } : undefined,
    stage.map((clip, i) => ({ input: firstStage + i, start: clip.start })));
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
    '-c:v', 'libx264', ...(compose.draft ? ['-preset', 'veryfast', '-crf', '26'] : ['-preset', 'medium', '-crf', '15', '-tune', 'stillimage']), '-pix_fmt', 'yuv420p',
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

  let frame: ComposeInputs['frame'];
  if (tour.frame !== 'none') {
    if (!existsSync(path.join(outDir, FRAME_FILE))) throw new Error(`${FRAME_FILE} is missing; render without --from=compose first`);
    const output = deviceProfile(tour.device, quality).output;
    frame = { file: FRAME_FILE, screen: outputLayout({ frame: tour.frame, device: tour.device, canvas: deviceProfile(tour.device).output, output }).screen, output };
  }

  const fps = FPS[quality];
  // Without the capture's own log, every change the timeline planned is assumed to happen.
  const navigations = existsSync(path.join(outDir, EVENTS_FILE))
    ? (await capturedEvents(outDir, timeline)).filter(e => e.kind === 'navigate').map(e => e.time) : undefined;
  const plan = stagePlan(timeline, tour.device === 'mobile', navigations);
  const stage = plan.spans.map((span, i) => ({ file: stageFile(i), start: spanFrames(span, fps).first / fps }));
  const absent = stage.find(clip => !existsSync(path.join(outDir, clip.file)));
  if (absent) throw new Error(`${absent.file} is missing; render without --from=compose first`);

  const output = 'video.mp4';
  const inputs: ComposeInputs = {
    capture: 'capture.mp4', clips, overlays, duration: timeline.duration, output, draft: quality === 'preview',
    sfx: tour.sfx.enabled ? soundEvents(await capturedEvents(outDir, timeline), timeline.overlays, tour.sfx, {
      fps, screen: time => screenShare(poseAt(plan.moves, time)), ...await readCues(outDir).then(cues => (cues ? { cues } : {})),
    }) : [],
    sfxVolume: tour.sfx.volume,
    ...(subtitles ? { subtitles } : {}),
    ...(music ? { music } : {}),
    ...(frame ? { frame } : {}),
    ...(stage.length ? { stage } : {}),
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

async function capturedEvents(outDir: string, timeline: Timeline): Promise<CaptureEvent[]> {
  const file = path.join(outDir, EVENTS_FILE);
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) as CaptureEvent[] : eventsFromTimeline(timeline);
}

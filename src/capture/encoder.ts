import { spawn } from 'node:child_process';
import type { Size } from '../timeline/camera.ts';

export interface EncoderOptions {
  fps: number;
  output: Size;
  file: string;
  alpha?: boolean;
  draft?: boolean;
  // One frame in, this many out: ffmpeg decodes the still once and repeats it.
  repeat?: number;
}

// Frames arrive as PNGs of varying size (the camera crop); ffmpeg rebuilds the scale
// filter on each size change, so every frame lands at the output size.
// With alpha, frames are stored losslessly as QuickTime Animation (qtrle) so compose can lay
// them over the capture: the same pixels as PNG, 18 times faster to write and 30 to read, and a
// third of the size, since it only stores what changed since the frame before.
export function encoderArgs({ fps, output, file, alpha = false, draft = false, repeat }: EncoderOptions): string[] {
  const scale = `scale=${output.width}:${output.height}:flags=lanczos,setsar=1${repeat ? `,loop=loop=${repeat - 1}:size=1` : ''}`;
  const codec = alpha
    ? ['-vf', `${scale},format=argb`, '-c:v', 'qtrle']
    : ['-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', ...(draft ? ['-preset', 'veryfast', '-crf', '23'] : ['-preset', 'medium', '-crf', '12'])];
  return [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...codec, '-r', String(fps),
    ...(repeat ? ['-frames:v', String(repeat)] : []),
    file,
  ];
}

export interface Encoder {
  write(frame: Buffer): Promise<void>;
  finish(): Promise<void>;
}

export function startEncoder(options: EncoderOptions): Encoder {
  const ffmpeg = spawn('ffmpeg', encoderArgs(options), { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`))));
  });
  exited.catch(() => {});

  return {
    async write(frame) {
      if (!ffmpeg.stdin.write(frame)) {
        await Promise.race([new Promise(resolve => ffmpeg.stdin.once('drain', resolve)), exited]);
      }
    },
    async finish() {
      ffmpeg.stdin.end();
      await exited;
    },
  };
}

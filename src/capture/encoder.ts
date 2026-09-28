import { spawn } from 'node:child_process';
import type { Size } from '../timeline/camera.ts';

export interface EncoderOptions {
  fps: number;
  output: Size;
  file: string;
  alpha?: boolean;
}

// Frames arrive as PNGs of varying size (the camera crop); ffmpeg rebuilds the scale
// filter on each size change, so every frame lands at the output size.
// With alpha, frames are stored losslessly as PNG inside a .mov so compose can lay
// them over the capture.
export function encoderArgs({ fps, output, file, alpha = false }: EncoderOptions): string[] {
  const scale = `scale=${output.width}:${output.height}:flags=lanczos,setsar=1`;
  const codec = alpha
    ? ['-vf', `${scale},format=rgba`, '-c:v', 'png']
    : ['-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '12'];
  return [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...codec, '-r', String(fps),
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

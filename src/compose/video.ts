import type { Rect, Size } from '../timeline/camera.ts';

export interface OverlayInput {
  input: number;
  start: number;
  end: number;
  fade: number;
}

// The recording scaled into a device's screen, under the still that draws the device.
export interface FrameInput {
  input: number;
  screen: Rect;
  output: Size;
}

// Overlays stack in tour order above the capture; subtitles go last so they stay readable.
export function videoGraph(overlays: readonly OverlayInput[], subtitles?: string, frame?: FrameInput): string {
  const parts: string[] = [];
  let base = '[0:v]';
  if (frame) {
    const { screen, output } = frame;
    parts.push(`[0:v]scale=${screen.width}:${screen.height}:flags=lanczos,setsar=1,pad=${output.width}:${output.height}:${screen.x}:${screen.y}:color=black[screen]`);
    parts.push(`[screen][${frame.input}:v]overlay=0:0[framed]`);
    base = '[framed]';
  }

  overlays.forEach(({ input, start, end, fade }, i) => {
    const length = end - start;
    const f = Math.min(fade, length / 2);
    const filters = ['format=rgba'];
    if (f > 0) {
      filters.push(`fade=t=in:st=0:d=${f.toFixed(3)}:alpha=1`);
      filters.push(`fade=t=out:st=${(length - f).toFixed(3)}:d=${f.toFixed(3)}:alpha=1`);
    }
    filters.push(`setpts=PTS-STARTPTS+${start.toFixed(3)}/TB`);
    parts.push(`[${input}:v]${filters.join(',')}[o${i}]`);
    parts.push(`${base}[o${i}]overlay=eof_action=pass[b${i}]`);
    base = `[b${i}]`;
  });

  parts.push(subtitles ? `${base}ass=${subtitles}[vout]` : `${base}null[vout]`);
  return parts.join(';');
}

import { videoGraph } from '../compose/video.ts';
import type { Size } from '../timeline/camera.ts';
import type { Timeline, TimedOverlay } from '../timeline/build.ts';
import { overlayFile } from './render.ts';

// Mid grey under the overlays, so both a dark and a light design show their edges.
export const BACKDROP = '0x5a5a5a';

// Overlays alone over a flat backdrop: the probe and the catalog, which have no capture.
export function backdropArgs(overlays: readonly Pick<TimedOverlay, 'start' | 'end' | 'fade'>[], size: Size, fps: number, duration: number, output: string): string[] {
  const inputs = overlays.flatMap((_, i) => ['-i', overlayFile(i)]);
  const video = videoGraph(overlays.map((overlay, i) => ({ ...overlay, input: i + 1 })));
  return [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=${BACKDROP}:s=${size.width}x${size.height}:r=${fps}:d=${duration.toFixed(3)}`,
    ...inputs,
    '-filter_complex', `${video};[vout]format=yuv420p[v]`, '-map', '[v]',
    '-c:v', 'libx264', '-crf', '18', '-t', duration.toFixed(3), output,
  ];
}

export interface Shot {
  time: number;
  label: string;
}

// What a catalog entry is called in the legend: its template and the variant it shows.
export function describeOverlay(overlay: TimedOverlay): string {
  if (overlay.flow) return `flow · ${overlay.flow.shape}${overlay.flow.mode === 'card' ? ' (card)' : ''}`;
  const data = overlay.data as Record<string, unknown> | undefined;
  const variant = data?.type ?? data?.view ?? overlay.params.style;
  const card = data?.mode === 'card' ? ' (card)' : '';
  return `${overlay.src.replace(/\.html$/, '')}${variant ? ` · ${String(variant)}` : ''}${card}`;
}

// One still per entry, once everything in it has appeared: just before it ends, or just
// before its exit ("out", or the default exit of an opening or a chapter card).
const LEAVING = new Set(['opening.html', 'chapter-card.html']);

export function catalogShots(timeline: Pick<Timeline, 'overlays'>): Shot[] {
  return timeline.overlays
    .filter(overlay => overlay.src !== 'chapter.html')
    .map(overlay => {
      const length = overlay.end - overlay.start;
      const exit = overlay.beats.out ?? (LEAVING.has(overlay.src) ? length - 0.8 : length);
      return { time: overlay.start + Math.max(0.5, exit - 0.4), label: describeOverlay(overlay) };
    });
}

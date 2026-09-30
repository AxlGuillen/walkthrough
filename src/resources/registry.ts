import path from 'node:path';
import type { ZodType } from 'zod';
import { chartBeats, chartScene } from '../charts/layout.ts';
import { chartSchema } from '../charts/schema.ts';
import type { Size } from '../timeline/camera.ts';
import type { Anchor } from '../tour/schema.ts';

// Overlay templates that take structured `data`: its schema, the beats its parts appear on
// (each `at` inside the data), and the scene Node lays out for the page to paint.
export interface Resource<T> {
  schema: ZodType<T>;
  beats(data: T): Record<string, Anchor>;
  // beats are the overlay's, in seconds on its own clock.
  scene(data: T, canvas: Size, lang: string, beats: Record<string, number>): unknown;
}

const RESOURCES: Record<string, Resource<never>> = {
  'chart.html': { schema: chartSchema, beats: chartBeats, scene: chartScene } as unknown as Resource<never>,
};

// By file name, so a tour's own chart.html restyles the shared one with the same data.
export function resourceFor(src: string): Resource<unknown> | undefined {
  return RESOURCES[path.basename(src)] as Resource<unknown> | undefined;
}

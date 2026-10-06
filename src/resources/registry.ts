import path from 'node:path';
import type { ZodType } from 'zod';
import { boardBeats, boardScene, type BoardScene } from '../board/layout.ts';
import { boardSchema } from '../board/schema.ts';
import { asideBeats, asideScene, type AsideScene } from '../aside/layout.ts';
import { asideSchema } from '../aside/schema.ts';
import { chartBeats, chartScene, type ChartScene } from '../charts/layout.ts';
import { chartSchema } from '../charts/schema.ts';
import { codeBeats, codeScene, type CodeScene } from '../code/layout.ts';
import { codeSchema } from '../code/schema.ts';
import { corkboardBeats, corkboardScene, type CorkScene } from '../corkboard/layout.ts';
import { corkboardSchema } from '../corkboard/schema.ts';
import { roadmapBeats, roadmapScene, type RoadmapScene } from '../roadmap/layout.ts';
import { roadmapSchema } from '../roadmap/schema.ts';
import { tableBeats, tableScene, type TableScene } from '../table/layout.ts';
import { tableSchema } from '../table/schema.ts';
import type { Size } from '../timeline/camera.ts';
import type { Anchor } from '../tour/schema.ts';

// Overlay templates that take structured `data`: its schema, the beats its parts appear on
// (each `at` inside the data), and the scene Node lays out for the page to paint.
export interface Resource<T> {
  schema: ZodType<T>;
  beats(data: T): Record<string, Anchor>;
  // beats are the overlay's, in seconds on its own clock; duration is how long it is shown.
  scene(data: T, canvas: Size, lang: string, beats: Record<string, number>, duration: number): unknown;
  // What would not read well, for `check`: text that is cut, code that is still typing when
  // the overlay leaves.
  warnings(data: T, canvas: Size, lang: string, beats: Record<string, number>, duration: number): string[];
}

const RESOURCES: Record<string, Resource<never>> = {
  'aside.html': {
    schema: asideSchema, beats: asideBeats, scene: asideScene,
    warnings: (...args: Parameters<typeof asideScene>) => (asideScene(...args) as AsideScene).warnings,
  } as unknown as Resource<never>,
  'chart.html': {
    schema: chartSchema, beats: chartBeats, scene: chartScene,
    warnings: (...args: Parameters<typeof chartScene>) => (chartScene(...args) as ChartScene).truncated.map(text => `label "${text}" does not fit and is cut`),
  } as unknown as Resource<never>,
  'roadmap.html': {
    schema: roadmapSchema, beats: roadmapBeats, scene: roadmapScene,
    warnings: (...args: Parameters<typeof roadmapScene>) => (roadmapScene(...args) as RoadmapScene).warnings,
  } as unknown as Resource<never>,
  'table.html': {
    schema: tableSchema, beats: tableBeats, scene: tableScene,
    warnings: (...args: Parameters<typeof tableScene>) => (tableScene(...args) as TableScene).warnings,
  } as unknown as Resource<never>,
  'board.html': {
    schema: boardSchema, beats: boardBeats, scene: boardScene,
    warnings: (...args: Parameters<typeof boardScene>) => (boardScene(...args) as BoardScene).warnings,
  } as unknown as Resource<never>,
  'corkboard.html': {
    schema: corkboardSchema, beats: corkboardBeats, scene: corkboardScene,
    warnings: (...args: Parameters<typeof corkboardScene>) => (corkboardScene(...args) as CorkScene).warnings,
  } as unknown as Resource<never>,
  'code.html': {
    schema: codeSchema, beats: codeBeats, scene: codeScene,
    warnings: (...args: Parameters<typeof codeScene>) => (codeScene(...args) as CodeScene).warnings,
  } as unknown as Resource<never>,
};

// By file name, so a tour's own chart.html restyles the shared one with the same data.
export function resourceFor(src: string): Resource<unknown> | undefined {
  return RESOURCES[path.basename(src)] as Resource<unknown> | undefined;
}

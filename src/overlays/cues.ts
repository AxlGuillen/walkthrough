import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SOUNDS, type Sound } from '../compose/sounds.ts';

// A moment a template marked with walkthrough.cue(): seconds on the overlay's own clock.
export interface Cue {
  at: number;
  sound: Sound;
}

export const CUES_FILE = path.join('overlays', 'cues.json');

// What a page reported, kept only where it names a sound the mix knows and a real time.
export function validCues(reported: unknown): Cue[] {
  if (!Array.isArray(reported)) return [];
  return reported.flatMap(cue => {
    const { at, sound } = (cue ?? {}) as { at?: unknown; sound?: unknown };
    return typeof at === 'number' && Number.isFinite(at) && at >= 0 && SOUNDS.includes(sound as Sound) ? [{ at, sound: sound as Sound }] : [];
  });
}

// One list per overlay, in the timeline's order.
export async function writeCues(outDir: string, cues: readonly Cue[][]): Promise<void> {
  await writeFile(path.join(outDir, CUES_FILE), JSON.stringify(cues));
}

// Overlays rendered before cues existed have none: their sound falls on their first frame.
export async function readCues(outDir: string): Promise<Cue[][] | undefined> {
  const file = path.join(outDir, CUES_FILE);
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) as Cue[][] : undefined;
}

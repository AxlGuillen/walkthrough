import { parse } from 'yaml';
import { z } from 'zod';
import { tourSchema, type Tour } from './schema.ts';

export class TourError extends Error {
  override name = 'TourError';
}

export function parseTour(source: string): Tour {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    throw new TourError(`invalid YAML: ${(error as Error).message}`);
  }
  const result = tourSchema.safeParse(raw);
  if (!result.success) throw new TourError(z.prettifyError(result.error));
  return result.data;
}

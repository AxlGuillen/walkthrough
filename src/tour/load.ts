import { parse } from 'yaml';
import { z } from 'zod';
import { resourceFor } from '../resources/registry.ts';
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
  return withResources(result.data);
}

// A resource template's data is checked against its own schema here, so a bad chart fails
// on load, not mid-render; each `at` inside it becomes a beat (explicit beats win).
function withResources(tour: Tour): Tour {
  tour.segments.forEach((segment, s) => segment.overlays.forEach((overlay, o) => {
    const resource = resourceFor(overlay.src);
    if (!resource) return;
    const parsed = resource.schema.safeParse(overlay.data);
    if (!parsed.success) {
      throw new TourError(`segments[${s}].overlays[${o}] (${overlay.src}) data:\n${z.prettifyError(parsed.error)}`);
    }
    overlay.data = parsed.data;
    overlay.beats = { ...resource.beats(parsed.data), ...overlay.beats };
  }));
  return tour;
}

import { parse } from 'yaml';
import { z } from 'zod';
import { BrandError, BRANDS_DIR, loadBrand } from '../brands/brand.ts';
import { emojiProblem } from '../emoji/emoji.ts';
import { resourceFor } from '../resources/registry.ts';
import { tourSchema, type Tour } from './schema.ts';

export class TourError extends Error {
  override name = 'TourError';
}

export function parseTour(source: string, brandsDir = BRANDS_DIR): Tour {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    throw new TourError(`invalid YAML: ${(error as Error).message}`);
  }
  const result = tourSchema.safeParse(withBrand(raw, brandsDir));
  if (!result.success) throw new TourError(z.prettifyError(result.error));
  return withResources(result.data);
}

// A brand fills in what the tour leaves unsaid: its accent, theme and texture.
function withBrand(raw: unknown, brandsDir: string): unknown {
  if (!raw || typeof raw !== 'object' || typeof (raw as { brand?: unknown }).brand !== 'string') return raw;
  const tour = raw as Record<string, unknown>;
  try {
    const brand = loadBrand(tour.brand as string, brandsDir);
    return { accent: brand.accent, theme: brand.theme, texture: brand.texture, ...tour };
  } catch (error) {
    if (error instanceof BrandError) throw new TourError(error.message);
    throw error;
  }
}

// A resource template's data is checked against its own schema here, so a bad chart fails
// on load, not mid-render; each `at` inside it becomes a beat (explicit beats win).
function withResources(tour: Tour): Tour {
  tour.segments.forEach((segment, s) => segment.overlays.forEach((overlay, o) => {
    const emoji = overlay.params.emoji;
    const problem = emoji === undefined ? null : emojiProblem(emoji);
    if (problem) throw new TourError(`segments[${s}].overlays[${o}] (${overlay.src}) params: ${problem}`);
    if (overlay.src === 'sticker.html' && emoji === undefined) throw new TourError(`segments[${s}].overlays[${o}] (sticker.html) needs params.emoji`);
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

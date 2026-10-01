import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

export const BRANDS_DIR = path.resolve(import.meta.dirname, '../../assets/brands');
export const TEXTURES = ['plain', 'grain', 'dots', 'lines', 'mesh', 'brand'] as const;
export type Texture = (typeof TEXTURES)[number];

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a #RRGGBB color');
// One image for both themes, or one for dark grounds and one for light ones.
const image = z.union([z.string().min(1), z.strictObject({ dark: z.string().min(1), light: z.string().min(1) })]);

const brandSchema = z.strictObject({
  name: z.string().trim().min(1),
  accent: color,
  // The brand texture's two colors; the first is usually the accent.
  colors: z.tuple([color, color]),
  theme: z.enum(['dark', 'light']).default('dark'),
  texture: z.enum(TEXTURES).default('plain'),
  // logo: the full mark, wide or square; mark: a small square one (watermark, openings).
  logo: image.optional(),
  mark: image.optional(),
}).refine(b => b.logo || b.mark, 'a brand needs a logo or a mark');

export type Brand = z.infer<typeof brandSchema> & { id: string; dir: string };

export class BrandError extends Error {
  override name = 'BrandError';
}

export function loadBrand(id: string, dir = BRANDS_DIR): Brand {
  const file = path.join(dir, id, 'brand.yaml');
  if (!existsSync(file)) throw new BrandError(`brand "${id}" not found in ${dir}`);
  const parsed = brandSchema.safeParse(parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new BrandError(`${file}:\n${z.prettifyError(parsed.error)}`);
  const brand = { ...parsed.data, id, dir: path.join(dir, id) };
  for (const name of [brand.logo, brand.mark].flatMap(i => (i === undefined ? [] : typeof i === 'string' ? [i] : [i.dark, i.light]))) {
    if (!existsSync(path.join(brand.dir, name))) throw new BrandError(`brand "${id}": ${name} is missing`);
  }
  return brand;
}

// The file to show on a ground of this theme, as a URL a page can load.
export function brandImage(brand: Brand, which: 'logo' | 'mark', theme: 'dark' | 'light'): string | undefined {
  const image = brand[which] ?? brand[which === 'logo' ? 'mark' : 'logo'];
  if (!image) return undefined;
  return pathToFileURL(path.join(brand.dir, typeof image === 'string' ? image : image[theme])).href;
}

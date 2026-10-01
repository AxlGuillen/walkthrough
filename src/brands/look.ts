import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OverlayLook } from '../overlays/render.ts';
import type { Tour } from '../tour/schema.ts';
import { brandImage, loadBrand, type Brand } from './brand.ts';

// Width over height of an image: an SVG's viewBox or size, a raster's pixels.
export function imageAspect(url: string): number {
  const file = fileURLToPath(url);
  if (file.endsWith('.svg')) {
    const svg = readFileSync(file, 'utf8');
    const box = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
    if (box) return Number(box[1]) / Number(box[2]);
    const size = /width="([\d.]+)[^"]*"\s+height="([\d.]+)/.exec(svg);
    return size ? Number(size[1]) / Number(size[2]) : 1;
  }
  const [width, height] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
    .toString().trim().split(',').map(Number) as [number, number];
  return width / height;
}

// A square image fits a ring and a corner; a wide one sits on a line of its own.
const SQUARE = 1.4;

export interface BrandLook {
  // The widest image, for a line above a title; the squarest, for a ring or a corner.
  logo?: string;
  mark?: string;
  markSquare: boolean;
}

export function brandLook(brand: Brand, theme: 'dark' | 'light'): BrandLook {
  const images = [...new Set([brandImage(brand, 'logo', theme), brandImage(brand, 'mark', theme)].filter((u): u is string => !!u))]
    .map(url => ({ url, aspect: imageAspect(url) }));
  const widest = [...images].sort((a, b) => b.aspect - a.aspect)[0];
  const squarest = [...images].sort((a, b) => Math.abs(Math.log(a.aspect)) - Math.abs(Math.log(b.aspect)))[0];
  return {
    ...(widest ? { logo: widest.url } : {}),
    ...(squarest ? { mark: squarest.url } : {}),
    markSquare: !!squarest && squarest.aspect < SQUARE,
  };
}

// What every overlay of a tour learns about its look.
export function tourLook(tour: Pick<Tour, 'accent' | 'theme' | 'language' | 'texture' | 'brand'> & { emojiStyle?: Tour['emojiStyle'] }): OverlayLook {
  const look: OverlayLook = { accent: tour.accent, theme: tour.theme, lang: tour.language, texture: tour.texture, ...(tour.emojiStyle === '3d' ? { emojiStyle: '3d' } : {}) };
  if (!tour.brand) return look;
  const brand = loadBrand(tour.brand);
  const images = brandLook(brand, tour.theme);
  return {
    ...look, brand: brand.name, colors: brand.colors.join(','),
    ...(images.logo ? { brandLogo: images.logo } : {}),
    ...(images.mark ? { brandMark: images.mark, markShape: images.markSquare ? 'square' : 'wide' } : {}),
  };
}

// A look from loose options (the probe, the catalog): a brand's choices unless overridden.
export function lookFrom(options: { brand?: string | undefined; accent?: string | undefined; theme?: string | undefined; texture?: string | undefined; lang?: string | undefined; emojiStyle?: string | undefined }): OverlayLook {
  const brand = options.brand ? loadBrand(options.brand) : undefined;
  const theme = options.theme === 'light' || options.theme === 'dark' ? options.theme : brand?.theme ?? 'dark';
  return tourLook({
    accent: options.accent ?? brand?.accent ?? '#FF3B5C', theme, language: options.lang === 'en' ? 'en' : 'es',
    texture: (options.texture ?? brand?.texture ?? 'plain') as Tour['texture'], ...(options.brand ? { brand: options.brand } : {}),
    ...(options.emojiStyle === '3d' ? { emojiStyle: '3d' as const } : {}),
  });
}

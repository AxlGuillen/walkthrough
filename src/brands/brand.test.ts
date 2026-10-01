import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BRANDS_DIR, brandImage, loadBrand } from './brand.ts';
import { brandLook, imageAspect, tourLook } from './look.ts';

describe('the shipped brands', () => {
  for (const id of ['4xl', 'urvenue', 'dymmsa']) {
    it(`${id} loads with its images present`, () => {
      const brand = loadBrand(id);
      expect(brand.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(brandImage(brand, 'logo', 'dark')).toMatch(/^file:\/\//);
    });
  }

  it('picks the widest image for a line and the squarest for a ring', () => {
    const dymmsa = brandLook(loadBrand('dymmsa'), 'dark');
    expect(dymmsa.logo).toMatch(/mark\.webp$/);
    expect(dymmsa.mark).toMatch(/logo\.webp$/);
    expect(dymmsa.markSquare).toBe(false);
    expect(brandLook(loadBrand('4xl'), 'dark')).toMatchObject({ markSquare: true });
    expect(brandLook(loadBrand('urvenue'), 'light').logo).toMatch(/logo-light\.svg$/);
    expect(imageAspect(brandImage(loadBrand('urvenue'), 'logo', 'dark')!)).toBeCloseTo(142 / 42, 1);
  });

  it('gives overlays the brand name, colors and images', () => {
    const look = tourLook({ accent: '#DC2626', theme: 'dark', language: 'es', texture: 'lines', brand: 'dymmsa' });
    expect(look).toMatchObject({ brand: 'DYMMSA', colors: '#DC2626,#7F1D1D', texture: 'lines', markShape: 'wide' });
    expect(tourLook({ accent: '#FF3B5C', theme: 'dark', language: 'es', texture: 'plain' })).toEqual({ accent: '#FF3B5C', theme: 'dark', lang: 'es', texture: 'plain' });
  });
});

describe('loadBrand', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'brands-'));
    await mkdir(path.join(dir, 'broken'));
    await writeFile(path.join(dir, 'broken', 'brand.yaml'), 'name: X\naccent: red\ncolors: ["#000000", "#ffffff"]\nlogo: gone.svg\n');
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('reports what is wrong with a brand', () => {
    expect(() => loadBrand('broken', dir)).toThrow(/#RRGGBB/);
    expect(() => loadBrand('nope', dir)).toThrow(/not found/);
    expect(BRANDS_DIR.endsWith(path.join('assets', 'brands'))).toBe(true);
  });
});

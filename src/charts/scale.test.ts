import { describe, expect, it } from 'vitest';
import { formatChange, formatNumber, niceScale, unitSuffix } from './scale.ts';

describe('niceScale', () => {
  it('tops the data with a round number split into round steps', () => {
    expect(niceScale(163)).toEqual({ top: 200, step: 50, ticks: [0, 50, 100, 150, 200] });
    expect(niceScale(79)).toMatchObject({ top: 80, step: 20 });
    expect(niceScale(0.9)).toMatchObject({ top: 1, step: 0.25 });
    expect(niceScale(1284).top).toBe(1500);
    expect(niceScale(0).top).toBe(1);
  });
});

describe('number formats', () => {
  it('write numbers the Mexican or US way, with symbols stuck on and words spaced', () => {
    expect(formatNumber(1284, { lang: 'es' })).toBe('1,284');
    expect(formatNumber(12.5, { lang: 'en', decimals: 1, prefix: '$' })).toBe('$12.5');
    expect(formatNumber(68, { lang: 'es', unit: '%' })).toBe('68%');
    expect(formatNumber(45, { lang: 'es', unit: 'min' })).toBe('45 min');
    expect(unitSuffix('')).toBe('');
  });

  it('states the change between two values', () => {
    expect(formatChange(45, 3, 'es')).toBe('−93%');
    expect(formatChange(20, 22, 'es')).toBe('+10%');
    expect(formatChange(100, 104.5, 'en')).toBe('+4.5%');
    expect(formatChange(0, 5, 'es')).toBe('');
  });
});

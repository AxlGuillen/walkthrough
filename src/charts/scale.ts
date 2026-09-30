// Axes that read at a glance: a top that is a round number just above the data, split into
// a few equal round steps (1, 2, 2.5 or 5 times a power of ten).
export function niceScale(max: number, steps = 4): { top: number; step: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const rough = max / steps;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= rough)!;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => round(i * step));
  return { top: round(top), step: round(step), ticks };
}

function round(value: number): number {
  return Number(value.toPrecision(12));
}

export interface NumberStyle {
  lang: string;
  decimals?: number;
  prefix?: string;
  unit?: string;
}

// Plain es writes 1500 without a separator; the Spanish narration is Mexican. Same rule as
// kit.js, so a number counted in the page ends on the text Node laid out.
export function localeOf(lang: string): string {
  return ({ es: 'es-MX', en: 'en-US' } as Record<string, string>)[lang] ?? lang;
}

// A word unit takes a space ("45 min"); a symbol sticks to the number ("68%").
export function unitSuffix(unit = ''): string {
  if (!unit) return '';
  return /^\p{L}/u.test(unit) ? ` ${unit}` : unit;
}

export function formatNumber(value: number, { lang, decimals = 0, prefix = '', unit = '' }: NumberStyle): string {
  const text = new Intl.NumberFormat(localeOf(lang), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return `${prefix}${text}${unitSuffix(unit)}`;
}

// "−93%", "+12%": the change from one value to another, for a comparison's chip.
export function formatChange(from: number, to: number, lang: string): string {
  if (from === 0) return '';
  const change = ((to - from) / Math.abs(from)) * 100;
  const text = new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: Math.abs(change) < 10 ? 1 : 0 }).format(Math.abs(change));
  return `${change < 0 ? '−' : '+'}${text}%`;
}

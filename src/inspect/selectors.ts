import type { ElementInfo } from './snapshot.ts';

// Stable before descriptive: anchors the app put there on purpose survive redesigns,
// visible text survives less, and generated ids or classes not at all.
export function selectorFor(el: ElementInfo): string | null {
  if (el.dataTour) return `[data-tour=${quoteIfNeeded(el.dataTour)}]`;
  if (el.testId) return `[data-testid=${quoteIfNeeded(el.testId)}]`;
  if (el.tag === 'a' && el.href?.startsWith('/')) return `a[href="${el.href}"]`;
  if (el.ariaLabel && el.ariaLabel.length <= 40) return `${el.tag}[aria-label="${escape(el.ariaLabel)}"]`;
  if (el.id && !looksGenerated(el.id)) return `#${el.id}`;
  if (el.placeholder) return `${el.tag}[placeholder="${escape(el.placeholder)}"]`;
  if (el.name) return `${el.tag}[name="${escape(el.name)}"]`;
  const text = el.text.trim();
  if (text && text.length <= 40) return `${el.role ? `[role=${el.role}]` : el.tag}:has-text("${escape(text)}")`;
  return null;
}

export function looksGenerated(id: string): boolean {
  return /^[:_]|^radix-|^headlessui-|^(mui|react|ember|v)-?\d|\d{3,}|[a-f0-9]{8,}/i.test(id);
}

// A selector naming a ticket key or a long number breaks as soon as the data moves on.
export function dataDependent(selector: string): boolean {
  return /\b[A-Z][A-Z0-9]+-\d+\b/.test(selector) || /\d{3,}/.test(selector.replace(/\[href="[^"]*"\]/g, ''));
}

export interface Suggestion {
  selector: string;
  text: string;
  score: number;
}

// Ranks the page's own stable selectors by how much they share with the one that failed.
export function suggest(failed: string, candidates: readonly ElementInfo[], limit = 3): Suggestion[] {
  const wanted = keywords(failed);
  if (wanted.length === 0) return [];
  const seen = new Set<string>();
  return candidates
    .flatMap(el => {
      const selector = selectorFor(el);
      if (!selector || seen.has(selector)) return [];
      seen.add(selector);
      const have = keywords(`${selector} ${el.text}`);
      const score = wanted.reduce((sum, word) => sum + Math.max(0, ...have.map(h => similarity(word, h))), 0) / wanted.length;
      return score >= 0.6 ? [{ selector, text: el.text, score }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function keywords(text: string): string[] {
  const ignore = new Set(['data', 'tour', 'testid', 'has', 'text', 'aria', 'label', 'role', 'href', 'button', 'nth']);
  return (text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => word.length > 1 && !ignore.has(word));
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

function levenshtein(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
}

function quoteIfNeeded(value: string): string {
  return /^[\w-]+$/.test(value) ? value : `"${escape(value)}"`;
}

function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

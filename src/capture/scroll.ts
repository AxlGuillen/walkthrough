import type { Page } from 'playwright-core';
import type { Point } from '../effects/sketch.ts';

export type ScrollMode = 'reveal' | 'center' | 'top' | 'bottom';

export interface ScrollPlan {
  key: string;
  from: Point;
  to: Point;
}

export interface ScrollAnimation extends ScrollPlan {
  start: number;
  duration: number;
}

export interface PlannedScroll {
  plans: ScrollPlan[];
  // How far the target moves on screen once every plan has run.
  shift: Point;
}

const REVEAL_MARGIN = 48;
// Centering a zoom target that is already almost centered would only add motion.
const CENTER_TOLERANCE = 0.1;

export function scrollDuration(plans: readonly ScrollPlan[]): number {
  const distance = Math.max(0, ...plans.map(p => Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y)));
  return Math.min(1.1, Math.max(0.45, 0.4 + distance / 2500));
}

export function scrollPositionAt({ from, to, start, duration }: ScrollAnimation, time: number): Point {
  const t = Math.min(1, Math.max(0, (time - start) / duration));
  // Sine, not cubic: its peak speed is ~1.6× the average instead of 3×, which reads as a
  // glide rather than a lurch across a long page.
  const eased = (1 - Math.cos(Math.PI * t)) / 2;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

// An animation needs applying on every frame it overlaps, including the one it ends in,
// so it always lands exactly on its target.
export function scrollsDue(animations: readonly ScrollAnimation[], previous: number, time: number): ScrollAnimation[] {
  return animations.filter(a => a.start <= time + 1e-9 && a.start + a.duration > previous - 1e-9);
}

export async function applyScrolls(page: Page, animations: readonly ScrollAnimation[], previous: number, time: number): Promise<boolean> {
  const due = scrollsDue(animations, previous, time);
  if (due.length === 0) return false;
  const positions = due.map(a => ({ key: a.key, ...scrollPositionAt(a, time) }));
  await page.evaluate(list => { for (const p of list) window.__walkthrough?.scrollTo?.(p.key, p.x, p.y); }, positions);
  return true;
}

export async function planScroll(
  page: Page, target: string | null, mode: ScrollMode, within?: string,
): Promise<PlannedScroll> {
  const container = within ? await page.locator(within).first().elementHandle() : null;
  const args = { within: container, mode, margin: REVEAL_MARGIN, tolerance: CENTER_TOLERANCE };
  if (target) return page.locator(target).first().evaluate(measureScroll, args);
  return page.evaluate(measureEdge, { within: container, toBottom: mode === 'bottom' });
}

// Runs in the page: self-contained on purpose, Playwright serializes it as source.
function measureScroll(
  target: Element,
  { within, mode, margin, tolerance }: { within: Element | null; mode: ScrollMode; margin: number; tolerance: number },
): PlannedScroll {
  const root = document.scrollingElement ?? document.documentElement;
  const container = within;
  const scrollable = (el: Element, axis: 'x' | 'y') => {
    if (el === root) return axis === 'x' ? root.scrollWidth > innerWidth : root.scrollHeight > innerHeight;
    const style = getComputedStyle(el);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    const room = axis === 'x' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
    return room && (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay');
  };
  const chain: Element[] = [];
  if (container) chain.push(container);
  else {
    for (let el = target.parentElement; el && el !== root && el !== document.body; el = el.parentElement) {
      if (scrollable(el, 'x') || scrollable(el, 'y')) chain.push(el);
    }
    chain.push(root);
  }

  const w = window as unknown as { __walkthroughScrollKeys?: number };
  const keyOf = (el: Element) => {
    if (el === root) return 'window';
    let key = el.getAttribute('data-walkthrough-scroll');
    if (!key) {
      key = String((w.__walkthroughScrollKeys = (w.__walkthroughScrollKeys ?? 0) + 1));
      el.setAttribute('data-walkthrough-scroll', key);
    }
    return key;
  };

  const plans: ScrollPlan[] = [];
  const shift = { x: 0, y: 0 };
  const box = target.getBoundingClientRect();
  for (const el of chain) {
    const isRoot = el === root;
    const view = isRoot ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : el.getBoundingClientRect();
    const from = { x: isRoot ? scrollX : el.scrollLeft, y: isRoot ? scrollY : el.scrollTop };
    const max = {
      x: el.scrollWidth - (isRoot ? innerWidth : el.clientWidth),
      y: el.scrollHeight - (isRoot ? innerHeight : el.clientHeight),
    };
    const to = { ...from };
    if (mode === 'top') to.y = 0;
    else if (mode === 'bottom') to.y = max.y;
    else {
      for (const axis of ['x', 'y'] as const) {
        if (!scrollable(el, axis)) continue;
        const [low, high] = axis === 'x' ? [view.left, view.right] : [view.top, view.bottom];
        const [start, end] = axis === 'x' ? [box.left - shift.x, box.right - shift.x] : [box.top - shift.y, box.bottom - shift.y];
        let delta = 0;
        if (mode === 'center') {
          delta = (start + end) / 2 - (low + high) / 2;
          if (Math.abs(delta) < (high - low) * tolerance) delta = 0;
        } else if (start < low + margin) delta = start - low - margin;
        else if (end > high - margin) delta = Math.min(end - high + margin, start - low - margin);
        to[axis] = Math.min(Math.max(from[axis] + delta, 0), Math.max(0, max[axis]));
      }
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
      plans.push({ key: keyOf(el), from, to });
      shift.x += dx;
      shift.y += dy;
    }
  }
  return { plans, shift };
}

// Runs in the page: scrolls a container (or the page) to its top or bottom.
function measureEdge({ within, toBottom }: { within: Element | null; toBottom: boolean }): PlannedScroll {
  const root = document.scrollingElement ?? document.documentElement;
  const el = within ?? root;
  const isRoot = el === root;
  const from = { x: isRoot ? scrollX : el.scrollLeft, y: isRoot ? scrollY : el.scrollTop };
  const maxY = el.scrollHeight - (isRoot ? innerHeight : el.clientHeight);
  const to = { x: from.x, y: toBottom ? Math.max(0, maxY) : 0 };
  if (Math.abs(to.y - from.y) < 1) return { plans: [], shift: { x: 0, y: 0 } };
  const w = window as unknown as { __walkthroughScrollKeys?: number };
  let key = 'window';
  if (!isRoot) {
    key = el.getAttribute('data-walkthrough-scroll') ?? String((w.__walkthroughScrollKeys = (w.__walkthroughScrollKeys ?? 0) + 1));
    el.setAttribute('data-walkthrough-scroll', key);
  }
  return { plans: [{ key, from, to }], shift: { x: 0, y: to.y - from.y } };
}

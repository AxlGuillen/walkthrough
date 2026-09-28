import type { Locator, Page } from 'playwright-core';
import type { Point } from '../effects/sketch.ts';
import { fitRect, type FitOptions, type Rect } from '../timeline/camera.ts';
import type { DeviceProfile } from './devices.ts';

export interface Aim {
  point: Point;
  position: Point;
}

// Aims at the middle of the element's text when it has some: a full-width row's center
// can sit far from anything the viewer is reading. Playwright acts on the same point.
export async function aimAt(target: Locator): Promise<Aim | null> {
  if ((await target.count()) === 0) return null;
  return target.evaluate(element => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const left = Math.max(box.left, text.left);
    const right = Math.min(box.right, text.right);
    const top = Math.max(box.top, text.top);
    const bottom = Math.min(box.bottom, text.bottom);
    const useText = text.width > 0 && text.height > 0 && right > left && bottom > top;
    const point = useText
      ? { x: (left + right) / 2, y: (top + bottom) / 2 }
      : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    return { point, position: { x: point.x - box.left, y: point.y - box.top } };
  }).catch(() => null);
}

export async function visibleBox(target: Locator, what: string): Promise<Rect> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${what} is not visible`);
  return box;
}

export async function zoomRect(page: Page, selector: string, device: DeviceProfile, fit: FitOptions): Promise<Rect> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await visibleBox(target, `zoom target "${selector}"`);
  return fitRect(box, device.viewport, fit);
}

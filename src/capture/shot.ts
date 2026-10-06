import type { Page } from 'playwright-core';
import type { Rect, Size } from '../timeline/camera.ts';

export interface Shooter {
  // A lossless PNG of the clip (CSS px of the viewport; the whole viewport without one).
  shot(clip?: Rect): Promise<Buffer>;
}

export interface ShooterOptions {
  viewport: Size;
  deviceScaleFactor: number;
  // A clear page background instead of white, for overlays laid over the video.
  transparent?: boolean;
}

const FONTS_TIMEOUT = 10_000;

// Chrome's PNG compressed for speed: the same pixels as page.screenshot() (shot.integration.test.ts)
// in a sixth of the time on a 4K frame. It also skips what Playwright does around every shot
// (re-styling the page and walking its DOM to hide the caret), which a frame-by-frame render
// pays thousands of times: the caret is hidden once, by hideCaret().
export async function shooter(page: Page, { viewport, deviceScaleFactor, transparent = false }: ShooterOptions): Promise<Shooter> {
  const cdp = await page.context().newCDPSession(page);
  if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  return {
    async shot(clip = { x: 0, y: 0, ...viewport }) {
      // Like Playwright: a web font still on its way would be shot in its fallback.
      await Promise.race([page.evaluate(() => document.fonts.ready), new Promise(resolve => setTimeout(resolve, FONTS_TIMEOUT))]);
      const { cssVisualViewport } = await cdp.send('Page.getLayoutMetrics');
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        optimizeForSpeed: true,
        captureBeyondViewport: false,
        clip: { ...documentClip(clip, viewport, cssVisualViewport), scale: deviceScaleFactor },
      });
      return Buffer.from(data, 'base64');
    },
  };
}

// The clip in page coordinates, trimmed to the viewport as Playwright trims it.
export function documentClip(clip: Rect, viewport: Size, scroll: { pageX: number; pageY: number }): Rect {
  const x1 = Math.max(0, Math.min(clip.x, viewport.width));
  const y1 = Math.max(0, Math.min(clip.y, viewport.height));
  const x2 = Math.max(0, Math.min(clip.x + clip.width, viewport.width));
  const y2 = Math.max(0, Math.min(clip.y + clip.height, viewport.height));
  if (x2 <= x1 || y2 <= y1) throw new Error('the clip is outside the viewport');
  return { x: scroll.pageX + x1, y: scroll.pageY + y1, width: x2 - x1, height: y2 - y1 };
}

// Playwright hides the text caret in every shot; this hides it for good, in the light DOM.
export function hideCaret(): void {
  const style = document.createElement('style');
  style.textContent = 'input, textarea, [contenteditable] { caret-color: transparent !important; }';
  const add = () => document.documentElement.append(style);
  if (document.documentElement) add();
  else document.addEventListener('DOMContentLoaded', add, { once: true });
}

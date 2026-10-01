import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { captureDevice, frameLayout, scaleLayout } from './layout.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;
const frame = { x: 0, y: 0, ...desktop };

describe('captureDevice', () => {
  it('records as a phone in a phone and as a desktop in a browser or a laptop', () => {
    expect(captureDevice('desktop', 'phone')).toBe('mobile');
    expect(captureDevice('mobile', 'laptop')).toBe('desktop');
    expect(captureDevice('mobile', 'browser')).toBe('desktop');
    expect(captureDevice('mobile', 'none')).toBe('mobile');
  });
});

describe('frameLayout', () => {
  for (const kind of ['browser', 'laptop', 'phone'] as const) {
    for (const [name, output] of [['16:9', desktop], ['9:16', mobile]] as const) {
      it(`${kind} in ${name}: the screen keeps the recording's aspect, inside a device inside the video`, () => {
        const aspect = kind === 'phone' ? 9 / 16 : 16 / 9;
        const layout = frameLayout(kind, output, aspect);
        const video = { ...frame, ...output };
        expect(layout.screen.width / layout.screen.height).toBeCloseTo(aspect, 1);
        expect(contains(layout.body, layout.screen)).toBe(true);
        for (const part of [layout.body, layout.deck, layout.bar, layout.status, layout.island].filter(Boolean) as Rect[]) expect(contains(video, part)).toBe(true);
        for (const n of Object.values(layout.screen)) expect(n % 2).toBe(0);
        // Centered, with air on every side.
        const all = layout.deck ? { ...layout.body, x: layout.deck.x, width: layout.deck.width, height: layout.deck.y + layout.deck.height - layout.body.y } : layout.body;
        expect(Math.abs(all.x + all.width / 2 - output.width / 2)).toBeLessThanOrEqual(2);
        expect(all.width / output.width).toBeLessThanOrEqual(0.861);
        expect(all.height / output.height).toBeLessThanOrEqual(0.841);
      });
    }
  }

  it('sits a laptop deck under its lid and a browser bar over its screen', () => {
    const laptop = frameLayout('laptop', desktop, 16 / 9);
    expect(laptop.deck!.y).toBeCloseTo(laptop.body.y + laptop.body.height);
    expect(laptop.deck!.width).toBeGreaterThan(laptop.body.width);
    const browser = frameLayout('browser', desktop, 16 / 9);
    expect(browser.bar!.y + browser.bar!.height).toBe(browser.screen.y);
  });

  it('scales to a preview with the screen still in even pixels', () => {
    const half = scaleLayout(frameLayout('phone', desktop, 9 / 16), 0.5);
    for (const n of Object.values(half.screen)) expect(n % 2).toBe(0);
    expect(half.screen.width).toBeCloseTo(frameLayout('phone', desktop, 9 / 16).screen.width / 2, -1);
  });
});

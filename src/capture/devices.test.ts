import { describe, expect, it } from 'vitest';
import { deviceProfile } from './devices.ts';

describe('deviceProfile', () => {
  it('outputs 16:9 on desktop and 9:16 on mobile', () => {
    expect(deviceProfile('desktop').output).toEqual({ width: 1920, height: 1080 });
    expect(deviceProfile('mobile').output).toEqual({ width: 1080, height: 1920 });
  });

  it('keeps the viewport at the output aspect ratio so the camera never letterboxes', () => {
    for (const device of ['desktop', 'mobile'] as const) {
      const { viewport, output } = deviceProfile(device);
      expect(viewport.width / viewport.height).toBeCloseTo(output.width / output.height, 2);
    }
  });

  it('renders enough pixels for the tightest zoom', () => {
    const { viewport, output, deviceScaleFactor } = deviceProfile('desktop', 2);
    expect((viewport.width / 2) * deviceScaleFactor).toBe(output.width);
  });

  it('emulates a phone on mobile', () => {
    expect(deviceProfile('mobile')).toMatchObject({ isMobile: true, hasTouch: true, userAgent: expect.stringContaining('iPhone') });
  });
});

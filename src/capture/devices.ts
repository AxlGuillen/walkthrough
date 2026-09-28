import { devices } from 'playwright-core';
import { MAX_ZOOM, type Size } from '../timeline/camera.ts';

export type Device = 'desktop' | 'mobile';
export type Quality = 'final' | 'preview';

export const FPS: Record<Quality, number> = { final: 30, preview: 15 };

export interface DeviceProfile {
  viewport: Size;
  output: Size;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
}

const PRESETS: Record<Device, Omit<DeviceProfile, 'deviceScaleFactor'>> = {
  desktop: {
    viewport: { width: 1600, height: 900 },
    output: { width: 1920, height: 1080 },
    isMobile: false,
    hasTouch: false,
  },
  mobile: {
    viewport: { width: 405, height: 720 },
    output: { width: 1080, height: 1920 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 15'].userAgent,
  },
};

// Rendering at this scale keeps the tightest zoom at one source pixel per output pixel.
// A preview keeps the viewport, so the app lays out exactly as in the final video, and
// only halves the output: a quarter of the pixels per frame.
export function deviceProfile(device: Device, quality: Quality = 'final', maxZoom = MAX_ZOOM): DeviceProfile {
  const preset = PRESETS[device];
  const scale = quality === 'preview' ? 0.5 : 1;
  const output = { width: preset.output.width * scale, height: preset.output.height * scale };
  return { ...preset, output, deviceScaleFactor: (output.width * maxZoom) / preset.viewport.width };
}

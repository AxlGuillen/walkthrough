import { devices } from 'playwright-core';
import { MAX_ZOOM, type Size } from '../timeline/camera.ts';

export type Device = 'desktop' | 'mobile';

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
export function deviceProfile(device: Device, maxZoom = MAX_ZOOM): DeviceProfile {
  const preset = PRESETS[device];
  return { ...preset, deviceScaleFactor: (preset.output.width * maxZoom) / preset.viewport.width };
}

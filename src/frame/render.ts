import path from 'node:path';
import { chromium } from 'playwright-core';
import { deviceProfile, type Device } from '../capture/devices.ts';
import { overlayUrl, TEMPLATES_DIR, type OverlayLook } from '../overlays/render.ts';
import type { Size } from '../timeline/camera.ts';
import { captureDevice, frameLayout, scaleLayout, type Frame, type FrameLayout } from './layout.ts';

export const FRAME_FILE = 'frame.png';

export interface FrameOptions {
  frame: Exclude<Frame, 'none'>;
  device: Device;
  url: string;
  tourDir: string;
  outDir: string;
  canvas: Size;
  output: Size;
  look?: OverlayLook;
}

// The layout on the output, where ffmpeg puts the recording.
export function outputLayout({ frame, device, canvas, output }: Pick<FrameOptions, 'frame' | 'device' | 'canvas' | 'output'>): FrameLayout {
  const recorded = deviceProfile(captureDevice(device, frame)).output;
  return scaleLayout(frameLayout(frame, canvas, recorded.width / recorded.height), output.width / canvas.width);
}

// Laid out on the full canvas like an overlay and shot at the output's size, so a preview
// shows the same frame, only smaller.
export async function renderFrame(options: FrameOptions): Promise<FrameLayout> {
  const { frame, device, url, tourDir, outDir, canvas, output, look = {} } = options;
  const recorded = deviceProfile(captureDevice(device, frame)).output;
  const layout = frameLayout(frame, canvas, recorded.width / recorded.height);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: canvas, deviceScaleFactor: output.width / canvas.width });
    await page.goto(overlayUrl(path.join(TEMPLATES_DIR, 'frame.html'), tourDir, { layout: JSON.stringify(layout), host: new URL(url).host }, look));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, FRAME_FILE), omitBackground: true });
  } finally {
    await browser.close();
  }
  return outputLayout(options);
}

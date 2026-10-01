import type { Device } from '../capture/devices.ts';
import type { Rect, Size } from '../timeline/camera.ts';

export const FRAMES = ['none', 'browser', 'laptop', 'phone'] as const;
export type Frame = (typeof FRAMES)[number];

// A phone frame records the app as a phone, whatever the video's format; a browser or a
// laptop records it as a desktop. Without a frame the video's format decides.
export function captureDevice(device: Device, frame: Frame): Device {
  if (frame === 'phone') return 'mobile';
  if (frame === 'browser' || frame === 'laptop') return 'desktop';
  return device;
}

// Everything frame.html draws and where ffmpeg puts the recording, in output pixels.
export interface FrameLayout {
  kind: Exclude<Frame, 'none'>;
  // The lid of a laptop, the window of a browser, the body of a phone.
  body: Rect;
  bodyRadius: number;
  screen: Rect;
  // Bottom corners; the top ones meet a bar or a status strip, so they are tighter.
  screenRadius: number;
  screenTopRadius: number;
  // A browser's title bar, above the screen.
  bar?: Rect;
  // A laptop's deck, below the lid.
  deck?: Rect;
  // A phone's status strip above the app, so its camera cutout never hides the app's header.
  status?: Rect;
  island?: Rect;
}

// The share of the video the device may fill: a little air on every side.
const ROOM = { landscape: { width: 0.86, height: 0.84 }, portrait: { width: 0.86, height: 0.8 } };

interface Shape {
  // The whole device, in screen widths, and where the screen sits inside it.
  width: number;
  height: (h: number) => number;
  screenAt: (h: number) => { x: number; y: number };
}

function shape(kind: FrameLayout['kind'], aspect: number): Shape {
  const h = 1 / aspect;
  switch (kind) {
    case 'browser': return { width: 1, height: () => h + 0.045, screenAt: () => ({ x: 0, y: 0.045 }) };
    case 'laptop': return { width: 1.2, height: () => h + 0.03 + 0.05 + 0.035, screenAt: () => ({ x: 0.1, y: 0.03 }) };
    case 'phone': return { width: 1.09, height: () => h + 0.09 + PHONE_STATUS, screenAt: () => ({ x: 0.045, y: 0.045 + PHONE_STATUS }) };
  }
}

const PHONE_STATUS = 0.11;
const even = (n: number) => Math.round(n / 2) * 2;

// The screen keeps the recording's aspect, so the capture only scales; its rect is in even
// pixels, as a yuv420 scale and pad need.
export function frameLayout(kind: FrameLayout['kind'], output: Size, captureAspect: number): FrameLayout {
  const room = output.height > output.width ? ROOM.portrait : ROOM.landscape;
  const s = shape(kind, captureAspect);
  const h = 1 / captureAspect;
  const unit = Math.min((output.width * room.width) / s.width, (output.height * room.height) / s.height(h));
  const width = s.width * unit;
  const height = s.height(h) * unit;
  const origin = { x: (output.width - width) / 2, y: (output.height - height) / 2 };
  const at = s.screenAt(h);
  const screen = { x: even(origin.x + at.x * unit), y: even(origin.y + at.y * unit), width: even(unit), height: even(unit * h) };

  switch (kind) {
    case 'browser': {
      const body = { x: screen.x, y: origin.y, width: screen.width, height: screen.y + screen.height - origin.y };
      return { kind, body, bodyRadius: unit * 0.012, screen, screenRadius: unit * 0.012, screenTopRadius: 0, bar: { x: body.x, y: body.y, width: body.width, height: screen.y - body.y } };
    }
    case 'laptop': {
      const bezel = unit * 0.03;
      const body = { x: screen.x - bezel, y: screen.y - bezel, width: screen.width + 2 * bezel, height: screen.height + bezel + unit * 0.05 };
      const deck = { x: origin.x, y: body.y + body.height, width, height: unit * 0.035 };
      return { kind, body, bodyRadius: unit * 0.03, screen, screenRadius: unit * 0.006, screenTopRadius: unit * 0.006, deck };
    }
    case 'phone': {
      const bezel = unit * 0.045;
      const status = { x: screen.x, y: screen.y - unit * PHONE_STATUS, width: screen.width, height: unit * PHONE_STATUS };
      const body = { x: screen.x - bezel, y: status.y - bezel, width: screen.width + 2 * bezel, height: screen.y + screen.height + bezel - (status.y - bezel) };
      const island = { x: screen.x + screen.width * 0.34, y: status.y + status.height * 0.2, width: screen.width * 0.32, height: status.height * 0.6 };
      return { kind, body, bodyRadius: unit * 0.17, screen, screenRadius: unit * 0.13, screenTopRadius: 0, status, island };
    }
  }
}

// Places a layout laid out on the full canvas onto a smaller output, as a preview needs.
export function scaleLayout(layout: FrameLayout, factor: number): FrameLayout {
  const rect = (r: Rect) => ({ x: r.x * factor, y: r.y * factor, width: r.width * factor, height: r.height * factor });
  const screen = layout.screen;
  return {
    ...layout,
    body: rect(layout.body), bodyRadius: layout.bodyRadius * factor, screenRadius: layout.screenRadius * factor, screenTopRadius: layout.screenTopRadius * factor,
    screen: { x: even(screen.x * factor), y: even(screen.y * factor), width: even(screen.width * factor), height: even(screen.height * factor) },
    ...(layout.bar ? { bar: rect(layout.bar) } : {}), ...(layout.deck ? { deck: rect(layout.deck) } : {}), ...(layout.status ? { status: rect(layout.status) } : {}), ...(layout.island ? { island: rect(layout.island) } : {}),
  };
}

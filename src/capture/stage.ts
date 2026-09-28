import type { Page } from 'playwright-core';
import { emptyPlan, type EffectsPlan } from '../effects/scene.ts';
import type { Timeline } from '../timeline/build.ts';
import { fullFrame, type CameraMove } from '../timeline/camera.ts';
import type { Tour } from '../tour/schema.ts';
import type { VirtualClock } from './clock.ts';
import type { DeviceProfile } from './devices.ts';
import type { CaptureEvent } from './events.ts';
import { prepSchedule, type PrepStep } from './schedule.ts';
import type { ScrollAnimation } from './scroll.ts';

// Everything a capture accumulates while it walks the timeline, frame by frame.
export interface Stage {
  page: Page;
  clock: VirtualClock;
  tour: Tour;
  device: DeviceProfile;
  time: number;
  camera: CameraMove[];
  effects: EffectsPlan;
  pending: PrepStep[];
  scrolls: ScrollAnimation[];
  log: CaptureEvent[];
  typing: { text: string; start: number; typed: number } | null;
}

export function createStage(page: Page, clock: VirtualClock, tour: Tour, device: DeviceProfile, timeline: Timeline): Stage {
  const home = fullFrame(device.viewport);
  return {
    page, clock, tour, device, time: 0, camera: [], typing: null, scrolls: [], log: [],
    effects: emptyPlan(device.isMobile ? 'touch' : 'mouse', { x: home.width / 2, y: home.height / 2 }),
    pending: prepSchedule(timeline.actions),
  };
}

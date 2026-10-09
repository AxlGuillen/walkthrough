import type { StageTransition } from '../tour/schema.ts';

// What actually happened during a capture, for anything downstream that must line up
// with it (sound effects): auto-scrolls and navigations are decided while capturing.
export type CaptureEvent =
  | { kind: 'click'; time: number }
  | { kind: 'type'; time: number; chars: number }
  | { kind: 'ring'; time: number; style?: string }
  | { kind: 'label'; time: number }
  // duration: how long the camera takes, so its sound lasts as long; older captures lack it.
  | { kind: 'zoom'; time: number; direction: 'in' | 'out'; duration?: number }
  // distance in CSS pixels, for the timing audit; older captures lack it.
  | { kind: 'scroll'; time: number; duration: number; distance?: number }
  // transition: the change the stage draws instead of the dissolve, when there is one.
  | { kind: 'navigate'; time: number; transition?: StageTransition }
  // A ring or label that faded early because its element was covered or went away.
  | { kind: 'cut'; time: number; mark: 'ring' | 'label'; shown: number };

export const EVENTS_FILE = 'events.json';

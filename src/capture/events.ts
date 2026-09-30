// What actually happened during a capture, for anything downstream that must line up
// with it (sound effects): auto-scrolls and navigations are decided while capturing.
export type CaptureEvent =
  | { kind: 'click'; time: number }
  | { kind: 'type'; time: number; chars: number }
  | { kind: 'ring'; time: number }
  | { kind: 'label'; time: number }
  | { kind: 'zoom'; time: number; direction: 'in' | 'out' }
  // distance in CSS pixels, for the timing audit; older captures lack it.
  | { kind: 'scroll'; time: number; duration: number; distance?: number }
  | { kind: 'navigate'; time: number }
  // A ring or label that faded early because its element was covered or went away.
  | { kind: 'cut'; time: number; mark: 'ring' | 'label'; shown: number };

export const EVENTS_FILE = 'events.json';

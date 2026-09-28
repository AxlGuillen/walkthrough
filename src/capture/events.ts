// What actually happened during a capture, for anything downstream that must line up
// with it (sound effects): auto-scrolls and navigations are decided while capturing.
export type CaptureEvent =
  | { kind: 'click'; time: number }
  | { kind: 'type'; time: number; chars: number }
  | { kind: 'ring'; time: number }
  | { kind: 'label'; time: number }
  | { kind: 'zoom'; time: number; direction: 'in' | 'out' }
  | { kind: 'scroll'; time: number; duration: number }
  | { kind: 'navigate'; time: number };

export const EVENTS_FILE = 'events.json';

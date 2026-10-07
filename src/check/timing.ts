import { TRANSITION } from '../capture/schedule.ts';
import type { CaptureEvent } from '../capture/events.ts';
import { TIMING } from '../effects/scene.ts';
import { CHANGE_LENGTH } from '../stage/plan.ts';
import { coversApp, type Timeline } from '../timeline/build.ts';

export interface TimingNote {
  time: number;
  note: string;
}

// What a viewer would notice as off-beat, read from what the capture actually did.
export const PACE = {
  // Average scroll speed, in CSS px per second, above which text blurs past.
  fastScroll: 1500,
  // A mark needs the page to have been still this long, or it looks like it chased it.
  settle: 0.3,
  // The least a mark should stay readable before something covers the whole frame.
  readable: 1.2,
  // Two clicks closer than this (opening a menu, then its link) read as one jump.
  clicks: 0.8,
};

export function auditTiming(captured: readonly CaptureEvent[], timeline: Pick<Timeline, 'overlays'> & Partial<Pick<Timeline, 'actions'>>): TimingNote[] {
  const notes: TimingNote[] = [];
  // What the app does under an overlay that hides it is never seen: a tour may undo its own
  // changes there, as fast as it likes.
  const hidden = timeline.overlays.filter(coversApp);
  const events = captured.filter(event => !hidden.some(o => event.time > o.start && event.time < o.end));
  const scrolls = events.filter(e => e.kind === 'scroll');
  const navigations = events.filter(e => e.kind === 'navigate');
  const covering = timeline.overlays.filter(coversApp).map(o => o.start);
  // A change the stage draws takes longer than the page's dissolve.
  const changed = (timeline.actions ?? []).filter(a => a.transition);
  const at = (time: number) => changed.find(a => Math.abs(a.time - time) < 0.1)?.transition;
  const changeLength = (time: number) => { const kind = at(time); return kind === 'cut' ? 0 : kind ? CHANGE_LENGTH : TRANSITION; };

  for (const scroll of scrolls) {
    if (scroll.distance === undefined || scroll.duration <= 0) continue;
    const speed = scroll.distance / scroll.duration;
    if (speed > PACE.fastScroll) {
      notes.push({ time: scroll.time, note: `scroll of ${scroll.distance}px in ${scroll.duration.toFixed(2)}s (${Math.round(speed)}px/s) is too fast to follow; give it a longer duration or less distance` });
    }
  }

  const clicks = events.filter(e => e.kind === 'click');
  clicks.slice(1).forEach((click, i) => {
    const gap = click.time - clicks[i]!.time;
    if (gap < PACE.clicks) notes.push({ time: click.time, note: `click comes ${gap.toFixed(2)}s after the one before, too soon to see what the first opened; move it to a later word` });
  });

  for (const mark of events) {
    if (mark.kind !== 'ring' && mark.kind !== 'label') continue;
    const what = mark.kind === 'ring' ? 'ring' : 'label';
    const moving = scrolls.find(s => mark.time >= s.time - 1e-6 && mark.time < s.time + s.duration + PACE.settle);
    if (moving) {
      notes.push({ time: mark.time, note: `${what} lands while the page is still scrolling (it stops at ${(moving.time + moving.duration).toFixed(2)}s); move it to a later word` });
    }
    const fading = navigations.find(n => mark.time >= n.time && mark.time < n.time + changeLength(n.time));
    if (fading) notes.push({ time: mark.time, note: `${what} lands during the change into the new screen; move it to a later word` });
    const hold = mark.kind === 'ring' ? TIMING.ringDraw + TIMING.ringHold : TIMING.labelHold;
    const cover = covering.find(start => start > mark.time && start < mark.time + Math.min(hold, PACE.readable));
    if (cover !== undefined) {
      notes.push({ time: mark.time, note: `${what} is covered after ${(cover - mark.time).toFixed(2)}s by a full-screen overlay; bring it earlier or give it more time` });
    }
  }
  for (const cut of events) {
    if (cut.kind !== 'cut' || cut.shown >= PACE.readable) continue;
    notes.push({ time: cut.time, note: `${cut.mark} was covered or left the screen after ${cut.shown.toFixed(2)}s; give it more time before the next click` });
  }
  return notes.sort((a, b) => a.time - b.time);
}

export function formatTiming(notes: readonly TimingNote[]): string {
  if (notes.length === 0) return '✓ timing: nothing off-beat';
  return [`⚠ timing: ${notes.length} to review`, ...notes.map(n => `  ${n.time.toFixed(2).padStart(7)}s  ${n.note}`)].join('\n');
}

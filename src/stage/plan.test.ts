import { describe, expect, it } from 'vitest';
import type { TimedAction, TimedShot } from '../timeline/build.ts';
import type { Shot } from '../tour/schema.ts';
import { CAMERA, CHANGE_LENGTH, changeAt, changeLayers, FLAT, pose, poseAt, stagePlan } from './plan.ts';

const shot = (time: number, to: Shot['to'], extra: Partial<Shot> = {}): TimedShot =>
  ({ time, segment: 0, shot: { kind: 'shot', to, angle: undefined, duration: undefined, at: undefined, ...extra } });
const mark = (time: number): TimedAction =>
  ({ time, segment: 0, action: { kind: 'highlight', on: 'h1', duration: undefined, style: undefined, color: undefined, side: undefined, at: undefined } });
const plan = (shots: TimedShot[], actions: TimedAction[] = [], duration = 20) => stagePlan({ shots, actions, duration });

describe('pose', () => {
  it('tilts left and right by the angle, the left edge closer for left', () => {
    expect(pose('left').rotateY).toBe(CAMERA.angle);
    expect(pose('right', 6).rotateY).toBe(-6);
    expect(pose('top', 5).rotateX).toBe(5);
    expect(pose('flat')).toEqual(FLAT);
  });
});

describe('stagePlan', () => {
  it('stays flat and renders nothing without shots', () => {
    expect(plan([], [mark(3)])).toEqual({ moves: [], changes: [], spans: [], notes: [] });
  });

  it('eases into a shot over its duration and holds it to the end', () => {
    const { moves, spans } = plan([shot(2, 'left', { duration: 1 })], [], 10);
    expect(moves).toEqual([{ start: 2, end: 3, from: FLAT, to: pose('left') }]);
    expect(spans).toEqual([{ start: 2, end: 10 }]);
    expect(poseAt(moves, 1)).toEqual(FLAT);
    expect(poseAt(moves, 2.5).rotateY).toBeCloseTo(CAMERA.angle / 2);
    expect(poseAt(moves, 9)).toEqual(pose('left'));
  });

  it('straightens on its own before a mark, flat a moment before it', () => {
    const { moves, spans, notes } = plan([shot(1, 'right')], [mark(6)]);
    const back = moves.at(-1)!;
    expect(back.to).toEqual(FLAT);
    expect(back.end).toBeCloseTo(6 - CAMERA.lead);
    expect(back.start).toBeCloseTo(6 - CAMERA.lead - CAMERA.straighten);
    expect(poseAt(moves, 6)).toEqual(FLAT);
    expect(spans).toEqual([{ start: 1, end: back.end }]);
    expect(notes).toEqual([]);
  });

  it('stays flat after the mark until the next shot', () => {
    const { moves, spans } = plan([shot(1, 'left'), shot(9, 'top')], [mark(5)]);
    expect(poseAt(moves, 7)).toEqual(FLAT);
    expect(poseAt(moves, 15)).toEqual(pose('top'));
    expect(spans).toHaveLength(2);
    expect(spans[1]!.start).toBe(9);
  });

  it('cuts a move short when the next shot comes first, starting from where it got', () => {
    const { moves } = plan([shot(1, 'left', { duration: 2 }), shot(2, 'right')]);
    expect(moves[0]!.end).toBe(2);
    expect(moves[1]!.from.rotateY).toBeCloseTo(CAMERA.angle / 2);
    expect(moves[1]!.to).toEqual(pose('right'));
  });

  it('warns when there is no time to straighten before the mark', () => {
    const { notes, moves } = plan([shot(2, 'left')], [mark(2.6)]);
    expect(notes[0]!.note).toMatch(/to straighten before/);
    expect(poseAt(moves, 2.6 - CAMERA.lead)).toEqual(FLAT);
  });

  it('warns when a shot straightens almost as soon as it lands', () => {
    const { notes } = plan([shot(2, 'left')], [mark(4.6)]);
    expect(notes[0]!.note).toMatch(/holds 0\.40s/);
  });

  it('a flat shot only brings the camera back', () => {
    const { moves, spans } = plan([shot(1, 'wide'), shot(4, 'flat')]);
    expect(moves.at(-1)!.to).toEqual(FLAT);
    expect(spans).toEqual([{ start: 1, end: 4 + CAMERA.move }]);
  });
});

const navigation = (time: number, transition?: 'push' | 'flip' | 'fly'): TimedAction =>
  ({ time, segment: 0, action: { kind: 'goto', url: '/next', at: undefined }, ...(transition ? { transition } : {}) });

describe('changes of screen', () => {
  it('renders each staged change for its length, and leaves dissolves to the page', () => {
    const { changes, spans } = plan([], [navigation(3, 'push'), navigation(6)]);
    expect(changes).toEqual([{ time: 3, kind: 'push' }]);
    expect(spans).toEqual([{ start: 3, end: 3 + CHANGE_LENGTH }]);
  });

  it('merges a change into the camera stretch it falls in', () => {
    const { spans } = plan([shot(1, 'wide')], [navigation(4, 'fly')], 10);
    expect(spans).toEqual([{ start: 1, end: 10 }]);
  });

  it('knows how far along a change is, and nothing outside it', () => {
    const changes = [{ time: 3, kind: 'flip' as const }];
    expect(changeAt(changes, 2.9)).toBeNull();
    expect(changeAt(changes, 3.4)!.progress).toBeCloseTo(0.4 / CHANGE_LENGTH);
    expect(changeAt(changes, 3 + CHANGE_LENGTH)).toBeNull();
  });

  it('starts on the old screen and ends on the new one, square and full size', () => {
    for (const kind of ['push', 'flip', 'fly'] as const) {
      const start = changeLayers(kind, 0);
      const end = changeLayers(kind, 1);
      expect(start.old).toMatchObject({ x: 0, scale: 1, opacity: 1 });
      expect(start.next.opacity === 0 || Math.abs(start.next.x) >= 1).toBe(true);
      expect(end.next).toMatchObject({ x: 0, scale: 1, opacity: 1, depth: 0 });
      expect(Math.abs(end.next.rotateY)).toBe(0);
    }
  });

  it('pushes the old screen out to the left as the new one comes from the right', () => {
    const { old, next } = changeLayers('push', 0.5);
    expect(old.x).toBeLessThan(0);
    expect(next.x).toBeGreaterThan(0);
    expect(old.scale).toBeLessThan(1);
  });

  it('turns a flip on the old face first and the new face last', () => {
    expect(changeLayers('flip', 0.3).old.opacity).toBe(1);
    expect(changeLayers('flip', 0.3).next.opacity).toBe(0);
    expect(changeLayers('flip', 0.7).next.opacity).toBe(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { freezeClock } from './clock.ts';

function fakePage(failures: number, message = 'clock.pauseAt: Error: Cannot fast-forward to the past') {
  let now = 1000;
  return {
    evaluate: vi.fn(async () => (now += 30)),
    clock: {
      pauseAt: vi.fn(async (time: number) => {
        if (failures-- > 0) throw new Error(message);
        return void time;
      }),
    },
  };
}

describe('freezeClock', () => {
  it('pauses a little ahead of the page clock', async () => {
    const page = fakePage(0);
    await freezeClock(page as never);
    expect(page.clock.pauseAt).toHaveBeenCalledWith(1030 + 25);
  });

  it('retries with a fresh reading when the clock ran past the target', async () => {
    const page = fakePage(2);
    await freezeClock(page as never);
    expect(page.clock.pauseAt).toHaveBeenCalledTimes(3);
    expect(page.clock.pauseAt).toHaveBeenLastCalledWith(1090 + 25);
  });

  it('gives up after a few attempts and rethrows other errors at once', async () => {
    await expect(freezeClock(fakePage(10) as never)).rejects.toThrow(/to the past/);
    const other = fakePage(1, 'Target page, context or browser has been closed');
    await expect(freezeClock(other as never)).rejects.toThrow(/closed/);
    expect(other.clock.pauseAt).toHaveBeenCalledTimes(1);
  });
});

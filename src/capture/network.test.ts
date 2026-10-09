import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { watchNetwork } from './network.ts';

const request = (type = 'fetch', url = 'https://app.test/api') => ({ resourceType: () => type, url: () => url });

function fakePage() {
  const events = new EventEmitter();
  return Object.assign(events, { evaluate: vi.fn(async () => undefined) });
}

// A clock that only moves when the watch sleeps, so every wait is exact.
function fakeTime() {
  let ms = 0;
  return { now: () => ms, sleep: async (step: number) => { ms += step; } };
}

describe('watchNetwork', () => {
  it('holds the frame until the answer lands, then lets the page paint it', async () => {
    const page = fakePage();
    const time = fakeTime();
    const answer = request();
    // The server answers 300 ms after the request, whatever the capture is doing.
    const sleep = async (step: number) => { await time.sleep(step); if (time.now() >= 300) page.emit('requestfinished', answer); };
    const watch = watchNetwork(page as never, { now: time.now, sleep });
    page.emit('request', answer);
    await watch.settle();
    expect(time.now()).toBe(300);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('costs nothing on a frame where the network is quiet', async () => {
    const page = fakePage();
    await watchNetwork(page as never, fakeTime()).settle();
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('stops waiting on a request open longer than a stream would be, and ignores streams outright', async () => {
    const page = fakePage();
    const time = fakeTime();
    const watch = watchNetwork(page as never, { ...time, streamAfter: 1_000 });
    page.emit('request', request('eventsource'));
    page.emit('request', request('fetch', 'data:text/plain,hi'));
    page.emit('request', request());
    await watch.settle();
    expect(time.now()).toBeGreaterThanOrEqual(1_000);
    expect(time.now()).toBeLessThan(1_100);
    const before = time.now();
    await watch.settle();
    expect(time.now()).toBe(before);
  });

  it('lets go of the page when disposed', () => {
    const page = fakePage();
    watchNetwork(page as never, fakeTime()).dispose();
    expect(page.listenerCount('request')).toBe(0);
  });
});

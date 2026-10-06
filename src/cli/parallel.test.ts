import { describe, expect, it } from 'vitest';
import { defaultJobs, pool, together } from './parallel.ts';

const GB = 1024 ** 3;

describe('defaultJobs', () => {
  it('keeps one overlay render next to the capture on 8 GB, more on bigger machines', () => {
    expect(defaultJobs(8 * GB, 8)).toBe(1);
    expect(defaultJobs(16 * GB, 10)).toBe(2);
    expect(defaultJobs(32 * GB, 12)).toBe(4);
    expect(defaultJobs(64 * GB, 4)).toBe(2);
  });
});

describe('pool', () => {
  it('runs every item, never more than jobs at once', async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5], 2, async item => {
      most = Math.max(most, ++running);
      await new Promise(resolve => setTimeout(resolve, 10));
      done.push(item);
      running--;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(most).toBe(2);
  });
});

describe('together', () => {
  it('waits for every task when all succeed', async () => {
    const finished: string[] = [];
    await together([async () => { finished.push('a'); }, async () => { finished.push('b'); }]);
    expect(finished.sort()).toEqual(['a', 'b']);
  });

  it('tells the other tasks to stop when one fails, and throws that failure', async () => {
    let stopped = false;
    const slow = async (signal: AbortSignal) => {
      while (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 5));
      stopped = true;
    };
    await expect(together([slow, async () => { throw new Error('capture failed'); }])).rejects.toThrow('capture failed');
    expect(stopped).toBe(true);
  });
});

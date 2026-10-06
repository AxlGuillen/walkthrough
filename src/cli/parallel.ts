const GB = 1024 ** 3;

// Overlay renders that run at once, next to the capture's own browser. Each is a Chrome page,
// so memory decides: on 8 GB the capture already pushes the Mac into swap.
export function defaultJobs(memory: number, cores: number): number {
  if (memory <= 8 * GB) return 1;
  if (memory <= 16 * GB) return 2;
  return Math.max(2, Math.min(4, Math.floor(cores / 2)));
}

// Runs each item through fn, at most `jobs` at a time, in the order given.
export async function pool<T>(items: readonly T[], jobs: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
}

// Runs tasks side by side; when one fails the others are told to stop (they check the signal
// between frames), and the first failure is what the caller sees.
export async function together(tasks: readonly ((signal: AbortSignal) => Promise<unknown>)[]): Promise<void> {
  const controller = new AbortController();
  let first: unknown;
  await Promise.all(tasks.map(task => task(controller.signal).catch(error => {
    if (first === undefined) first = error;
    controller.abort();
  })));
  if (first !== undefined) throw first;
}

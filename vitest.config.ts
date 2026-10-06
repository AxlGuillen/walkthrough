import os from 'node:os';
import { defineConfig } from 'vitest/config';

// Integration suites prepare fixtures with ffmpeg and real browsers while other suites run
// in parallel; the 10s default for hooks is too tight on a busy machine. Each of those suites
// starts its own Chrome, so one worker per core starves an 8 GB Mac into timeouts: half of them.
export default defineConfig({
  test: { hookTimeout: 60_000, maxWorkers: Math.max(2, Math.floor(os.availableParallelism() / 2)) },
});

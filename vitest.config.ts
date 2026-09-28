import { defineConfig } from 'vitest/config';

// Integration suites prepare fixtures with ffmpeg and real browsers while other suites run
// in parallel; the 10s default for hooks is too tight on a busy machine.
export default defineConfig({
  test: { hookTimeout: 60_000 },
});

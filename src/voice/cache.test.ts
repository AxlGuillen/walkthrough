import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey, withCache } from './cache.ts';
import type { VoiceProvider } from './types.ts';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'voice-cache-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function fakeProvider(): VoiceProvider & { synthesize: ReturnType<typeof vi.fn> } {
  return {
    id: 'fake',
    synthesize: vi.fn(async ({ text }) => ({
      audio: Buffer.from(text),
      duration: text.length,
      words: [{ text, start: 0, end: 1 }],
    })),
  };
}

describe('withCache', () => {
  it('serves a repeated request from disk', async () => {
    const provider = fakeProvider();
    const cached = withCache(provider, dir);

    const first = await cached.synthesize({ text: 'Hola', language: 'es' });
    const second = await withCache(provider, dir).synthesize({ text: 'Hola', language: 'es' });

    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('misses when anything that changes the audio changes', async () => {
    const provider = fakeProvider();
    const cached = withCache(provider, dir);
    await cached.synthesize({ text: 'Hola', language: 'es' });
    await cached.synthesize({ text: 'Hola', language: 'en' });
    await cached.synthesize({ text: 'Hola', language: 'es', voice: 'other' });
    expect(provider.synthesize).toHaveBeenCalledTimes(3);
  });
});

describe('cacheKey', () => {
  it('depends on the provider', () => {
    const request = { text: 'Hola', language: 'es' as const };
    expect(cacheKey('fish:a', request)).not.toBe(cacheKey('fish:b', request));
  });
});

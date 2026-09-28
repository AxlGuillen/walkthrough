import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTour } from '../tour/load.ts';
import { synthesizeTour } from './stage.ts';
import type { VoiceProvider } from './types.ts';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'voice-stage-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const provider = (): VoiceProvider & { synthesize: ReturnType<typeof vi.fn> } => ({
  id: 'fake',
  synthesize: vi.fn(async ({ text }) => ({ audio: Buffer.from(text), duration: 1.5, words: [{ text, start: 0, end: 1 }] })),
});

describe('synthesizeTour', () => {
  it('writes one clip per spoken segment, numbered by segment', async () => {
    const tour = parseTour('title: x\nurl: https://a.com\nvoice: abc\nlanguage: en\nsegments:\n  - say: Hi\n  - hold: 1\n  - say: Bye\n');
    const fake = provider();

    const timings = await synthesizeTour(tour, fake, dir);

    expect(timings).toEqual([
      { duration: 1.5, words: [{ text: 'Hi', start: 0, end: 1 }] },
      undefined,
      { duration: 1.5, words: [{ text: 'Bye', start: 0, end: 1 }] },
    ]);
    expect(fake.synthesize).toHaveBeenCalledWith({ text: 'Hi', language: 'en', voice: 'abc' });
    expect(await readFile(path.join(dir, 'voice', '03.wav'), 'utf8')).toBe('Bye');
    expect(JSON.parse(await readFile(path.join(dir, 'voice', '01.json'), 'utf8'))).toEqual(timings[0]);
    expect(existsSync(path.join(dir, 'voice', '02.wav'))).toBe(false);
  });

  it("falls back to the provider's default voice, so every segment sounds the same", async () => {
    const fake = { ...provider(), defaultVoice: 'narrator' };
    await synthesizeTour(parseTour('title: x\nurl: https://a.com\nsegments:\n  - say: Hola\n  - say: Adiós\n'), fake, dir);
    expect(fake.synthesize.mock.calls.map(([request]) => request.voice)).toEqual(['narrator', 'narrator']);
  });

  it('leaves the voice out when neither the tour nor the provider has one', async () => {
    const fake = provider();
    await synthesizeTour(parseTour('title: x\nurl: https://a.com\nsegments:\n  - say: Hola\n'), fake, dir);
    expect(fake.synthesize).toHaveBeenCalledWith({ text: 'Hola', language: 'es' });
  });
});

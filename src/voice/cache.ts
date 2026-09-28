import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Speech, SpeechRequest, SpeechTiming, VoiceProvider } from './types.ts';

export function cacheKey(providerId: string, { text, language, voice }: SpeechRequest): string {
  return createHash('sha256')
    .update(JSON.stringify([providerId, language, voice ?? null, text]))
    .digest('hex');
}

export function withCache(provider: VoiceProvider, dir: string): VoiceProvider {
  return {
    id: provider.id,
    async synthesize(request) {
      const base = path.join(dir, cacheKey(provider.id, request));
      // The JSON is written last, so its presence means the entry is complete.
      if (existsSync(`${base}.json`)) {
        const timing = JSON.parse(await readFile(`${base}.json`, 'utf8')) as SpeechTiming;
        return { ...timing, audio: await readFile(`${base}.wav`) } satisfies Speech;
      }
      const speech = await provider.synthesize(request);
      await mkdir(dir, { recursive: true });
      await writeFile(`${base}.wav`, speech.audio);
      await writeFile(`${base}.json`, JSON.stringify({ duration: speech.duration, words: speech.words }));
      return speech;
    },
  };
}

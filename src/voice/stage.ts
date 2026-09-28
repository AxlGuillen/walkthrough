import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Tour } from '../tour/schema.ts';
import type { SpeechRequest, SpeechTiming, VoiceProvider } from './types.ts';

export async function synthesizeTour(
  tour: Tour,
  provider: VoiceProvider,
  outDir: string,
): Promise<(SpeechTiming | undefined)[]> {
  const dir = path.join(outDir, 'voice');
  await mkdir(dir, { recursive: true });

  const timings: (SpeechTiming | undefined)[] = [];
  // Sequential on purpose: the free tier is rate limited.
  for (const [index, segment] of tour.segments.entries()) {
    if (segment.say === undefined) {
      timings.push(undefined);
      continue;
    }
    const request: SpeechRequest = { text: segment.say, language: tour.language };
    if (tour.voice !== undefined) request.voice = tour.voice;

    const { audio, ...timing } = await provider.synthesize(request);
    const base = path.join(dir, String(index + 1).padStart(2, '0'));
    await writeFile(`${base}.wav`, audio);
    await writeFile(`${base}.json`, JSON.stringify(timing, null, 2));
    timings.push(timing);
  }
  return timings;
}

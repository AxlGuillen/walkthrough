import type { SpeechRequest, VoiceProvider } from '../types.ts';
import { assembleSpeech, parseEvents } from './stream.ts';

const ENDPOINT = 'https://api.fish.audio/v1/tts/stream/with-timestamp';
// The only free model that returns word timestamps; s1 is paid.
const DEFAULT_MODEL = 's2.1-pro-free';
// "Drez": calm Spanish male narrator (https://fish.audio/app/m/47a92a11ad4a4b79aac40ad587fa61b1).
export const DEFAULT_VOICE = '47a92a11ad4a4b79aac40ad587fa61b1';

export interface FishOptions {
  apiKey: string;
  model?: string;
  voice?: string;
  fetch?: typeof fetch;
}

export function createFishProvider({
  apiKey, model = DEFAULT_MODEL, voice = DEFAULT_VOICE, fetch: request = fetch,
}: FishOptions): VoiceProvider {
  return {
    id: `fish:${model}`,
    defaultVoice: voice,
    // Fish infers the language from the text, so request.language only matters for the cache key.
    async synthesize({ text, voice }: SpeechRequest) {
      const response = await request(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', model },
        body: JSON.stringify({ text, format: 'wav', latency: 'normal', reference_id: voice }),
      });
      if (!response.ok) {
        throw new Error(`Fish TTS ${response.status}: ${(await response.text()).slice(0, 200)}`);
      }
      return assembleSpeech(parseEvents(await response.text()));
    },
  };
}

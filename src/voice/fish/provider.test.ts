import { describe, expect, it, vi } from 'vitest';
import { encodeWav } from '../wav.ts';
import { createFishProvider } from './provider.ts';

const audio = encodeWav({ sampleRate: 1000, channels: 1, bitsPerSample: 16 }, Buffer.alloc(2000));
const body = `event: message\ndata: ${JSON.stringify({
  audio_base64: audio.toString('base64'),
  alignment: { segments: [{ text: 'Hola', start: 0, end: 0.4 }] },
  chunk_seq: 0,
  chunk_audio_offset_sec: 0,
})}\n\n`;

describe('createFishProvider', () => {
  it('requests the free timestamped model and parses the stream', async () => {
    const fetch = vi.fn(async () => new Response(body));
    const provider = createFishProvider({ apiKey: 'test-key', fetch });

    const speech = await provider.synthesize({ text: 'Hola', language: 'es', voice: 'abc' });

    expect(speech).toMatchObject({ duration: 1, words: [{ text: 'Hola', start: 0, end: 0.4 }] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/tts\/stream\/with-timestamp$/);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key', model: 's2.1-pro-free' });
    expect(JSON.parse(init.body as string)).toMatchObject({ text: 'Hola', format: 'wav', reference_id: 'abc' });
  });

  it('exposes Drez as the default voice unless told otherwise', () => {
    expect(createFishProvider({ apiKey: 'k' }).defaultVoice).toBe('47a92a11ad4a4b79aac40ad587fa61b1');
    expect(createFishProvider({ apiKey: 'k', voice: 'other' }).defaultVoice).toBe('other');
  });

  it('includes the status and body when the API refuses', async () => {
    const fetch = vi.fn(async () => new Response('Insufficient API credit', { status: 402 }));
    const provider = createFishProvider({ apiKey: 'test-key', fetch });
    await expect(provider.synthesize({ text: 'Hola', language: 'es' })).rejects.toThrow('Fish TTS 402: Insufficient API credit');
  });
});

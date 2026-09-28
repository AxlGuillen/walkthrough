import type { Speech, Word } from '../types.ts';
import { encodeWav, pcmDuration, splitWav } from '../wav.ts';

export interface FishEvent {
  audio_base64?: string;
  alignment?: {
    segments?: { text: string; start: number; end: number }[];
  };
  chunk_seq?: number;
  chunk_audio_offset_sec?: number;
}

export function parseEvents(body: string): FishEvent[] {
  return body
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(data => data !== '' && data !== '[DONE]')
    .map(data => JSON.parse(data) as FishEvent);
}

// Audio pieces are not aligned with chunk_seq: only the first carries a WAV header, and
// later pieces are raw PCM that may belong to the next chunk. Alignment is cumulative per
// chunk, so the last one seen for each chunk_seq is the complete one.
export function assembleSpeech(events: readonly FishEvent[]): Speech {
  const pieces = events.flatMap(event => (event.audio_base64 ? [Buffer.from(event.audio_base64, 'base64')] : []));
  const [first, ...rest] = pieces;
  if (!first) throw new Error('Fish returned no audio');

  const { format, pcm } = splitWav(first);
  const allPcm = Buffer.concat([pcm, ...rest.map(piece => (isWav(piece) ? splitWav(piece).pcm : piece))]);

  const chunks = new Map<number, { offset: number; segments: Word[] }>();
  for (const event of events) {
    if (!event.alignment?.segments) continue;
    chunks.set(event.chunk_seq ?? 0, { offset: event.chunk_audio_offset_sec ?? 0, segments: event.alignment.segments });
  }
  const words = [...chunks.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, { offset, segments }]) => segments.map(s => ({ text: s.text, start: offset + s.start, end: offset + s.end })))
    .filter(word => !isExpressionTag(word.text));

  return { audio: encodeWav(format, allPcm), words, duration: pcmDuration(format, allPcm.length) };
}

function isWav(buffer: Buffer): boolean {
  return buffer.toString('latin1', 0, 4) === 'RIFF';
}

function isExpressionTag(text: string): boolean {
  return /^\s*\[[^\]]*\]\s*$/.test(text);
}

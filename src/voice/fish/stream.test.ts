import { describe, expect, it } from 'vitest';
import { encodeWav, splitWav } from '../wav.ts';
import { assembleSpeech, parseEvents, type FishEvent } from './stream.ts';

const format = { sampleRate: 1000, channels: 1, bitsPerSample: 16 };
const base64 = (buffer: Buffer) => buffer.toString('base64');

// Mirrors a real two-chunk response: one streamed WAV header, audio pieces that do not
// follow chunk_seq, and cumulative alignment per chunk.
function realisticStream(): FishEvent[] {
  const header = encodeWav(format, Buffer.alloc(3000, 1));
  header.writeUInt32LE(0xffffff00, 40);
  return [
    {
      audio_base64: base64(header),
      alignment: { segments: [{ text: 'Hola', start: 0, end: 0.5 }] },
      chunk_seq: 0,
      chunk_audio_offset_sec: 0,
    },
    {
      audio_base64: base64(Buffer.alloc(1000, 2)),
      alignment: { segments: [{ text: 'Hola', start: 0, end: 0.5 }, { text: 'tablero', start: 0.6, end: 1.4 }] },
      chunk_seq: 0,
      chunk_audio_offset_sec: 0,
    },
    {
      alignment: { segments: [{ text: '[excited]', start: 0, end: 0 }, { text: 'Adiós', start: 0.1, end: 0.4 }] },
      chunk_seq: 1,
      chunk_audio_offset_sec: 1.5,
    },
  ];
}

describe('parseEvents', () => {
  it('reads data lines and ignores event names, blanks and DONE', () => {
    const body = 'event: message\ndata: {"chunk_seq":0}\n\nevent: message\ndata: {"chunk_seq":1}\ndata: [DONE]\n';
    expect(parseEvents(body)).toEqual([{ chunk_seq: 0 }, { chunk_seq: 1 }]);
  });
});

describe('assembleSpeech', () => {
  const speech = assembleSpeech(realisticStream());

  it('joins every audio piece under one valid header', () => {
    const { pcm } = splitWav(speech.audio);
    expect(pcm.length).toBe(4000);
    expect(speech.audio.readUInt32LE(40)).toBe(4000);
  });

  it('takes duration from the audio itself', () => {
    expect(speech.duration).toBe(2);
  });

  it('keeps the last alignment per chunk, shifted by the chunk offset', () => {
    expect(speech.words).toEqual([
      { text: 'Hola', start: 0, end: 0.5 },
      { text: 'tablero', start: 0.6, end: 1.4 },
      { text: 'Adiós', start: 1.6, end: 1.9 },
    ]);
  });

  it('fails when there is no audio', () => {
    expect(() => assembleSpeech([{ chunk_seq: 0 }])).toThrow(/no audio/);
  });
});

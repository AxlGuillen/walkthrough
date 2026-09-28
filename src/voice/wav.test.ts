import { describe, expect, it } from 'vitest';
import { encodeWav, pcmDuration, splitWav } from './wav.ts';

const format = { sampleRate: 44100, channels: 1, bitsPerSample: 16 };

describe('wav', () => {
  it('round-trips PCM through a header', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    expect(splitWav(encodeWav(format, pcm))).toEqual({ format, pcm });
  });

  it('reads streamed WAVs whose data size is a placeholder', () => {
    const wav = encodeWav(format, Buffer.alloc(10, 7));
    wav.writeUInt32LE(0xffffff00, 40);
    expect(splitWav(Buffer.concat([wav, Buffer.alloc(4, 7)])).pcm.length).toBe(14);
  });

  it('skips chunks before the data chunk', () => {
    const plain = encodeWav(format, Buffer.alloc(2));
    const list = Buffer.concat([Buffer.from('LIST', 'latin1'), Buffer.from([3, 0, 0, 0]), Buffer.alloc(4)]);
    const withList = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
    expect(splitWav(withList).pcm.length).toBe(2);
  });

  it('rejects buffers that are not WAV', () => {
    expect(() => splitWav(Buffer.from('ID3 not a wav file'))).toThrow(/not a WAV/);
  });

  it('computes duration from PCM bytes', () => {
    expect(pcmDuration(format, 88200)).toBe(1);
    expect(pcmDuration({ ...format, channels: 2 }, 88200)).toBe(0.5);
  });
});

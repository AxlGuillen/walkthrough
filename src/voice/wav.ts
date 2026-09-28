export interface PcmFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export function splitWav(wav: Buffer): { format: PcmFormat; pcm: Buffer } {
  if (wav.toString('latin1', 0, 4) !== 'RIFF' || wav.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('not a WAV file');
  }
  let format: PcmFormat | undefined;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('latin1', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = {
        channels: wav.readUInt16LE(offset + 10),
        sampleRate: wav.readUInt32LE(offset + 12),
        bitsPerSample: wav.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      if (!format) throw new Error('WAV data chunk before fmt chunk');
      // Streamed WAVs declare a placeholder size, so the data runs to the end of the buffer.
      return { format, pcm: wav.subarray(offset + 8) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

export function encodeWav(format: PcmFormat, pcm: Buffer): Buffer {
  const blockAlign = format.channels * (format.bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(format.bitsPerSample, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function pcmDuration(format: PcmFormat, bytes: number): number {
  return bytes / (format.sampleRate * format.channels * (format.bitsPerSample / 8));
}

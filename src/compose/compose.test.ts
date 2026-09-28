import { describe, expect, it } from 'vitest';
import { composeArgs, measureArgs, parseLoudness } from './compose.ts';

const inputs = {
  capture: 'capture.mp4',
  clips: [{ file: 'voice/01.wav', start: 0.35 }],
  music: { file: 'music.mp3', volume: 0.09 },
  overlays: [{ file: 'overlays/01.mov', start: 1, end: 2, fade: 0 }],
  subtitles: 'subs.ass',
  duration: 4,
  output: 'video.mp4',
};
const loudness = { input_i: '-20', input_tp: '-2', input_lra: '5', input_thresh: '-30', target_offset: '0' };

describe('measureArgs', () => {
  it('runs the audio alone and writes nothing', () => {
    const args = measureArgs(inputs);
    expect(args.slice(-4)).toEqual(['[aout]', '-f', 'null', '-']);
    expect(args.join(' ')).not.toContain('[vout]');
  });
});

describe('composeArgs', () => {
  it('numbers inputs as capture, voice, music, then overlays', () => {
    const args = composeArgs(inputs, loudness);
    const files = args.filter((_, i) => args[i - 1] === '-i');
    expect(files).toEqual(['capture.mp4', 'voice/01.wav', 'music.mp3', 'overlays/01.mov']);
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('[3:v]format=rgba');
    expect(graph).toContain('[2:a]aformat=channel_layouts=stereo');
    expect(graph).toContain('linear=true');
  });

  it('loops the music and cuts everything at the timeline length', () => {
    const args = composeArgs(inputs, loudness);
    expect(args.slice(args.indexOf('-stream_loop'), args.indexOf('-stream_loop') + 4)).toEqual(['-stream_loop', '-1', '-i', 'music.mp3']);
    expect(args[args.indexOf('-t') + 1]).toBe('4.000');
  });
});

describe('composeArgs for drafts', () => {
  it('encodes previews fast and final videos carefully', () => {
    expect(composeArgs({ ...inputs, draft: true }, loudness).join(' ')).toContain('-preset veryfast -crf 26');
    expect(composeArgs(inputs, loudness).join(' ')).toContain('-preset medium -crf 18');
  });
});

describe('parseLoudness', () => {
  it('reads the JSON block loudnorm prints at the end', () => {
    const stderr = `[Parsed_loudnorm_3 @ 0x1] \n{\n\t"input_i" : "-21.30",\n\t"input_tp" : "-4.10",\n\t"input_lra" : "7.00",\n\t"input_thresh" : "-31.80",\n\t"output_i" : "-16.0",\n\t"target_offset" : "0.20"\n}\n`;
    expect(parseLoudness(stderr)).toMatchObject({ input_i: '-21.30', input_thresh: '-31.80', target_offset: '0.20' });
  });

  it('fails clearly when the measurement is missing', () => {
    expect(() => parseLoudness('{ "input_i": "-20" }')).toThrow(/did not report/);
  });
});

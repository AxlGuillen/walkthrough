import { describe, expect, it } from 'vitest';
import { audioGraph } from './audio.ts';

describe('audioGraph', () => {
  it('places each clip at its start and pads the voice to the video length', () => {
    const graph = audioGraph({ clips: [{ input: 1, start: 0.35 }, { input: 2, start: 5.5 }], duration: 10 });
    expect(graph).toContain('[1:a]aformat=channel_layouts=stereo,adelay=350:all=1[v0]');
    expect(graph).toContain('[2:a]aformat=channel_layouts=stereo,adelay=5500:all=1[v1]');
    expect(graph).toContain('[v0][v1]amix=inputs=2:normalize=0:duration=longest,apad,atrim=0:10.000[voice]');
    expect(graph).not.toContain('sidechaincompress');
    expect(graph).toMatch(/\[voice\]loudnorm=I=-16.*\[aout\]$/);
  });

  it('ducks the music under the voice when there is a track', () => {
    const graph = audioGraph({ clips: [{ input: 1, start: 0 }], duration: 10, music: { input: 2, volume: 0.15 } });
    expect(graph).toContain('[2:a]aformat=channel_layouts=stereo,atrim=0:10.000,volume=0.15,');
    expect(graph).toContain('afade=t=out:st=8.000:d=2');
    expect(graph).toContain('[bed][sidechain]sidechaincompress=');
    expect(graph).toMatch(/\[mix\]loudnorm=.*\[aout\]$/);
  });

  it('produces silence for tours without narration', () => {
    expect(audioGraph({ clips: [], duration: 3 })).toContain('anullsrc=r=48000:cl=stereo,atrim=0:3.000[voice]');
  });

  it('measures on the first pass and applies one linear gain on the second', () => {
    expect(audioGraph({ clips: [], duration: 1 })).toContain('loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json');
    const second = audioGraph({
      clips: [], duration: 1,
      loudness: { input_i: '-22.1', input_tp: '-3.0', input_lra: '6.2', input_thresh: '-32.5', target_offset: '0.4' },
    });
    expect(second).toContain('measured_I=-22.1:measured_TP=-3.0:measured_LRA=6.2:measured_thresh=-32.5:offset=0.4:linear=true');
    expect(second).not.toContain('print_format');
  });

  it('leaves silence as it is, which loudnorm cannot level', () => {
    const silent = audioGraph({ clips: [], duration: 1, loudness: { input_i: '-inf', input_tp: '-inf', input_lra: '0.00', input_thresh: '-70.00', target_offset: 'inf' } });
    expect(silent).not.toContain('loudnorm');
    expect(silent).toMatch(/anull,aresample=48000,atrim=0:1\.000\[aout\]$/);
  });
});

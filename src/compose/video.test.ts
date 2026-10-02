import { describe, expect, it } from 'vitest';
import { videoGraph } from './video.ts';

describe('videoGraph', () => {
  it('passes the capture through when there is nothing to add', () => {
    expect(videoGraph([])).toBe('[0:v]null[vout]');
  });

  it('shifts each overlay to its start, fades its alpha and stacks it in order', () => {
    const graph = videoGraph([
      { input: 3, start: 2, end: 5, fade: 0.3 },
      { input: 4, start: 4, end: 6, fade: 0 },
    ], 'subs.ass');
    expect(graph.split(';')).toEqual([
      '[3:v]format=rgba,fade=t=in:st=0:d=0.300:alpha=1,fade=t=out:st=2.700:d=0.300:alpha=1,setpts=PTS-STARTPTS+2.000/TB[o0]',
      '[0:v][o0]overlay=eof_action=pass[b0]',
      '[4:v]format=rgba,setpts=PTS-STARTPTS+4.000/TB[o1]',
      '[b0][o1]overlay=eof_action=pass[b1]',
      '[b1]ass=subs.ass[vout]',
    ]);
  });

  it('scales the capture into a frame\'s screen, under the frame, before the overlays', () => {
    const graph = videoGraph([{ input: 2, start: 0, end: 1, fade: 0 }], undefined, { input: 3, screen: { x: 100, y: 40, width: 800, height: 450 }, output: { width: 1920, height: 1080 } });
    expect(graph.split(';').slice(0, 3)).toEqual([
      '[0:v]scale=800:450:flags=lanczos,setsar=1,pad=1920:1080:100:40:color=black[screen]',
      '[screen][3:v]overlay=0:0[framed]',
      '[2:v]format=rgba,setpts=PTS-STARTPTS+0.000/TB[o0]',
    ]);
    expect(graph).toContain('[framed][o0]overlay');
  });

  it('lays stage stretches over the capture at their start, below the overlays', () => {
    const graph = videoGraph([{ input: 2, start: 0, end: 1, fade: 0 }], undefined, undefined, [{ input: 3, start: 1.5 }, { input: 4, start: 6 }]);
    expect(graph.split(';').slice(0, 4)).toEqual([
      '[3:v]setpts=PTS-STARTPTS+1.500/TB[s0]',
      '[0:v][s0]overlay=eof_action=pass[staged0]',
      '[4:v]setpts=PTS-STARTPTS+6.000/TB[s1]',
      '[staged0][s1]overlay=eof_action=pass[staged1]',
    ]);
    expect(graph).toContain('[staged1][o0]overlay');
  });

  it('never lets the fades overlap on a short overlay', () => {
    expect(videoGraph([{ input: 1, start: 0, end: 0.4, fade: 1 }])).toContain('fade=t=out:st=0.200:d=0.200');
  });
});

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

  it('never lets the fades overlap on a short overlay', () => {
    expect(videoGraph([{ input: 1, start: 0, end: 0.4, fade: 1 }])).toContain('fade=t=out:st=0.200:d=0.200');
  });
});

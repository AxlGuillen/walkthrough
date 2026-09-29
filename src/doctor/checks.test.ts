import { describe, expect, it } from 'vitest';
import { ffmpegFinding, ffmpegVersion, formatFindings, nodeFinding, sessionFindings, sessionOf } from './checks.ts';

const allFilters = ['ass', 'sidechaincompress', 'loudnorm', 'overlay', 'aevalsrc', 'anoisesrc', 'amix', 'adelay']
  .map(name => ` TS ${name}     A->A  something`).join('\n');

describe('nodeFinding', () => {
  it('needs Node 24 and flags Intel builds on Apple Silicon', () => {
    expect(nodeFinding('v24.21.0', 'arm64', true).status).toBe('ok');
    expect(nodeFinding('v22.14.0', 'arm64', true).status).toBe('fail');
    expect(nodeFinding('v24.21.0', 'x64', true)).toMatchObject({ status: 'warn', detail: expect.stringContaining('FNM_ARCH=arm64') });
    expect(nodeFinding('v24.21.0', 'x64', false).status).toBe('ok');
  });
});

describe('ffmpeg', () => {
  it('reads the version from the banner', () => {
    expect(ffmpegVersion('ffmpeg version 8.1.1-tessus  https://evermeet.cx/ffmpeg/')).toBe('8.1.1-tessus');
    expect(ffmpegVersion('something else')).toBeNull();
  });

  it('requires the filters the pipeline uses, but only warns without libass', () => {
    const banner = 'ffmpeg version 8.1.1';
    expect(ffmpegFinding(banner, allFilters).status).toBe('ok');
    expect(ffmpegFinding(banner, allFilters.replace(/.*\bass\b.*\n/, ''))).toMatchObject({ status: 'warn', detail: expect.stringContaining('ass') });
    expect(ffmpegFinding(banner, allFilters.replace(/.*loudnorm.*\n/, ''))).toMatchObject({ status: 'fail', detail: expect.stringContaining('loudnorm') });
    expect(ffmpegFinding(null, '').status).toBe('fail');
  });
});

describe('sessions', () => {
  it('reports saved sessions and the ones a tour needs but nobody saved', () => {
    const findings = sessionFindings([{ name: 'uws-tasks', ageDays: 0 }, { name: 'old', ageDays: 40 }], ['uws-tasks', 'dymmsa', 'dymmsa']);
    expect(findings.map(f => [f.name, f.status, f.detail])).toEqual([
      ['session uws-tasks', 'ok', 'saved today'],
      ['session old', 'ok', 'saved 40 days ago'],
      ['session dymmsa', 'fail', 'a tour needs it; run: walkthrough login dymmsa <url>'],
    ]);
  });

  it('reads the session of a tour and ignores broken ones', () => {
    expect(sessionOf('title: x\nsession: uws-tasks\n')).toBe('uws-tasks');
    expect(sessionOf('title: x\n')).toBeUndefined();
    expect(sessionOf('title: [broken')).toBeUndefined();
  });
});

describe('formatFindings', () => {
  it('aligns names and ends with a verdict', () => {
    const text = formatFindings([{ name: 'node', status: 'ok', detail: 'v24' }, { name: 'ffmpeg', status: 'fail', detail: 'missing' }]);
    expect(text).toContain('✓ node    v24');
    expect(text).toContain('✗ ffmpeg  missing');
    expect(text.split('\n').at(-1)).toBe('1 problem to fix');
    expect(formatFindings([{ name: 'node', status: 'ok', detail: 'v24' }]).split('\n').at(-1)).toBe('ready to render');
  });
});

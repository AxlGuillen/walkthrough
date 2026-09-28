import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseRange, resolvePreview, resolveVideo, startGallery } from './gallery.ts';
import { publishVideo } from './library.ts';
import { escapeHtml, formatBytes, formatDuration, galleryPage } from './page.ts';

describe('resolveVideo', () => {
  it('accepts only mp4 files inside the library', () => {
    expect(resolveVideo('/v', 'uws/tablero/a.mp4')).toBe('/v/uws/tablero/a.mp4');
    expect(resolveVideo('/v', '../etc/passwd.mp4')).toBeNull();
    expect(resolveVideo('/v', '/v/../x.mp4')).toBeNull();
    expect(resolveVideo('/v', 'uws/a.json')).toBeNull();
    expect(resolveVideo('/v', 42)).toBeNull();
  });
});

describe('resolvePreview', () => {
  it('maps project/tour to its preview and nothing else', () => {
    expect(resolvePreview('/w', 'uws-tasks/tablero')).toBe('/w/tours/uws-tasks/tablero/preview/video.mp4');
    expect(resolvePreview('/w', '../etc')).toBeNull();
    expect(resolvePreview('/w', 'a/../b')).toBeNull();
    expect(resolvePreview('/w', 'a/b/c')).toBeNull();
    expect(resolvePreview('/w', null)).toBeNull();
  });
});

describe('parseRange', () => {
  it('reads open, closed and suffix ranges', () => {
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=10-999', 100)).toEqual({ start: 10, end: 99 });
  });

  it('rejects ranges it cannot satisfy', () => {
    expect(parseRange('bytes=200-', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
    expect(parseRange(undefined, 100)).toBeNull();
  });
});

describe('galleryPage', () => {
  const video = {
    title: '<b>Tour</b>', project: 'uws-tasks', tour: 'tablero', device: 'desktop' as const, duration: 64.7,
    bytes: 5 * 1024 * 1024, createdAt: '2026-09-28T18:00:00.000Z', file: '/v/uws-tasks/tablero/a.mp4', relative: 'uws-tasks/tablero/a.mp4',
  };

  it('groups videos by project and escapes what it shows', () => {
    const page = galleryPage({ videos: [video], cacheBytes: 0, videosRoot: '/v' });
    expect(page).toContain('<h2>uws-tasks</h2>');
    expect(page).toContain('&lt;b&gt;Tour&lt;/b&gt;');
    expect(page).toContain('src="/video?file=uws-tasks%2Ftablero%2Fa.mp4"');
    expect(page).toContain('1:05');
  });

  it('shows previews in their own section, served from the cache', () => {
    const page = galleryPage({ videos: [], previews: [{ ...video, key: 'uws-tasks/tablero' }], cacheBytes: 0, videosRoot: '/v' });
    expect(page).toContain('<h2>Vistas previas</h2>');
    expect(page).toContain('src="/video?preview=uws-tasks%2Ftablero"');
  });

  it('explains how to make the first video when there are none', () => {
    expect(galleryPage({ videos: [], cacheBytes: 0, videosRoot: '/v' })).toContain('Todavía no hay videos');
  });

  it('formats sizes, durations and HTML', () => {
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatDuration(125.4)).toBe('2:05');
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });
});

describe('gallery server', () => {
  let dir: string;
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'gallery-'));
    const source = path.join(dir, 'source.mp4');
    await writeFile(source, Buffer.from('0123456789'));
    await publishVideo(source, path.join(dir, 'videos', 'p', 't'), {
      title: 'T', project: 'p', tour: 't', device: 'desktop', duration: 1,
    }, new Date(2026, 8, 28, 12));
    server = await startGallery({ work: path.join(dir, 'work'), videos: path.join(dir, 'videos') }, 0);
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  afterAll(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('lists the library and streams byte ranges', async () => {
    expect(await (await fetch(base)).text()).toContain('p/t/2026-09-28_120000.mp4'.replaceAll('/', '%2F'));
    const partial = await fetch(`${base}/video?file=p%2Ft%2F2026-09-28_120000.mp4`, { headers: { Range: 'bytes=2-4' } });
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe('234');
  });

  it('refuses actions from other origins', async () => {
    const response = await fetch(`${base}/trash`, {
      method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'p/t/2026-09-28_120000.mp4' }),
    });
    expect(response.status).toBe(403);
  });
});

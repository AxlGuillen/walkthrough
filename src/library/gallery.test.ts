import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { libraryKey, parseRange, resolvePreview, resolveVideo, startGallery } from './gallery.ts';
import { publishVideo } from './library.ts';
import { isGallery } from './launch.ts';
import { escapeHtml, formatBytes, formatDuration, formatWhen, galleryPage, previewAnchor, shortenHome, stillAt, summarize, videoAnchor } from './page.ts';

describe('resolveVideo', () => {
  it('accepts only mp4 files inside the library', () => {
    expect(resolveVideo('/v', 'uws/tablero/a.mp4')).toBe(path.resolve('/v/uws/tablero/a.mp4'));
    expect(resolveVideo('/v', '../etc/passwd.mp4')).toBeNull();
    expect(resolveVideo('/v', '/v/../x.mp4')).toBeNull();
    expect(resolveVideo('/v', 'uws/a.json')).toBeNull();
    expect(resolveVideo('/v', 42)).toBeNull();
  });
});

describe('libraryKey', () => {
  it('names a video with forward slashes on every system', () => {
    expect(libraryKey(path.resolve('/v'), path.resolve('/v/uws/tablero/a.mp4'))).toBe('uws/tablero/a.mp4');
  });
});

describe('resolvePreview', () => {
  it('maps project/tour to its preview and nothing else', () => {
    expect(resolvePreview('/w', 'uws-tasks/tablero')).toBe(path.join('/w/tours/uws-tasks/tablero/preview/video.mp4'));
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
    expect(page).toContain('>uws-tasks</h2>');
    expect(page).toContain('&lt;b&gt;Tour&lt;/b&gt;');
    expect(page).not.toContain('<b>Tour</b>');
    expect(page).toContain('src="/video?file=uws-tasks%2Ftablero%2Fa.mp4"');
    expect(page).toContain('poster="/poster?file=uws-tasks%2Ftablero%2Fa.mp4&amp;t=12.9"');
    expect(page).toContain('1:05');
  });

  it('shows previews in their own section, served from the cache', () => {
    const page = galleryPage({ videos: [], previews: [{ ...video, key: 'uws-tasks/tablero' }], cacheBytes: 0, videosRoot: '/v' });
    expect(page).toContain('>Vistas previas</h2>');
    expect(page).toContain('src="/video?preview=uws-tasks%2Ftablero"');
    expect(galleryPage({ videos: [video], cacheBytes: 0, videosRoot: '/v' })).toContain('No hay vistas previas');
  });

  it('sums up the library and marks the latest render as new', () => {
    const older = { ...video, title: 'Old', relative: 'uws-tasks/tablero/b.mp4', createdAt: '2026-09-27T18:00:00.000Z' };
    const phone = { ...video, project: 'portfolio', tour: 'axl13', device: 'mobile' as const, relative: 'portfolio/axl13/c.mp4', createdAt: '2026-09-26T18:00:00.000Z' };
    expect(summarize([older, video, phone])).toMatchObject({ videos: 3, tours: 2, projects: 2, bytes: 15 * 1024 * 1024, latest: video });
    const page = galleryPage({ videos: [older, video, phone], cacheBytes: 0, videosRoot: '/Users/someone/Movies/walkthrough' });
    expect(page.match(/NUEVO/g)).toHaveLength(1);
    expect(page).toContain(`data-play="${videoAnchor(video.relative)}"`);
    expect(page).toContain('<span>9:16</span>');
    expect(page).toContain('~/Movies/walkthrough');
    expect(page).toContain('rel="icon" type="image/svg+xml"');
  });

  it('shortens the home folder on every system', () => {
    expect(shortenHome('/Users/someone/Movies/walkthrough')).toBe('~/Movies/walkthrough');
    expect(shortenHome('C:\\Users\\someone\\Videos\\walkthrough')).toBe('~\\Videos\\walkthrough');
    expect(shortenHome('/home/someone/Videos/walkthrough')).toBe('~/Videos/walkthrough');
    expect(shortenHome('/srv/videos')).toBe('/srv/videos');
  });

  it('gives every card a stable anchor and focuses the one in the URL hash', () => {
    const page = galleryPage({ videos: [video], previews: [{ ...video, key: 'uws-tasks/tablero' }], cacheBytes: 0, videosRoot: '/v' });
    expect(page).toContain(`id="${videoAnchor('uws-tasks/tablero/a.mp4')}"`);
    expect(page).toContain(`id="${previewAnchor('uws-tasks/tablero')}"`);
    expect(page).toContain("target.classList.add('focus')");
    expect(videoAnchor('uws-tasks/tablero/2026-09-28_140447.mp4')).toBe('v-uws-tasks-tablero-2026-09-28-140447');
    expect(previewAnchor('uws-tasks/tablero')).toBe('p-uws-tasks-tablero');
  });

  it('is recognized by its title, and other pages on the port are not', () => {
    expect(isGallery(galleryPage({ videos: [], cacheBytes: 0, videosRoot: '/v' }))).toBe(true);
    expect(isGallery('<html><title>Some other app</title></html>')).toBe(false);
  });

  it('explains how to make the first video when there are none', () => {
    expect(galleryPage({ videos: [], cacheBytes: 0, videosRoot: '/v' })).toContain('Todavía no hay videos');
  });

  it('picks a still past the opening title card, within the video', () => {
    expect(stillAt(100)).toBe('20.0');
    expect(stillAt(55)).toBe('11.0');
    expect(stillAt(5)).toBe('2.0');
    expect(stillAt(1)).toBe('0.5');
  });

  it('says when a video was made the way a person would', () => {
    const now = new Date(2026, 8, 30, 15, 0);
    expect(formatWhen(new Date(2026, 8, 30, 13, 18).toISOString(), now)).toMatch(/^hoy, 1:18/);
    expect(formatWhen(new Date(2026, 8, 29, 11, 28).toISOString(), now)).toMatch(/^ayer, 11:28/);
    expect(formatWhen(new Date(2026, 8, 28, 14, 4).toISOString(), now)).toMatch(/^28 sept?\.?, 2:04/);
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

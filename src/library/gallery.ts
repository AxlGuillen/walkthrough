import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileManagerName, revealFile } from '../desktop/desktop.ts';
import type { Storage } from '../tour/paths.ts';
import { clean } from './clean.ts';
import { listPreviews, listVideos, sizeOf, trashVideo } from './library.ts';
import { galleryPage } from './page.ts';
import { ensurePoster, posterFile } from './poster.ts';

export const GALLERY_PORT = 4717;

// Only videos under the library root can be served, revealed or trashed.
export function resolveVideo(videosRoot: string, relative: unknown): string | null {
  if (typeof relative !== 'string' || !relative.endsWith('.mp4')) return null;
  const file = path.resolve(videosRoot, relative);
  return file.startsWith(path.resolve(videosRoot) + path.sep) ? file : null;
}

// The page names videos by this key, so it is the same on every system.
export function libraryKey(videosRoot: string, file: string): string {
  return path.relative(videosRoot, file).split(path.sep).join('/');
}

export function resolvePreview(workRoot: string, key: unknown): string | null {
  if (typeof key !== 'string') return null;
  const parts = key.split('/');
  if (parts.length !== 2 || !parts.every(part => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')) return null;
  return path.join(workRoot, 'tours', parts[0]!, parts[1]!, 'preview', 'video.mp4');
}

export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from, to] = match;
  const start = from ? Number(from) : Math.max(0, size - Number(to));
  const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

export function startGallery(storage: Storage, port = GALLERY_PORT): Promise<http.Server> {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (request.method === 'GET' && url.pathname === '/') return await sendPage(storage, response);
      if (request.method === 'GET' && url.pathname === '/video') return await sendVideo(storage, url, request, response);
      if (request.method === 'GET' && url.pathname === '/poster') return await sendPoster(storage, url, response);
      if (request.method === 'POST') {
        // A page on another site could POST here blindly; only our own page may act.
        if (request.headers.origin !== `http://${request.headers.host}`) return reply(response, 403, 'forbidden');
        return await act(storage, url.pathname, await readJson(request), response);
      }
      reply(response, 404, 'not found');
    } catch (error) {
      reply(response, 500, (error as Error).message);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function sendPage(storage: Storage, response: http.ServerResponse) {
  const videos = (await listVideos(storage.videos)).map(v => ({ ...v, relative: libraryKey(storage.videos, v.file) }));
  const previews = await listPreviews(storage.work);
  const page = galleryPage({ videos, previews, cacheBytes: await sizeOf(path.join(storage.work, 'tours')), videosRoot: storage.videos, fileManager: fileManagerName() });
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(page);
}

function requestedVideo(storage: Storage, url: URL): string | null {
  return url.searchParams.has('preview')
    ? resolvePreview(storage.work, url.searchParams.get('preview'))
    : resolveVideo(storage.videos, url.searchParams.get('file'));
}

// Browsers seek video through Range requests; Safari refuses to play without them.
async function sendVideo(storage: Storage, url: URL, request: http.IncomingMessage, response: http.ServerResponse) {
  const file = requestedVideo(storage, url);
  if (!file || !existsSync(file)) return reply(response, 404, 'not found');
  const { size } = await stat(file);
  const range = parseRange(request.headers.range, size);
  if (request.headers.range && !range) {
    response.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return response.end();
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  response.writeHead(range ? 206 : 200, {
    'Content-Type': 'video/mp4',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  createReadStream(file, { start, end }).pipe(response);
}

// `t` is where the page wants the still, in seconds; resolveVideo and resolvePreview already
// keep both names inside their roots.
async function sendPoster(storage: Storage, url: URL, response: http.ServerResponse) {
  const file = requestedVideo(storage, url);
  const at = Number(url.searchParams.get('t') ?? 0);
  if (!file || !existsSync(file) || !Number.isFinite(at) || at < 0 || at > 3600) return reply(response, 404, 'not found');
  const preview = url.searchParams.get('preview');
  const poster = posterFile(storage.work, preview ? { preview } : { file: libraryKey(storage.videos, file) });
  await ensurePoster(file, poster, at);
  response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
  createReadStream(poster).pipe(response);
}

async function act(storage: Storage, action: string, body: { file?: unknown }, response: http.ServerResponse) {
  if (action === '/clean') {
    const { freed } = await clean(storage);
    return reply(response, 200, String(freed));
  }
  const file = resolveVideo(storage.videos, body.file);
  if (!file || !existsSync(file)) return reply(response, 404, 'video not found');
  if (action === '/reveal') {
    revealFile(file);
    return reply(response, 200, 'ok');
  }
  if (action === '/trash') {
    await trashVideo({ file });
    return reply(response, 200, 'ok');
  }
  reply(response, 404, 'unknown action');
}

async function readJson(request: http.IncomingMessage): Promise<{ file?: unknown }> {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function reply(response: http.ServerResponse, status: number, text: string) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(text);
}

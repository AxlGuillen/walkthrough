import type { Page, Request } from 'playwright-core';

// A request still open after this long is a stream (server-sent events, long polling), not
// an answer the app is waiting on: it stops holding frames back.
export const STREAM_AFTER_MS = 5_000;
const POLL_MS = 10;
// Turns of the page's task queue after an answer lands: the body is read, the app's state
// updates and it paints. Message ports, not timers: the page's timers are frozen.
const TURNS = 3;

const STREAMED = new Set(['eventsource', 'websocket', 'media']);

export interface NetworkWatch {
  // Waits, off the video's clock, until no answer is pending; then lets the page paint it.
  settle(): Promise<void>;
  dispose(): void;
}

type Watched = Pick<Page, 'on' | 'off' | 'evaluate'>;

interface WatchOptions {
  streamAfter?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// The app answers a click in the next frame, on any machine. Without this, an answer arrives
// in wall time while the capture advances frame by frame, so it lands on a later frame the
// faster the machine is, and the app's reaction drifts from the click's sound.
export function watchNetwork(page: Watched, { streamAfter = STREAM_AFTER_MS, now = Date.now, sleep = wait }: WatchOptions = {}): NetworkWatch {
  const open = new Map<Request, number>();
  let answered = false;
  const onRequest = (request: Request) => {
    if (!STREAMED.has(request.resourceType()) && !/^(data|blob):/.test(request.url())) open.set(request, now());
  };
  const onDone = (request: Request) => {
    if (open.delete(request)) answered = true;
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  return {
    async settle() {
      while ([...open.values()].some(since => now() - since < streamAfter)) await sleep(POLL_MS);
      if (!answered) return;
      answered = false;
      await page.evaluate(async turns => {
        for (let i = 0; i < turns; i++) {
          await new Promise<void>(resolve => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(0);
          });
        }
      }, TURNS).catch(() => {});
    },
    dispose() {
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    },
  };
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

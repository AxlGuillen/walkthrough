import { markColor, type MarkColor } from '../effects/marks.ts';
import { clickVisible, endLabelAt, endRingAt, labelVisible, ringVisible, TIMING } from '../effects/scene.ts';
import type { TimedAction } from '../timeline/build.ts';
import { fullFrame } from '../timeline/camera.ts';
import { charsDue, TRANSITION } from './schedule.ts';
import { assertSignedIn, dismissDialogs } from './setup.ts';
import type { Stage } from './stage.ts';
import { planScroll, queueScroll, scrollDistance, scrollDuration, type ScrollMode } from './scroll.ts';
import { aimAt, visibleBox, zoomRect } from './targets.ts';

const ZOOM_DURATION = 0.8;

export async function perform(stage: Stage, { time, action, transition }: TimedAction, seed: number): Promise<void> {
  const { page, clock, tour, device, camera, effects, log } = stage;
  switch (action.kind) {
    case 'goto': {
      // The opening load is the start of the video, not a change of screen.
      const opening = stage.time === 0;
      if (!opening && transition !== 'cut') log.push({ kind: 'navigate', time: stage.time });
      // A cut, or a stage transition that draws the change itself after capture.
      const still = opening || transition ? null : await snapshot(page);
      const requested = new URL(action.url, tour.url);
      await clock.settle(async () => {
        await page.goto(requested.href);
        await dismissDialogs(page, tour);
      });
      await assertSignedIn(page, tour, requested);
      if (still) await dissolveFrom(page, still);
      return;
    }
    case 'click': {
      const before = new URL(page.url());
      // A click that waits may lead to another page, which dissolves in like a goto.
      const still = (action.wait || action.tab) && !transition ? await snapshot(page) : null;
      if (action.tab) {
        // The other tab's address is loaded here instead: one page is recorded, and the
        // viewer sees the click lead straight to it.
        const opened = page.context().waitForEvent('page', { timeout: tour.waitTimeout * 1000 });
        await clickWithMark(stage, action.on, seed);
        log.push({ kind: 'navigate', time: stage.time });
        await clock.settle(async () => {
          const tab = await opened;
          await tab.waitForURL(url => url.href !== 'about:blank', { timeout: tour.waitTimeout * 1000 });
          const url = tab.url();
          await tab.close();
          await page.goto(url);
          if (action.wait) await page.locator(action.wait).first().waitFor({ state: 'visible', timeout: tour.waitTimeout * 1000 });
          await dismissDialogs(page, tour);
        });
        await assertSignedIn(page, tour, before);
        if (still) await dissolveFrom(page, still);
        return;
      }
      await clickWithMark(stage, action.on, seed);
      if (action.wait) {
        await waitFor(stage, action.wait);
        await assertSignedIn(page, tour, before);
        // A panel or a step inside the same page plays the app's own animation; only another
        // page is a change of screen.
        const changed = transition ? transition !== 'cut' : leftPage(before, new URL(page.url()));
        if (!changed) return;
        log.push({ kind: 'navigate', time: stage.time });
        if (still) await dissolveFrom(page, still);
      }
      return;
    }
    case 'wait':
      return waitFor(stage, action.until);
    case 'scroll': {
      const edge = action.to === 'top' || action.to === 'bottom';
      const mode: ScrollMode = edge ? (action.to as ScrollMode) : 'center';
      const planned = await planScroll(page, edge ? null : action.to, mode, action.within);
      const duration = action.duration ?? scrollDuration(planned.plans);
      for (const plan of planned.plans) queueScroll(stage.scrolls, plan, stage.time, duration);
      if (planned.plans.length) log.push({ kind: 'scroll', time: stage.time, duration, distance: Math.round(scrollDistance(planned.plans)) });
      return;
    }
    case 'hover': {
      const target = page.locator(action.on).first();
      const aim = await aimAt(target);
      return target.hover(aim ? { position: aim.position } : {});
    }
    case 'type': {
      await page.locator(action.into).first().fill('');
      await clickWithMark(stage, action.into, seed);
      stage.typing = { text: action.text, start: stage.time, typed: 0 };
      log.push({ kind: 'type', time: stage.time, chars: action.text.length });
      return;
    }
    case 'zoom': {
      const fit = {
        ...(action.padding === undefined ? {} : { padding: action.padding }),
        ...(action.scale === undefined ? {} : { scale: action.scale }),
      };
      const rect = action.to === 'out' ? fullFrame(device.viewport) : await zoomRect(page, action.to, device, fit);
      camera.push({ time, duration: action.duration ?? ZOOM_DURATION, rect, follow: action.follow ?? false });
      log.push({ kind: 'zoom', time, direction: action.to === 'out' ? 'out' : 'in' });
      return;
    }
    case 'highlight': {
      const box = await visibleBox(page.locator(action.on).first(), `highlight target "${action.on}"`);
      const radius = await page.locator(action.on).first()
        .evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0).catch(() => undefined);
      const style = action.style ?? tour.highlightStyle;
      const lines = style === 'marker' || style === 'underline' ? await textLineBoxes(page, action.on) : [];
      effects.rings.push({
        time: stage.time, rect: box, hold: action.duration ?? TIMING.ringHold, seed, track: action.on,
        style, color: markColor(action.color as MarkColor | undefined, style, tour.accent),
        ...(radius === undefined ? {} : { radius }), ...(lines.length ? { lines } : {}), ...(action.side ? { side: action.side } : {}),
      });
      log.push({ kind: 'ring', time: stage.time, style });
      return;
    }
    case 'label': {
      const box = await visibleBox(page.locator(action.on).first(), `label target "${action.on}"`);
      effects.labels.push({
        time: stage.time, rect: box, text: action.text, hold: action.duration ?? TIMING.labelHold, seed, track: action.on,
        ...(action.side ? { side: action.side } : {}),
      });
      log.push({ kind: 'label', time: stage.time });
      return;
    }
  }
}

// The element's rendered lines of text, relative to its box: client rects of its text, merged
// per line. Empty for an element without text (an icon, an image).
async function textLineBoxes(page: Stage['page'], selector: string): Promise<{ x: number; y: number; width: number; height: number }[]> {
  return page.locator(selector).first().evaluate(el => {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines: { x: number; y: number; right: number; bottom: number }[] = [];
    for (const r of [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1)) {
      const line = lines.find(l => Math.abs((l.y + l.bottom) / 2 - (r.top + r.bottom) / 2) < r.height / 2);
      if (line) Object.assign(line, { x: Math.min(line.x, r.left), y: Math.min(line.y, r.top), right: Math.max(line.right, r.right), bottom: Math.max(line.bottom, r.bottom) });
      else lines.push({ x: r.left, y: r.top, right: r.right, bottom: r.bottom });
    }
    return lines.map(l => ({ x: l.x - box.x, y: l.y - box.y, width: l.right - l.x, height: l.bottom - l.y }));
  }).catch(() => []);
}

export function leftPage(before: URL, after: URL): boolean {
  return before.origin !== after.origin || before.pathname !== after.pathname;
}

// The page as the viewer last saw it, without the effects layer: the marks carry on live
// above the dissolve instead of fading out with the old page.
async function snapshot(page: Stage['page']): Promise<string> {
  await page.evaluate(() => window.__walkthrough?.draw?.(''));
  return (await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64');
}

async function dissolveFrom(page: Stage['page'], still: string): Promise<void> {
  await page.evaluate(([src, ms]) => window.__walkthrough?.fadeFrom?.(src, ms), [`data:image/jpeg;base64,${still}`, TRANSITION * 1000] as const);
}

// The mark is placed before clicking: the click may navigate away from the target.
async function clickWithMark({ page, time, effects, log }: Stage, selector: string, seed: number): Promise<void> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const aim = await aimAt(target);
  await target.click(aim ? { position: aim.position } : {});
  if (aim) effects.clicks.push({ time, at: aim.point, seed, track: { selector, offset: aim.position } });
  log.push({ kind: 'click', time });
}

async function waitFor({ page, clock, tour }: Stage, selector: string): Promise<void> {
  await clock.settle(async () => {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: tour.waitTimeout * 1000 });
    await dismissDialogs(page, tour);
  });
}

// Marks are looked up every frame; an element that went away must not stall the capture, so
// whether it is there is asked without waiting (count). Once it is, the lookup may take as long
// as a busy machine needs: a short wall-clock limit would retire marks only on a loaded Mac.
const MARK_LOOKUP = 10_000;

async function present(page: Stage['page'], selector: string) {
  const all = page.locator(selector);
  return (await all.count().catch(() => 0)) > 0 ? all.first() : null;
}

type Presence = 'shown' | 'covered' | 'gone';

// Whether the viewer can still see a marked element: at least half of it (or of the
// screen, for a huge one) on screen, and most of five points across that part hitting the
// element itself. The effects and dissolve layers ignore pointer events, so they are not hit.
export async function presence(page: Stage['page'], selector: string): Promise<Presence> {
  const target = await present(page, selector);
  if (!target) return 'gone';
  return target.evaluate((el): Presence => {
    const r = el.getBoundingClientRect();
    const [left, top] = [Math.max(r.left, 0), Math.max(r.top, 0)];
    const [right, bottom] = [Math.min(r.right, innerWidth), Math.min(r.bottom, innerHeight)];
    const onScreen = Math.max(0, right - left) * Math.max(0, bottom - top);
    const whole = Math.min(r.width * r.height, innerWidth * innerHeight);
    if (whole <= 0 || onScreen < whole * 0.5) return 'gone';
    const at = (fx: number, fy: number) => document.elementFromPoint(left + (right - left) * fx, top + (bottom - top) * fy);
    const points = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const;
    const covered = points.filter(([fx, fy]) => {
      const hit = at(fx, fy);
      return hit !== null && hit !== el && !el.contains(hit) && !hit.contains(el);
    }).length;
    return covered >= 3 ? 'covered' : 'shown';
  }, undefined, { timeout: MARK_LOOKUP }).catch((): Presence => 'gone');
}

// Fades out any mark whose element the viewer can no longer see.
export async function fadeHiddenMarks({ page, time, effects, log }: Stage): Promise<void> {
  for (const ring of effects.rings) {
    if (!ring.track || !ringVisible(time, ring) || (await presence(page, ring.track)) === 'shown') continue;
    const shown = endRingAt(ring, time);
    if (shown !== null) log.push({ kind: 'cut', time, mark: 'ring', shown });
  }
  for (const label of effects.labels) {
    if (!label.track || !labelVisible(time, label) || (await presence(page, label.track)) === 'shown') continue;
    const shown = endLabelAt(label, time);
    if (shown !== null) log.push({ kind: 'cut', time, mark: 'label', shown });
  }
}

// Keeps rings and click marks on their element while the page moves under them.
export async function retrackMarks({ page, time, effects }: Stage): Promise<void> {
  for (const ring of effects.rings) {
    if (!ring.track || !ringVisible(time, ring)) continue;
    const box = await (await present(page, ring.track))?.boundingBox({ timeout: MARK_LOOKUP }).catch(() => null);
    if (box) ring.rect = box;
  }
  for (const label of effects.labels) {
    if (!label.track || !labelVisible(time, label)) continue;
    const box = await (await present(page, label.track))?.boundingBox({ timeout: MARK_LOOKUP }).catch(() => null);
    if (box) label.rect = box;
  }
  for (const click of effects.clicks) {
    if (!click.track || !clickVisible(time, click)) continue;
    const box = await (await present(page, click.track.selector))?.boundingBox({ timeout: MARK_LOOKUP }).catch(() => null);
    // A click that navigated leaves its mark where it happened; no need to look again.
    if (box) click.at = { x: box.x + click.track.offset.x, y: box.y + click.track.offset.y };
    else delete click.track;
  }
}

export async function continueTyping(stage: Stage): Promise<void> {
  const { typing, page, time } = stage;
  if (!typing) return;
  const due = charsDue(typing.text.length, typing.start, time);
  if (due > typing.typed) {
    await page.keyboard.type(typing.text.slice(typing.typed, due));
    typing.typed = due;
  }
  if (typing.typed === typing.text.length) stage.typing = null;
}

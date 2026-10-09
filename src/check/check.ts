import type { Page } from 'playwright-core';
import { localeOf } from '../charts/scale.ts';
import { clipSources, missingMessage, staleMessage } from '../clips/prepare.ts';
import { deviceProfile } from '../capture/devices.ts';
import { looksLikeLogin, openContext } from '../capture/session.ts';
import { dismissDialogs, installSetup } from '../capture/setup.ts';
import { captureDevice } from '../frame/layout.ts';
import { dataDependent, suggest } from '../inspect/selectors.ts';
import { snapshotPage } from '../inspect/snapshot.ts';
import { layoutFlow } from '../flow/layout.ts';
import { resourceFor } from '../resources/registry.ts';
import { CAMERA, stagePlan } from '../stage/plan.ts';
import { resolveOverlay } from '../overlays/render.ts';
import type { Size } from '../timeline/camera.ts';
import type { Timeline, TimedAction } from '../timeline/build.ts';
import type { Storage } from '../tour/paths.ts';
import { clipName, type Tour } from '../tour/schema.ts';
import { selectorOf, worst, type CheckItem, type Status } from './report.ts';

const ACTION_TIMEOUT = 5_000;

// Walks the tour with the page running freely and no frames captured: the same clicks as a
// render, in seconds instead of minutes, stopping at nothing so every problem shows up.
// Overlays are files, not screens: they only need to exist, in the tour or among the templates.
export function checkOverlays(tourDir: string, timeline: Timeline): CheckItem[] {
  return timeline.overlays.map(overlay => {
    const found = resolveOverlay(tourDir, overlay.src);
    return {
      time: overlay.start, label: `overlay ${overlay.src}`, status: found ? 'ok' : 'fail',
      notes: found ? [] : ['not found in the tour folder or templates/overlays'],
    };
  });
}

// Clips are cut from renders made on this machine: report the ones missing or older than their tour,
// at the first moment an overlay plays them.
export async function checkClips(tour: Pick<Tour, 'clips'>, timeline: Timeline, tourDir: string, root: string, storage: Storage): Promise<CheckItem[]> {
  const firstUse = (name: string) => Math.min(...timeline.overlays.filter(o => Object.values(o.params).some(v => clipName(v) === name)).map(o => o.start), Infinity);
  return (await clipSources(tour, tourDir, root, storage)).map(source => ({
    time: Number.isFinite(firstUse(source.name)) ? firstUse(source.name) : 0,
    label: `clip ${source.name} (${source.tourFile})`,
    status: !source.render ? 'fail' : source.stale ? 'warn' : 'ok',
    notes: !source.render ? [missingMessage(source)] : source.stale ? [staleMessage(source)] : [],
  }));
}

// Below this, a step is gone before anyone can read it.
export const MIN_STEP_GAP = 0.7;

export function checkFlows(timeline: Timeline, canvas: Size): CheckItem[] {
  return timeline.overlays.flatMap(({ flow, start }) => {
    if (!flow) return [];
    const notes: string[] = [];
    flow.steps.forEach((step, i) => {
      const gap = i > 0 ? step.time - flow.steps[i - 1]!.time : Infinity;
      if (gap < MIN_STEP_GAP) notes.push(`"${step.text}" comes ${gap.toFixed(2)}s after the step before: too fast to read; say more between them`);
    });
    // Beside the screen, a step that comes before the screen has moved aside lands on top of it.
    const first = flow.steps[0];
    if (flow.mode === 'aside' && first && first.time - start < CAMERA.move) {
      notes.push(`"${first.text}" comes ${(first.time - start).toFixed(2)}s after the flow starts, while the screen is still moving aside (${CAMERA.move}s); start the flow on an earlier word`);
    }
    layoutFlow(flow, canvas).boxes.forEach((box, i) => {
      if (box.truncated) notes.push(`"${flow.steps[i]!.text}" does not fit its box and gets cut; shorten it or move words to detail`);
    });
    return [{ time: start, label: `flow (${flow.steps.length} steps)`, status: notes.length ? 'warn' : 'ok', notes }];
  });
}

// Resource overlays (charts, code) laid out as the render will, reporting what would not read.
export function checkResources(timeline: Timeline, canvas: Size, lang: string): CheckItem[] {
  return timeline.overlays.flatMap(overlay => {
    const resource = resourceFor(overlay.src);
    if (!resource || overlay.data === undefined) return [];
    const notes = resource.warnings(overlay.data, canvas, lang, overlay.beats, overlay.end - overlay.start);
    return [{ time: overlay.start, label: `${overlay.src} data`, status: notes.length ? 'warn' : 'ok', notes }];
  });
}

// Camera shots, with what the stage could not fit: a mark too close to straighten for.
export function checkShots(timeline: Timeline, portrait = false): CheckItem[] {
  const { notes } = stagePlan(timeline, portrait);
  return [
    ...timeline.shots.map(({ time, shot }) => ({ time, label: `shot ${shot.to}`, status: 'ok' as const, notes: [] })),
    ...notes.map(({ time, note }) => ({ time, label: 'camera', status: 'warn' as const, notes: [note] })),
  ];
}

export async function checkTour(root: string, tour: Tour, timeline: Timeline): Promise<CheckItem[]> {
  const context = await openContext(root, {
    headless: true, device: { ...deviceProfile(captureDevice(tour.device, tour.frame)), deviceScaleFactor: 1 }, locale: localeOf(tour.language),
    ...(tour.session ? { session: tour.session } : {}),
  });
  const items: CheckItem[] = [];
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await installSetup(page, tour);
    for (const timed of timeline.actions) items.push(await checkAction(page, tour, timed));
  } finally {
    await context.close();
  }
  return items;
}

async function checkAction(page: Page, tour: Tour, { time, action }: TimedAction): Promise<CheckItem> {
  const label = describe(action);
  const notes: string[] = [];
  const statuses: Status[] = ['ok'];
  const flag = (status: Status, note: string) => { statuses.push(status); notes.push(note); };

  try {
    if (action.kind === 'goto') {
      const requested = new URL(action.url, tour.url);
      await page.goto(requested.href);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await dismissDialogs(page, tour);
      const landed = new URL(page.url());
      const password = (await page.locator('input[type=password]').count()) > 0;
      if (looksLikeLogin(requested, landed, password)) {
        flag('fail', `landed on a login page (${landed.pathname}); run: walkthrough login ${tour.session ?? '<session>'} ${tour.url}`);
      } else if (landed.pathname !== requested.pathname) {
        flag('warn', `redirected to ${landed.pathname}`);
      }
    }

    if (action.kind === 'scroll' && action.within && (await page.locator(action.within).count()) === 0) {
      flag('fail', `scroll container ${action.within} not found`);
    }

    const selector = selectorOf(action);
    if (selector) {
      if (dataDependent(selector)) flag('warn', 'depends on data that may change; prefer a structural selector');
      const target = page.locator(selector);
      // Screens reached by a client-side click have no load event; give them the time a
      // render would, instead of reporting an element that is still on its way.
      // A wait: may be on a slow server; it gets the tour's patience, like the render.
      const patience = action.kind === 'wait' ? tour.waitTimeout * 1000 : ACTION_TIMEOUT;
      await target.first().waitFor({ state: 'attached', timeout: patience }).catch(() => {});
      const count = await target.count();
      if (count === 0) {
        flag('fail', 'not found on this screen');
        const snapshot = await snapshotPage(page);
        for (const s of suggest(selector, snapshot.elements.filter(e => e.visible))) {
          notes.push(`did you mean ${s.selector}${s.text ? `  (“${s.text.slice(0, 40)}”)` : ''}`);
        }
      } else {
        if (count > 1) flag('warn', `${count} matches; the first one is used`);
        if (!(await target.first().isVisible())) flag('fail', 'exists but is not visible');
        else await act(page, tour, action, selector);
      }
    }

    const dialogs = (await snapshotPage(page)).dialogs;
    if (dialogs.length) flag('warn', `dialog open: “${dialogs[0]!.slice(0, 60)}” (onboarding?)`);
  } catch (error) {
    flag('fail', (error as Error).message.split('\n')[0]!);
  }
  return { time, label, status: worst(statuses), notes };
}

async function act(page: Page, tour: Tour, action: TimedAction['action'], selector: string): Promise<void> {
  const target = page.locator(selector).first();
  const patience = tour.waitTimeout * 1000;
  if (action.kind === 'click' && action.tab) {
    const opened = page.context().waitForEvent('page', { timeout: patience });
    await target.click({ timeout: ACTION_TIMEOUT });
    const tab = await opened.catch(() => { throw new Error('the click opened no tab'); });
    await tab.waitForURL(url => url.href !== 'about:blank', { timeout: patience });
    const url = tab.url();
    await tab.close();
    await page.goto(url);
  } else if (action.kind === 'click') await target.click({ timeout: ACTION_TIMEOUT });
  // An upload writes to the app: check only finds what opens the picker, never answers it.
  else if (action.kind === 'upload') await target.waitFor({ state: 'attached', timeout: ACTION_TIMEOUT });
  else if (action.kind === 'hover') await target.hover({ timeout: ACTION_TIMEOUT });
  else if (action.kind === 'type') await target.fill(action.text, { timeout: ACTION_TIMEOUT });
  if (action.kind === 'click') await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  if (action.kind === 'click' && action.wait) {
    await page.locator(action.wait).first().waitFor({ state: 'visible', timeout: patience })
      .catch(() => { throw new Error(`${action.wait} did not show after the click`); });
  }
}

function describe(action: TimedAction['action']): string {
  switch (action.kind) {
    case 'goto': return `goto ${action.url}`;
    case 'type': return `type into ${action.into}`;
    case 'zoom': return `zoom ${action.to}`;
    case 'scroll': return `scroll ${action.to}${action.within ? ` within ${action.within}` : ''}`;
    case 'wait': return `wait ${action.until}`;
    default: return `${action.kind} ${action.on}`;
  }
}

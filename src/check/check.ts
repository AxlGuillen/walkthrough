import type { Page } from 'playwright-core';
import { deviceProfile } from '../capture/devices.ts';
import { openContext } from '../capture/session.ts';
import { dataDependent, suggest } from '../inspect/selectors.ts';
import { snapshotPage } from '../inspect/snapshot.ts';
import { resolveOverlay } from '../overlays/render.ts';
import type { Timeline, TimedAction } from '../timeline/build.ts';
import type { Tour } from '../tour/schema.ts';
import { looksLikeLogin, selectorOf, worst, type CheckItem, type Status } from './report.ts';

const ACTION_TIMEOUT = 5_000;
const WAIT_TIMEOUT = 15_000;

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

export async function checkTour(root: string, tour: Tour, timeline: Timeline): Promise<CheckItem[]> {
  const context = await openContext(root, {
    headless: true, device: { ...deviceProfile(tour.device), deviceScaleFactor: 1 },
    ...(tour.session ? { session: tour.session } : {}),
  });
  const items: CheckItem[] = [];
  try {
    const page = context.pages()[0] ?? (await context.newPage());
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
      await target.first().waitFor({ state: 'attached', timeout: ACTION_TIMEOUT }).catch(() => {});
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
        else await act(page, action, selector);
      }
    }

    const dialogs = (await snapshotPage(page)).dialogs;
    if (dialogs.length) flag('warn', `dialog open: “${dialogs[0]!.slice(0, 60)}” (onboarding?)`);
  } catch (error) {
    flag('fail', (error as Error).message.split('\n')[0]!);
  }
  return { time, label, status: worst(statuses), notes };
}

async function act(page: Page, action: TimedAction['action'], selector: string): Promise<void> {
  const target = page.locator(selector).first();
  if (action.kind === 'click') await target.click({ timeout: ACTION_TIMEOUT });
  else if (action.kind === 'hover') await target.hover({ timeout: ACTION_TIMEOUT });
  else if (action.kind === 'type') await target.fill(action.text, { timeout: ACTION_TIMEOUT });
  if (action.kind === 'click') await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  if (action.kind === 'click' && action.wait) {
    await page.locator(action.wait).first().waitFor({ state: 'visible', timeout: WAIT_TIMEOUT })
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

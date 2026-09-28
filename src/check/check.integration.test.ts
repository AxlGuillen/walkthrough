import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../timeline/build.ts';
import { parseTour } from '../tour/load.ts';
import { checkOverlays, checkTour } from './check.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const url = pathToFileURL(path.join(ROOT, 'tests/fixtures/check/index.html')).href;

describe('checkTour', () => {
  it('reports every problem of the tour in one pass', async () => {
    const tour = parseTour(`
title: Check
url: ${url}
segments:
  - hold: 1
    do:
      - goto: index.html
      - highlight: "[data-tour=panel]"
      - highlight: .dup
      - click: "#ghost"
      - highlight: "[data-tour=pannel]"
      - zoom: 'text="UWS-142 · Estimado 3h"'
      - click: 'button:has-text("Guardar")'
      - highlight: "[data-tour=late]"
  - hold: 1
    do:
      - goto: welcome.html
  - hold: 1
    do:
      - goto: private.html
`);
    const items = await checkTour(ROOT, tour, buildTimeline(tour, []));
    const byLabel = Object.fromEntries(items.map(item => [item.label, item]));

    expect(byLabel['goto index.html']?.status).toBe('ok');
    expect(byLabel['highlight [data-tour=panel]']?.status).toBe('ok');
    expect(byLabel['highlight .dup']).toMatchObject({ status: 'warn', notes: ['2 matches; the first one is used'] });
    expect(byLabel['click #ghost']).toMatchObject({ status: 'fail', notes: ['exists but is not visible'] });
    expect(byLabel['highlight [data-tour=pannel]']?.status).toBe('fail');
    expect(byLabel['highlight [data-tour=pannel]']?.notes.join('\n')).toContain('did you mean [data-tour=panel]');
    expect(byLabel['zoom text="UWS-142 · Estimado 3h"']?.notes).toContain('depends on data that may change; prefer a structural selector');
    expect(byLabel['click button:has-text("Guardar")']?.status).toBe('ok');
    expect(byLabel['highlight [data-tour=late]']?.status).toBe('ok');
    expect(byLabel['goto welcome.html']?.notes.join('\n')).toContain('dialog open: “Bienvenido al recorrido');
    expect(byLabel['goto private.html']?.status).toBe('fail');
    expect(byLabel['goto private.html']?.notes[0]).toMatch(/^landed on a login page \(.*login\.html\)/);
  }, 60_000);

  it('checks that every overlay exists, in the tour folder or the shared templates', () => {
    const tour = parseTour(`
title: Check
url: ${url}
segments:
  - hold: 1
    overlays: [{ src: lower-third.html }, { src: missing.html }]
`);
    const items = checkOverlays(path.dirname(new URL(url).pathname), buildTimeline(tour, []));
    expect(items.map(i => [i.label, i.status])).toEqual([['overlay lower-third.html', 'ok'], ['overlay missing.html', 'fail']]);
  });
});

import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { inspectApp } from './inspect.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(tmpdir(), `inspect-${process.pid}`);
afterAll(async () => { await rm(outDir, { recursive: true, force: true }); });

describe('inspectApp', () => {
  it('visits the start page and its navigation, and reports what it saw', async () => {
    const url = pathToFileURL(path.join(ROOT, 'tests/fixtures/check/index.html')).href;
    const report = await readFile(await inspectApp({ root: ROOT, url, outDir }), 'utf8');

    expect(report).toContain('[data-tour=panel]');
    expect(report).toContain('button:has-text("Guardar cambios")');
    expect(report).toContain('«Bienvenido al recorrido');
    expect(report).toMatch(/Terminó en `.*login\.html`/);
    expect(['01.png', '02.png', '03.png'].every(file => existsSync(path.join(outDir, file)))).toBe(true);
  }, 60_000);
});

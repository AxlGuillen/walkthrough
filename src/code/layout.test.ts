import { describe, expect, it } from 'vitest';
import type { Rect } from '../timeline/camera.ts';
import { codeBeats, codeScene } from './layout.ts';
import { codeSchema, parseLines } from './schema.ts';

const desktop = { width: 1920, height: 1080 };
const mobile = { width: 1080, height: 1920 };
const inside = (r: Rect, c: { width: number; height: number }) => r.x >= 0 && r.y >= 0 && r.x + r.width <= c.width + 0.5 && r.y + r.height <= c.height + 0.5;
const code = (data: object) => codeSchema.parse(data);

describe('codeScene', () => {
  const editor = code({ language: 'ts', file: 'a.ts', code: 'const a = 1;\nconst b = 2;\nreturn a + b;\n', highlight: [{ lines: '1-2', note: 'Setup' }, { lines: 3, at: 'return' }] });

  for (const [name, canvas] of [['16:9', desktop], ['9:16', mobile]] as const) {
    for (const mode of ['full', 'card'] as const) {
      it(`${name} ${mode}: the window holds its code inside the frame`, () => {
        const scene = codeScene({ ...editor, mode }, canvas, 'es');
        expect(inside(scene.window, canvas)).toBe(true);
        expect(scene.body.y + scene.body.height).toBeLessThanOrEqual(scene.window.y + scene.window.height + 0.5);
        expect(scene.lines.length * scene.line).toBeLessThanOrEqual(scene.body.height + 0.5);
      });
    }
  }

  it('numbers an editor, reveals it line by line and spreads highlights after it', () => {
    const scene = codeScene(editor, desktop, 'es', { h1: 4 });
    expect(scene.lines.map(l => l.number)).toEqual([1, 2, 3]);
    expect(scene.lines[0]!.tokens[0]).toEqual({ kind: 'keyword', text: 'const' });
    expect(scene.lines.map(l => l.start)).toEqual([0.5, 0.58, 0.66]);
    expect(scene.highlights.map(h => h.lines)).toEqual([[0, 1], [2]]);
    expect(scene.highlights[1]!.time).toBe(4);
    expect(scene.highlights[0]!.time).toBeLessThan(4);
    expect(scene.label).toBe('a.ts');
  });

  it('reads a diff from its marks and a terminal from its prompts, typing each command after the last', () => {
    const diff = codeScene(code({ view: 'diff', code: ' keep\n-old\n+new' }), desktop, 'es');
    expect(diff.lines.map(l => [l.kind, l.chars])).toEqual([['code', 4], ['del', 3], ['add', 3]]);
    const terminal = codeScene(code({ view: 'terminal', code: '$ bun test\nok\n$ bun run build\ndone', run: [2] }), desktop, 'es', { r0: 2 });
    expect(terminal.lines.map(l => l.kind)).toEqual(['command', 'output', 'command', 'output']);
    expect(terminal.lines[0]).toMatchObject({ start: 2, cps: 22, number: null });
    expect(terminal.lines[1]!.start).toBeGreaterThan(2 + 8 / 22);
    expect(terminal.lines[2]!.start).toBeGreaterThan(terminal.lines[1]!.start);
    expect(terminal.label).toBe('Terminal');
  });

  it('types an editor out line after line when asked', () => {
    const scene = codeScene(code({ code: 'abcd\nef', reveal: 'type' }), desktop, 'es');
    expect(scene.lines[0]).toMatchObject({ start: 0.5, cps: 38 });
    expect(scene.lines[1]!.start).toBeCloseTo(0.5 + 4 / 38 + 0.05);
  });

  it('zooms into a highlight on long code, and warns when code cannot fit', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const scene = codeScene(code({ code: long, highlight: [{ lines: '10-11' }] }), desktop, 'es');
    expect(scene.highlights[0]!.focus.scale).toBeGreaterThan(1);
    // Zoomed, the widest line still fits the body.
    expect(scene.gutter + 7 * scene.font * 0.62 * scene.highlights[0]!.focus.scale).toBeLessThanOrEqual(scene.body.width);
    const wide = Array.from({ length: 20 }, (_, i) => (i === 3 ? 'x'.repeat(150) : `line ${i}`)).join('\n');
    expect(codeScene(code({ code: wide, highlight: [{ lines: 10 }] }), desktop, 'es').highlights[0]!.focus.scale).toBe(1);
    expect(codeScene(code({ code: 'short', highlight: [{ lines: 1 }] }), desktop, 'es').highlights[0]!.focus.scale).toBe(1);
    expect(codeScene(code({ code: 'x'.repeat(400) }), mobile, 'es').warnings[0]).toMatch(/does not fit/);
    expect(codeScene(code({ code: 'x'.repeat(88) }), mobile, 'es').warnings[0]).toMatch(/set small: lines of 88 characters.*under \d+/);
    expect(codeScene(code({ code: 'x'.repeat(88) }), desktop, 'es').warnings).toEqual([]);
    expect(codeScene(code({ code: 'a', highlight: [{ lines: 3 }] }), desktop, 'es').warnings[0]).toMatch(/past the end/);
    // 40 characters typed at 22 per second from 0.6s end near 2.4s: a 2s overlay leaves first.
    expect(codeScene(code({ view: 'terminal', code: `$ ${'x'.repeat(40)}` }), desktop, 'es', {}, 2).warnings[0]).toMatch(/still typing/);
    expect(codeScene(code({ view: 'terminal', code: `$ ${'x'.repeat(40)}` }), desktop, 'es', {}, 5).warnings).toEqual([]);
  });
});

describe('code data', () => {
  it('reads line ranges as the viewer counts them', () => {
    expect(parseLines(3)).toEqual([3]);
    expect(parseLines('3-5, 8')).toEqual([3, 4, 5, 8]);
    expect(codeSchema.safeParse({ code: 'a', highlight: [{ lines: 'three' }] }).success).toBe(false);
  });

  it('names the beats of highlights and commands', () => {
    expect(codeBeats(code({ code: 'a', highlight: [{ lines: 1, at: 'here' }, { lines: 1 }], run: ['build'] }))).toEqual({ h0: 'here', r0: 'build' });
  });
});

import { describe, expect, it } from 'vitest';
import { languageOf, tokenize, tokenLines, type TokenKind } from './highlight.ts';

// The kind given to each piece of text, ignoring whitespace-only runs.
const kinds = (code: string, language: string) => tokenize(code, language)
  .filter(t => t.text.trim())
  .map(t => [t.text.trim(), t.kind] as [string, TokenKind]);

describe('tokenize', () => {
  it('colors TypeScript the way an editor does', () => {
    const tokens = new Map(kinds('const total = await fetchOrders(id); // cached\nconst name: string = user.profile.name;', 'ts'));
    expect(tokens.get('const')).toBe('keyword');
    expect(tokens.get('await')).toBe('keyword');
    expect(tokens.get('fetchOrders')).toBe('function');
    expect(tokens.get('// cached')).toBe('comment');
    expect(tokens.get('profile')).toBe('property');
  });

  it('knows strings, numbers, types and object keys', () => {
    const tokens = new Map(kinds('const res = new Response("ok", { status: 200 });', 'ts'));
    expect(tokens.get('"ok"')).toBe('string');
    expect(tokens.get('200')).toBe('number');
    expect(tokens.get('Response')).toBe('function');
    expect(tokens.get('status')).toBe('property');
    expect(new Map(kinds('let order: Order;', 'ts')).get('Order')).toBe('type');
  });

  it('handles JSON, YAML, shell, SQL and HTML', () => {
    expect(new Map(kinds('{ "id": 42, "ok": true }', 'json'))).toEqual(new Map([['{', 'punct'], ['"id"', 'property'], [':', 'punct'], ['42', 'number'], [',', 'punct'], ['"ok"', 'property'], ['true', 'keyword'], ['}', 'punct']]));
    expect(new Map(kinds('segments:\n  - say: Hola # voz', 'yaml')).get('say')).toBe('property');
    const shell = new Map(kinds('$ bun run walkthrough --preview "$TOUR"', 'bash'));
    expect(shell.get('bun')).toBe('function');
    expect(shell.get('--preview')).toBe('attr');
    expect(shell.get('"$TOUR"')).toBe('string');
    expect(new Map(kinds("SELECT id FROM orders WHERE status = 'open'", 'sql')).get('SELECT')).toBe('keyword');
    expect(new Map(kinds('<a href="/x">Ir</a>', 'html')).get('href')).toBe('attr');
  });

  it('keeps unknown languages plain, and never loses a character', () => {
    expect(tokenize('whatever 123', 'brainfuck')).toEqual([{ kind: 'plain', text: 'whatever 123' }]);
    for (const [code, lang] of [['const a = `x${b}`; /* c */', 'ts'], ['def f(x):\n    return "y"', 'python'], ['a { color: red; }', 'css']] as const) {
      expect(tokenize(code, lang).map(t => t.text).join('')).toBe(code);
    }
  });
});

describe('tokenLines', () => {
  it('splits tokens at line breaks, a multi-line comment included', () => {
    const lines = tokenLines('/* one\ntwo */\nconst x = 1;', 'ts');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual([{ kind: 'comment', text: '/* one' }]);
    expect(lines[1]).toEqual([{ kind: 'comment', text: 'two */' }]);
    expect(lines[2]![0]).toEqual({ kind: 'keyword', text: 'const' });
  });

  it('resolves language aliases', () => {
    expect(languageOf('TypeScript')).toBe('js');
    expect(languageOf('yml')).toBe('yaml');
    expect(languageOf('zsh')).toBe('bash');
    expect(languageOf('cobol')).toBeNull();
  });
});

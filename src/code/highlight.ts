// A small syntax highlighter for code shown in videos: enough to color keywords, strings,
// comments, numbers, calls and types the way an editor does, with no dependency. Not a
// parser: short snippets only, and anything it does not recognize stays plain.

export type TokenKind =
  | 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'type'
  | 'property' | 'punct' | 'tag' | 'attr' | 'variable' | 'operator';

export interface Token {
  kind: TokenKind;
  text: string;
}

interface Rule {
  kind: TokenKind | 'word';
  re: RegExp;
}

const WORD = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0x[\da-fA-F]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)[a-z%]*/y;
const SPACE = /\s+/y;

const JS_KEYWORDS = new Set(('const let var function return if else for while do switch case break continue new delete typeof instanceof in of '
  + 'class extends super this import export from default async await yield try catch finally throw true false null undefined void '
  + 'interface type enum implements readonly public private protected static as satisfies keyof declare namespace').split(' '));
const PY_KEYWORDS = new Set(('def class return if elif else for while in not and or is import from as with try except finally raise pass break '
  + 'continue lambda yield async await True False None global nonlocal').split(' '));
const SQL_KEYWORDS = new Set(('select from where and or not insert into values update set delete create table alter drop join left right inner outer '
  + 'on group by order having limit offset as distinct null is in like between case when then else end primary key foreign references '
  + 'default returning with union all index view').split(' '));
const BASH_KEYWORDS = new Set('if then else elif fi for while do done case esac in function return export local sudo'.split(' '));

const C_LIKE: Rule[] = [
  { kind: 'comment', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
  { kind: 'string', re: /`(?:\\[\s\S]|[^\\`])*`|"(?:\\.|[^\\"\n])*"|'(?:\\.|[^\\'\n])*'/y },
  { kind: 'number', re: NUMBER },
  { kind: 'word', re: WORD },
  { kind: 'operator', re: /=>|===|!==|[=!<>]=?|&&|\|\||\?\?|[+\-*/%]=?|\.\.\./y },
  { kind: 'punct', re: /[{}()[\];,.:?]/y },
];

const RULES: Record<string, Rule[]> = {
  js: C_LIKE,
  json: [
    { kind: 'string', re: /"(?:\\.|[^\\"\n])*"/y },
    { kind: 'number', re: /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/y },
    { kind: 'word', re: WORD },
    { kind: 'punct', re: /[{}[\],:]/y },
  ],
  yaml: [
    { kind: 'comment', re: /#[^\n]*/y },
    { kind: 'property', re: /[\w.-]+(?=\s*:(?:\s|$))/y },
    { kind: 'string', re: /"(?:\\.|[^\\"\n])*"|'[^'\n]*'/y },
    { kind: 'number', re: /-?\d+(?:\.\d+)?(?![\w.-])/y },
    { kind: 'word', re: WORD },
    { kind: 'punct', re: /[:\-[\]{},|>]/y },
  ],
  bash: [
    { kind: 'comment', re: /#[^\n]*/y },
    { kind: 'string', re: /"(?:\\.|[^\\"])*"|'[^']*'/y },
    { kind: 'variable', re: /\$\{?[\w]+\}?/y },
    { kind: 'attr', re: /--?[\w-]+(?:=\S*)?/y },
    { kind: 'word', re: /[\w./~@:+-]+/y },
    { kind: 'operator', re: /\|\||&&|[|&;<>]/y },
  ],
  css: [
    { kind: 'comment', re: /\/\*[\s\S]*?\*\//y },
    { kind: 'string', re: /"[^"\n]*"|'[^'\n]*'/y },
    { kind: 'property', re: /[\w-]+(?=\s*:[^:{]*[;}])/y },
    { kind: 'number', re: /-?\d*\.?\d+(?:px|rem|em|vh|vw|vmin|%|s|ms|deg)?/y },
    { kind: 'type', re: /[.#][\w-]+/y },
    { kind: 'word', re: /[\w-]+/y },
    { kind: 'punct', re: /[{}();:,>]/y },
  ],
  sql: [
    { kind: 'comment', re: /--[^\n]*/y },
    { kind: 'string', re: /'(?:''|[^'])*'/y },
    { kind: 'number', re: NUMBER },
    { kind: 'word', re: WORD },
    { kind: 'operator', re: /[=<>!]=?|[*+\-/]/y },
    { kind: 'punct', re: /[(),;.]/y },
  ],
  html: [
    { kind: 'comment', re: /<!--[\s\S]*?-->/y },
    { kind: 'tag', re: /<\/?[\w-]+|\/?>/y },
    { kind: 'attr', re: /[\w-:@]+(?==)/y },
    { kind: 'string', re: /"[^"]*"|'[^']*'/y },
    { kind: 'punct', re: /=/y },
  ],
  python: [
    { kind: 'comment', re: /#[^\n]*/y },
    { kind: 'string', re: /"""[\s\S]*?"""|'''[\s\S]*?'''|[rbf]?"(?:\\.|[^\\"\n])*"|[rbf]?'(?:\\.|[^\\'\n])*'/y },
    { kind: 'number', re: NUMBER },
    { kind: 'word', re: WORD },
    { kind: 'operator', re: /[=!<>]=?|[+\-*/%@]=?|->/y },
    { kind: 'punct', re: /[()[\]{}:,.]/y },
  ],
};

const ALIASES: Record<string, string> = {
  ts: 'js', tsx: 'js', jsx: 'js', javascript: 'js', typescript: 'js', mjs: 'js',
  yml: 'yaml', sh: 'bash', zsh: 'bash', shell: 'bash', console: 'bash', py: 'python', xml: 'html', svg: 'html', postgres: 'sql',
};

export function languageOf(language: string | undefined): string | null {
  if (!language) return null;
  const key = language.toLowerCase();
  const resolved = ALIASES[key] ?? key;
  return RULES[resolved] ? resolved : null;
}

// Words the rules found only as identifiers: a keyword, a type (Capitalized), a call (a word
// right before "("), a property (right after "."), or in shell, the command of its line.
function classify(language: string, word: string, before: string, after: string, lineStart: boolean): TokenKind {
  if (language === 'js' && JS_KEYWORDS.has(word)) return 'keyword';
  if (language === 'python' && PY_KEYWORDS.has(word)) return 'keyword';
  if (language === 'sql') return SQL_KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'plain';
  if (language === 'json' || language === 'yaml') return ['true', 'false', 'null', 'yes', 'no'].includes(word) ? 'keyword' : 'plain';
  if (language === 'bash') {
    if (BASH_KEYWORDS.has(word)) return 'keyword';
    return lineStart ? 'function' : 'plain';
  }
  if (language === 'css') return 'plain';
  if (/^\s*\(/.test(after)) return 'function';
  if (/\.\s*$/.test(before)) return 'property';
  if (/^[A-Z]/.test(word)) return 'type';
  return 'plain';
}

export function tokenize(code: string, language: string | undefined): Token[] {
  const lang = languageOf(language);
  if (!lang) return [{ kind: 'plain', text: code }];
  const rules = RULES[lang]!;
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = tokens.at(-1);
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ kind, text });
  };
  let i = 0;
  while (i < code.length) {
    SPACE.lastIndex = i;
    const space = SPACE.exec(code);
    if (space) { push('plain', space[0]); i += space[0].length; continue; }
    let matched = false;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (!m || m[0].length === 0) continue;
      let kind: TokenKind;
      if (rule.kind === 'word') {
        const before = code.slice(Math.max(0, i - 80), i);
        const after = code.slice(i + m[0].length, i + m[0].length + 3);
        const lineStart = /(^|\n)[\t ]*(\$ )?$/.test(before) || /[|;&]\s*$/.test(before);
        kind = classify(lang, m[0], before, after, lineStart);
        // An object key: a word followed by ":" right after "{", "," or the start of a line.
        if (lang === 'js' && kind === 'plain' && /^\s*:(?!:)/.test(after) && /(^|\n|[{,])\s*$/.test(before)) kind = 'property';
      } else if (rule.kind === 'string' && lang === 'json' && /^\s*:/.test(code.slice(i + m[0].length))) {
        kind = 'property';
      } else {
        kind = rule.kind;
      }
      push(kind, m[0]);
      i += m[0].length;
      matched = true;
      break;
    }
    if (!matched) { push('plain', code[i]!); i += 1; }
  }
  return tokens;
}

// The same tokens cut at line breaks, so each line can be revealed or highlighted alone.
export function tokenLines(code: string, language: string | undefined): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokenize(code, language)) {
    token.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ kind: token.kind, text: part });
    });
  }
  return lines;
}

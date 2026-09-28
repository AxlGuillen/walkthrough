import type { Size } from '../timeline/camera.ts';
import type { Word } from '../voice/types.ts';

const MAX_WORDS = 3;
const MAX_GAP = 0.5;

export function groupWords(words: readonly Word[], maxWords = MAX_WORDS, maxGap = MAX_GAP): Word[][] {
  const lines: Word[][] = [];
  for (const word of words) {
    const line = lines.at(-1);
    const last = line?.at(-1);
    if (line && last && line.length < maxWords && word.start - last.end <= maxGap) line.push(word);
    else lines.push([word]);
  }
  return lines;
}

// ASS karaoke: each word switches from white to the accent as it is spoken. {\k} runs in
// centiseconds until the next word starts, so the highlight never leaves gaps.
export function karaokeAss(words: readonly Word[], output: Size, accent: string): string {
  const vertical = output.height > output.width;
  const size = Math.round(output.width * (vertical ? 0.062 : 0.036));
  // Vertical videos sit higher, above the controls social apps draw at the bottom.
  const margin = Math.round(output.height * (vertical ? 0.21 : 0.08));
  const outline = Math.max(2, Math.round(size * 0.07));
  const shadow = Math.max(1, Math.round(size * 0.05));

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${output.width}`,
    `PlayResY: ${output.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: K,Arial,${size},${assColor(accent)},&H00FFFFFF,&H00141414,&H78000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},2,60,60,${margin},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = groupWords(words).map(line => {
    const text = line.map((word, i) => {
      const until = line[i + 1]?.start ?? word.end;
      return `{\\k${Math.max(1, Math.round((until - word.start) * 100))}}${escape(word.text)}`;
    }).join(' ');
    return `Dialogue: 0,${assTime(line[0]!.start)},${assTime(line.at(-1)!.end)},K,,0,0,0,,${text}`;
  });

  return [...header, ...events, ''].join('\n');
}

export function assColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => hex.slice(i, i + 2).toUpperCase());
  return `&H00${b}${g}${r}`;
}

export function assTime(seconds: number): string {
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function escape(text: string): string {
  return text.replace(/[{}\\]/g, '');
}

// One line for the stages that render side by side: frames done of each, summed over the
// overlays or stage spans that run at once.
export interface Progress {
  (stage: string, frame: number, item?: number): void;
  log(line: string): void;
  end(): void;
}

export function progressLine(totals: Record<string, number>, done: Record<string, number>): string {
  return Object.entries(totals).filter(([, total]) => total > 0)
    .map(([stage, total]) => `${stage} ${done[stage] ?? 0}/${total}`).join(' · ');
}

export function renderProgress(totals: Record<string, number>, write = (text: string) => { process.stderr.write(text); }): Progress {
  const frames = new Map<string, Map<number, number>>();
  const done = () => Object.fromEntries([...frames].map(([stage, items]) => [stage, [...items.values()].reduce((a, b) => a + b, 0)]));
  const show = () => write(`\r  ${progressLine(totals, done())}   `);
  const progress = ((stage: string, frame: number, item = 0) => {
    if (!frames.has(stage)) frames.set(stage, new Map());
    frames.get(stage)!.set(item, frame);
    show();
  }) as Progress;
  progress.log = line => { write(`\n${line}\n`); show(); };
  progress.end = () => { if (Object.values(totals).some(total => total > 0)) write('\n'); };
  return progress;
}

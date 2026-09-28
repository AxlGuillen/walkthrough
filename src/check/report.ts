export type Status = 'ok' | 'warn' | 'fail';

export interface CheckItem {
  time: number;
  label: string;
  status: Status;
  notes: string[];
}

const SYMBOL: Record<Status, string> = { ok: '✓', warn: '⚠', fail: '✗' };

export function worst(statuses: readonly Status[]): Status {
  return statuses.includes('fail') ? 'fail' : statuses.includes('warn') ? 'warn' : 'ok';
}

export function formatReport(items: readonly CheckItem[]): string {
  const lines = items.flatMap(item => [
    `${SYMBOL[item.status]} ${item.time.toFixed(2).padStart(6)}s  ${item.label}`,
    ...item.notes.map(note => `            ${note}`),
  ]);
  const count = (status: Status) => items.filter(item => item.status === status).length;
  lines.push('', `${count('ok')} ok · ${count('warn')} warnings · ${count('fail')} failures`);
  return lines.join('\n');
}

// Selector-bound actions are what can go missing between renders.
export function selectorOf(action: { kind: string } & Record<string, unknown>): string | null {
  const selector = action.on ?? action.into ?? (action.kind === 'zoom' && action.to !== 'out' ? action.to : undefined);
  return typeof selector === 'string' ? selector : null;
}

// A login page after a navigation almost always means the saved session expired.
export function looksLikeLogin(requested: URL, landed: URL, hasPasswordField: boolean): boolean {
  if (hasPasswordField) return true;
  return landed.pathname !== requested.pathname && /log-?in|sign-?in|auth/i.test(landed.pathname);
}

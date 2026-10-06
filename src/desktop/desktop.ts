import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

export interface Command {
  command: string;
  args: string[];
  env?: Record<string, string>;
  verbatim?: boolean;
}

// On Windows the target travels in an environment variable, so PowerShell never parses it.
const powershell = (script: string, env: Record<string, string>): Command => ({
  command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', script], env,
});

export function openCommand(target: string, platform: NodeJS.Platform = process.platform): Command {
  if (platform === 'darwin') return { command: 'open', args: [target] };
  if (platform === 'win32') return powershell('Start-Process -FilePath $env:WALKTHROUGH_TARGET', { WALKTHROUGH_TARGET: target });
  return { command: 'xdg-open', args: [target] };
}

export function revealCommand(file: string, platform: NodeJS.Platform = process.platform): Command {
  if (platform === 'darwin') return { command: 'open', args: ['-R', file] };
  // Explorer only understands /select when the path is quoted inside the same argument.
  if (platform === 'win32') return { command: 'explorer.exe', args: [`/select,"${file}"`], verbatim: true };
  return { command: 'xdg-open', args: [path.dirname(file)] };
}

export function recycleCommand(target: string): Command {
  return powershell([
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    '$target = $env:WALKTHROUGH_TARGET',
    "if (Test-Path -LiteralPath $target -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, 'OnlyErrorDialogs', 'SendToRecycleBin') }"
      + " else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, 'OnlyErrorDialogs', 'SendToRecycleBin') }",
  ].join('; '), { WALKTHROUGH_TARGET: target });
}

export function fileManagerName(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return 'Finder';
  if (platform === 'win32') return 'Explorador';
  return 'Carpeta';
}

// Opening a window is a convenience: if it fails, the render or the gallery still stands.
function launch({ command, args, env, verbatim }: Command): void {
  const child = spawn(command, args, {
    detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: verbatim,
    env: env && { ...process.env, ...env },
  });
  child.on('error', error => console.warn(`  could not open it (${command}: ${error.message})`));
  child.unref();
}

export function openPath(target: string): void {
  launch(openCommand(target));
}

export function revealFile(file: string): void {
  launch(revealCommand(file));
}

export async function recycle(target: string): Promise<void> {
  const { command, args, env } = recycleCommand(target);
  await promisify(execFile)(command, args, { env: { ...process.env, ...env }, windowsHide: true });
}

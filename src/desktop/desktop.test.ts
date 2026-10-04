import { describe, expect, it } from 'vitest';
import { fileManagerName, openCommand, recycleCommand, revealCommand } from './desktop.ts';

describe('openCommand', () => {
  it('uses each system opener', () => {
    expect(openCommand('http://localhost:4717/#v-a', 'darwin')).toEqual({ command: 'open', args: ['http://localhost:4717/#v-a'] });
    expect(openCommand('/v/a.mp4', 'linux')).toEqual({ command: 'xdg-open', args: ['/v/a.mp4'] });
  });

  it('keeps the target out of the PowerShell script on Windows', () => {
    const command = openCommand('C:\\v\\a & b.mp4', 'win32');
    expect(command.command).toBe('powershell.exe');
    expect(command.args.join(' ')).not.toContain('a & b');
    expect(command.env).toEqual({ WALKTHROUGH_TARGET: 'C:\\v\\a & b.mp4' });
  });
});

describe('revealCommand', () => {
  it('selects the file in the file manager', () => {
    expect(revealCommand('/v/a.mp4', 'darwin')).toEqual({ command: 'open', args: ['-R', '/v/a.mp4'] });
    expect(revealCommand('C:\\my videos\\a.mp4', 'win32')).toEqual({ command: 'explorer.exe', args: ['/select,"C:\\my videos\\a.mp4"'], verbatim: true });
    expect(revealCommand('/v/p/a.mp4', 'linux')).toEqual({ command: 'xdg-open', args: ['/v/p'] });
  });
});

describe('recycleCommand', () => {
  it('sends files and folders to the Recycle Bin without parsing the path', () => {
    const command = recycleCommand("C:\\v\\it's.mp4");
    expect(command.args.join(' ')).toContain('SendToRecycleBin');
    expect(command.args.join(' ')).not.toContain("it's");
    expect(command.env).toEqual({ WALKTHROUGH_TARGET: "C:\\v\\it's.mp4" });
  });

  it('keeps else on the same statement as its if', () => {
    expect(recycleCommand('C:\\v\\a.mp4').args.join(' ')).not.toMatch(/;\s*else/);
  });
});

describe('fileManagerName', () => {
  it('names the file manager the way each system does', () => {
    expect(fileManagerName('darwin')).toBe('Finder');
    expect(fileManagerName('win32')).toBe('Explorador');
    expect(fileManagerName('linux')).toBe('Carpeta');
  });
});

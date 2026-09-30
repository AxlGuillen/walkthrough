import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { deviceProfile, FPS, type Device } from '../../capture/devices.ts';
import { backdropArgs, catalogShots } from '../../overlays/catalog.ts';
import { renderOverlays } from '../../overlays/render.ts';
import { buildTimeline } from '../../timeline/build.ts';
import { parseTour } from '../../tour/load.ts';
import { ROOT, STORAGE } from '../context.ts';

export const CATALOG_TOUR = path.join(ROOT, 'tours/examples/catalogo.yaml');
const COLUMNS = 4;

// Every resource rendered alone over a backdrop, at preview size, plus a contact sheet with
// one still per entry: the visual catalog and the check that nothing broke.
export async function catalog(devices: string | undefined, theme: string | undefined, open: boolean): Promise<void> {
  const base = parseTour(await readFile(CATALOG_TOUR, 'utf8'));
  if (base.segments.some(segment => segment.say !== undefined)) throw new Error('the catalog has no narration: use hold and beats in seconds');
  const list: Device[] = devices === 'both' ? ['desktop', 'mobile'] : [devices === 'mobile' ? 'mobile' : 'desktop'];
  const sheets: string[] = [];

  for (const device of list) {
    const tour = { ...base, device, theme: theme === 'light' ? 'light' as const : base.theme };
    const timeline = buildTimeline(tour, []);
    const outDir = path.join(STORAGE.work, 'catalog', `${device}-${tour.theme}`);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(path.join(outDir, 'shots'), { recursive: true });
    const output = deviceProfile(device, 'preview').output;
    const started = Date.now();
    await renderOverlays({
      overlays: timeline.overlays, tourDir: path.dirname(CATALOG_TOUR), outDir,
      canvas: deviceProfile(device).output, output, fps: FPS.preview,
      look: { accent: tour.accent, theme: tour.theme, lang: tour.language },
      onFrame: (overlay, frame, total) => process.stderr.write(`\r  ${device} ${overlay}/${timeline.overlays.length}: ${frame}/${total}   `),
    });
    process.stderr.write('\n');

    const video = path.join(outDir, 'catalog.mp4');
    execFileSync('ffmpeg', backdropArgs(timeline.overlays, output, FPS.preview, timeline.duration, video), { cwd: outDir });
    const shots = catalogShots(timeline);
    shots.forEach((shot, i) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', shot.time.toFixed(2), '-i', video, '-frames:v', '1',
      path.join(outDir, 'shots', `${String(i + 1).padStart(3, '0')}.png`)]));
    const sheet = path.join(outDir, 'sheet.png');
    const rows = Math.ceil(shots.length / COLUMNS);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(outDir, 'shots', '%03d.png'),
      '-vf', `tile=${COLUMNS}x${rows}:padding=12:margin=12:color=0x2a2a2a`, '-frames:v', '1', sheet]);

    console.log(`✓ ${device} (${tour.theme}) in ${((Date.now() - started) / 1000).toFixed(0)}s\n  ${video}\n  ${sheet}`);
    console.log(shots.map((shot, i) => `    ${String(i + 1).padStart(2)}. ${shot.label}`).join('\n'));
    sheets.push(sheet);
  }
  if (open) execFile('open', sheets);
}

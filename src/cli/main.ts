import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { catalog } from './commands/catalog.ts';
import { check } from './commands/check.ts';
import { cleanUp } from './commands/clean.ts';
import { doctor } from './commands/doctor.ts';
import { gallery } from './commands/gallery.ts';
import { inspect } from './commands/inspect.ts';
import { login } from './commands/login.ts';
import { overlay } from './commands/overlay.ts';
import { render } from './commands/render.ts';
import { voice } from './commands/voice.ts';
import { ROOT, STORAGE } from './context.ts';

const USAGE = `usage:
  walkthrough doctor                  check Node, ffmpeg, Chrome, Fish and saved sessions
  walkthrough login <session> <url>   sign in by hand once; the profile is reused by renders
  walkthrough voice <tour.yaml>       synthesize narration and write the timeline
  walkthrough check <tour.yaml>       walk the tour without recording: selectors, session, dialogs
  walkthrough inspect <url>           read-only report of routes, stable selectors, dialogs, scroll areas
      --session=<name>                use a saved login
      --device=mobile                 inspect with the phone viewport
  walkthrough render <tour.yaml>      voice, timeline, capture, overlays and compose
      --preview                       half size at 15 fps, kept out of ~/Movies, shown in the gallery
      --open                          open the gallery on the new video when done
      --from=overlays                 reuse the capture; re-render overlays and compose
      --from=compose                  reuse capture and overlays; only rebuild the final video
  walkthrough overlay <template.html> render one overlay alone, to design a resource without a tour
      --beats=title=0.4,line=1.2      its beats, in seconds
      --params=title=Hola             its params
      --data=<file.yaml|json>         its structured data
      --duration=5  --device=mobile  --theme=light  --accent=#D9F24A  --lang=en  --texture=grain  --brand=dymmsa  --open
  walkthrough catalog                 render every resource alone (tours/examples/catalogo.yaml) with a contact sheet
      --device=mobile|both  --theme=light  --texture=grain  --brand=dymmsa  --open
  walkthrough gallery                 browse, reveal and trash generated videos
  walkthrough clean                   delete working files (videos are never touched)
      --voice                         also delete the voice cache
      --keep=<n>                      move all but the newest n renders of each tour to the Trash

videos: ${STORAGE.videos}
cache:  ${STORAGE.work}`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: 'string' }, voice: { type: 'boolean' }, keep: { type: 'string' }, 'no-open': { type: 'boolean' },
    session: { type: 'string' }, device: { type: 'string' }, preview: { type: 'boolean' }, open: { type: 'boolean' },
    beats: { type: 'string' }, params: { type: 'string' }, data: { type: 'string' }, duration: { type: 'string' },
    theme: { type: 'string' }, accent: { type: 'string' }, lang: { type: 'string' }, texture: { type: 'string' }, brand: { type: 'string' },
  },
});
const [command, target, url] = positionals;
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

try {
  if (command === 'voice' && target) await voice(target);
  else if (command === 'check' && target) await check(target);
  else if (command === 'inspect' && target) await inspect(target, values.session, values.device);
  else if (command === 'render' && target) await render(target, values.from, values.preview ?? false, values.open ?? false);
  else if (command === 'overlay' && target) {
    const { beats, params, data, duration, device, theme, accent, lang, texture, brand } = values;
    await overlay({ src: target, open: values.open ?? false, beats, params, data, duration, device, theme, accent, lang, texture, brand });
  }
  else if (command === 'catalog') await catalog({ device: values.device, theme: values.theme, texture: values.texture, brand: values.brand, open: values.open ?? false });
  else if (command === 'gallery') await gallery(!values['no-open']);
  else if (command === 'doctor') await doctor();
  else if (command === 'clean') await cleanUp(values.voice ?? false, values.keep);
  else if (command === 'login' && target && url) await login(target, url);
  else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
}

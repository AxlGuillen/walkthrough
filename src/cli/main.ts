import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { check } from './commands/check.ts';
import { cleanUp } from './commands/clean.ts';
import { gallery } from './commands/gallery.ts';
import { inspect } from './commands/inspect.ts';
import { login } from './commands/login.ts';
import { render } from './commands/render.ts';
import { voice } from './commands/voice.ts';
import { ROOT, STORAGE } from './context.ts';

const USAGE = `usage:
  walkthrough login <session> <url>   sign in by hand once; the profile is reused by renders
  walkthrough voice <tour.yaml>       synthesize narration and write the timeline
  walkthrough check <tour.yaml>       walk the tour without recording: selectors, session, dialogs
  walkthrough inspect <url>           read-only report of routes, stable selectors, dialogs, scroll areas
      --session=<name>                use a saved login
      --device=mobile                 inspect with the phone viewport
  walkthrough render <tour.yaml>      voice, timeline, capture, overlays and compose
      --from=overlays                 reuse the capture; re-render overlays and compose
      --from=compose                  reuse capture and overlays; only rebuild the final video
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
    session: { type: 'string' }, device: { type: 'string' },
  },
});
const [command, target, url] = positionals;
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

try {
  if (command === 'voice' && target) await voice(target);
  else if (command === 'check' && target) await check(target);
  else if (command === 'inspect' && target) await inspect(target, values.session, values.device);
  else if (command === 'render' && target) await render(target, values.from);
  else if (command === 'gallery') await gallery(!values['no-open']);
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

import { login as openLogin } from '../../capture/session.ts';
import { ROOT } from '../context.ts';

export async function login(session: string, url: string): Promise<void> {
  console.log(`Sign in to ${url} in the Chrome window, then close it. The session is kept in .auth/${session}.`);
  await openLogin(ROOT, session, url);
  console.log('Session saved.');
}

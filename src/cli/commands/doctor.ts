import { formatFindings } from '../../doctor/checks.ts';
import { runDoctor } from '../../doctor/doctor.ts';
import { ROOT, STORAGE } from '../context.ts';

export async function doctor(): Promise<void> {
  const findings = await runDoctor({ root: ROOT, storage: STORAGE, ...(process.env.FISH_API_KEY ? { apiKey: process.env.FISH_API_KEY } : {}) });
  console.log(formatFindings(findings));
  if (findings.some(f => f.status === 'fail')) process.exitCode = 1;
}

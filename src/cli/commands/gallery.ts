import { execFile } from 'node:child_process';
import { GALLERY_PORT, startGallery } from '../../library/gallery.ts';
import { STORAGE } from '../context.ts';

export async function gallery(open: boolean): Promise<void> {
  const server = await startGallery(STORAGE).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') throw error;
    return startGallery(STORAGE, 0);
  });
  const address = server.address();
  const url = `http://localhost:${typeof address === 'object' && address ? address.port : GALLERY_PORT}`;
  console.log(`gallery at ${url} (ctrl+c to stop)`);
  if (open) execFile('open', [url]);
}

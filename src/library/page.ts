import type { VideoEntry } from './library.ts';

export interface GalleryData {
  videos: readonly (VideoEntry & { relative: string })[];
  previews?: readonly (VideoEntry & { key: string })[];
  cacheBytes: number;
  videosRoot: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function galleryPage({ videos, previews = [], cacheBytes, videosRoot }: GalleryData): string {
  const projects = new Map<string, (typeof videos)[number][]>();
  for (const video of videos) projects.set(video.project, [...(projects.get(video.project) ?? []), video]);
  const total = videos.reduce((sum, v) => sum + v.bytes, 0);
  const date = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

  const sections = [...projects].map(([project, list]) => `
    <section>
      <h2>${escapeHtml(project)}</h2>
      <div class="grid">${list.map(video => `
        <article class="${video.device}">
          <video controls preload="metadata" src="/video?file=${encodeURIComponent(video.relative)}"></video>
          <div class="meta">
            <h3>${escapeHtml(video.title)}</h3>
            <p>${escapeHtml(video.tour)} · ${date(video.createdAt)}</p>
            <p class="facts"><span>${formatDuration(video.duration)}</span><span>${formatBytes(video.bytes)}</span><span>${video.device === 'mobile' ? 'Vertical' : 'Horizontal'}</span></p>
            <div class="actions">
              <button data-action="reveal" data-file="${escapeHtml(video.relative)}">Mostrar en Finder</button>
              <button data-action="trash" data-file="${escapeHtml(video.relative)}" class="danger">A la Papelera</button>
            </div>
          </div>
        </article>`).join('')}
      </div>
    </section>`).join('');

  const previewSection = previews.length ? `
    <section>
      <h2>Vistas previas</h2>
      <p class="hint">Media resolución a 15 fps, para revisar ritmo y encuadre. Cada una se reemplaza con la siguiente vista previa del tour.</p>
      <div class="grid">${previews.map(preview => `
        <article class="${preview.device}">
          <video controls preload="metadata" src="/video?preview=${encodeURIComponent(preview.key)}"></video>
          <div class="meta">
            <h3>${escapeHtml(preview.title)}</h3>
            <p>${escapeHtml(preview.key)} · ${date(preview.createdAt)}</p>
            <p class="facts"><span>${formatDuration(preview.duration)}</span><span>${formatBytes(preview.bytes)}</span></p>
          </div>
        </article>`).join('')}
      </div>
    </section>` : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>walkthrough · videos</title>
<style>
  :root { --bg: #f6f5fb; --card: #fff; --ink: #1b1830; --muted: #6b6784; --line: #e4e1ef; --accent: #5b3fd9; --danger: #c62f4a; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f0d1a; --card: #1a1729; --ink: #eeeaff; --muted: #9a95b8; --line: #2c2842; --accent: #9b85ff; --danger: #ff6b81; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--ink); font: 15px/1.45 -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; }
  main { max-width: 1200px; margin: 0 auto; }
  header { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; justify-content: space-between; margin-bottom: 32px; }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.5px; }
  header p { margin: 4px 0 0; color: var(--muted); }
  h2 { font-size: 18px; margin: 32px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 16px; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
  video { width: 100%; aspect-ratio: 16 / 9; background: #000; display: block; }
  article.mobile video { aspect-ratio: 9 / 16; max-height: 520px; }
  .meta { padding: 12px 14px 14px; }
  h3 { margin: 0; font-size: 15px; }
  .meta p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .facts { display: flex; gap: 10px; }
  .actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  button { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  button:hover { border-color: var(--accent); color: var(--accent); }
  button.danger:hover { border-color: var(--danger); color: var(--danger); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .hint { color: var(--muted); font-size: 13px; margin: -6px 0 12px; }
  .empty { padding: 48px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 14px; }
  code { font-size: 13px; overflow-wrap: anywhere; }
  header > div { min-width: 0; }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Videos generados</h1>
      <p>${videos.length} ${videos.length === 1 ? 'video' : 'videos'} · ${formatBytes(total)} en <code>${escapeHtml(videosRoot)}</code></p>
    </div>
    <div class="actions">
      <button data-action="clean" class="primary">Limpiar caché (${formatBytes(cacheBytes)})</button>
    </div>
  </header>
  ${previewSection}
  ${sections || '<p class="empty">Todavía no hay videos. Genera uno con <code>walkthrough render tours/&lt;proyecto&gt;/&lt;tour&gt;.yaml</code>.</p>'}
</main>
<script>
  document.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, file } = button.dataset;
    if (action === 'trash' && !confirm('¿Mandar este video a la Papelera?')) return;
    if (action === 'clean' && !confirm('Se borran los archivos de trabajo. Los videos no se tocan. ¿Continuar?')) return;
    button.disabled = true;
    const response = await fetch('/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });
    if (!response.ok) alert(await response.text());
    if (action !== 'reveal') location.reload();
    button.disabled = false;
  });
</script>
</body>
</html>`;
}

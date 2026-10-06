import type { VideoEntry } from './library.ts';

type Video = VideoEntry & { relative: string };
type Preview = VideoEntry & { key: string };

export interface GalleryData {
  videos: readonly Video[];
  previews?: readonly Preview[];
  cacheBytes: number;
  videosRoot: string;
  fileManager?: string;
  now?: Date;
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

// "hoy, 1:18 p.m.", "ayer, 11:28 a.m." or "28 sep., 2:04 p.m.", in the machine's time zone.
export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayOf(now) - dayOf(date)) / 86_400_000);
  if (days === 0) return `hoy, ${time}`;
  if (days === 1) return `ayer, ${time}`;
  return `${date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ${time}`;
}

export interface LibrarySummary {
  videos: number;
  tours: number;
  projects: number;
  seconds: number;
  bytes: number;
  latest: Video | undefined;
}

export function summarize(videos: readonly Video[]): LibrarySummary {
  return {
    videos: videos.length,
    tours: new Set(videos.map(v => `${v.project}/${v.tour}`)).size,
    projects: new Set(videos.map(v => v.project)).size,
    seconds: videos.reduce((sum, v) => sum + v.duration, 0),
    bytes: videos.reduce((sum, v) => sum + v.bytes, 0),
    latest: [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  };
}

// Stable ids for gallery cards, so a link can land on one video: /#v-uws-tasks-tablero-…
export function shortenHome(dir: string): string {
  return dir.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~');
}

export function videoAnchor(relative: string): string {
  return `v-${relative.replace(/\.mp4$/, '').replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export function previewAnchor(key: string): string {
  return `p-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export const GALLERY_TITLE = 'Walkthrough · videos';

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// The 4XL mark shared with Reels Analytics: lime on ink reads on light and dark tabs alike.
const LOGO_PATHS = '<path d="M0 52 H104 V66 H0 Z"/><path d="M66 0 H80 V78 H104 V92 H66 V20 L26 60 H6 Z"/>';
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="27" fill="#0C100E"/><g fill="#D9F24A" transform="translate(8,14)">${LOGO_PATHS}</g></svg>`;

const ICON = {
  play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l12 7-12 7z"/></svg>',
  folder: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>',
  spark: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>',
  sun: '<svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  film: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>',
};

// Where a card's still is cut: a fifth of the way in clears the opening title card, which
// would give every video the same still.
export function stillAt(duration: number): string {
  return Math.min(20, Math.max(Math.min(2, duration / 2), duration * 0.2)).toFixed(1);
}

// `query` names the video for both /video and /poster; nothing loads until it is played.
function frame(query: string, entry: VideoEntry, isNew: boolean): string {
  return `<div class="frame">
          <video preload="none" playsinline poster="/poster?${query}&amp;t=${stillAt(entry.duration)}" src="/video?${query}"></video>
          <button type="button" class="play" aria-label="Reproducir ${escapeHtml(entry.title)}">${ICON.play}</button>
          <span class="badge mono">${formatDuration(entry.duration)}</span>
          ${isNew ? '<span class="new mono">NUEVO</span>' : ''}
        </div>`;
}

const format = (entry: VideoEntry) => (entry.device === 'mobile' ? '9:16' : '16:9');

function videoCard(video: Video, isNew: boolean, now: Date, fileManager: string): string {
  return `
      <article class="card ${video.device}" id="${videoAnchor(video.relative)}">
        ${frame(`file=${encodeURIComponent(video.relative)}`, video, isNew)}
        <div class="info">
          <h3>${escapeHtml(video.title)}</h3>
          <p class="mono muted">${escapeHtml(video.tour)} · ${formatWhen(video.createdAt, now)}</p>
        </div>
        <div class="foot">
          <div class="chips mono"><span>${format(video)}</span><span>${formatBytes(video.bytes)}</span></div>
          <div class="actions">
            <button type="button" class="pill" data-action="reveal" data-file="${escapeHtml(video.relative)}">${ICON.folder}${escapeHtml(fileManager)}</button>
            <button type="button" class="ghost" data-action="trash" data-file="${escapeHtml(video.relative)}" aria-label="Mandar ${escapeHtml(video.title)} a la Papelera">${ICON.trash}</button>
          </div>
        </div>
      </article>`;
}

function previewCard(preview: Preview, now: Date): string {
  return `
      <article class="card ${preview.device}" id="${previewAnchor(preview.key)}">
        ${frame(`preview=${encodeURIComponent(preview.key)}`, preview, false)}
        <div class="info">
          <h3>${escapeHtml(preview.title)}</h3>
          <p class="mono muted">${escapeHtml(preview.key)} · ${formatWhen(preview.createdAt, now)}</p>
        </div>
        <div class="foot">
          <div class="chips mono"><span>${format(preview)}</span><span>${formatBytes(preview.bytes)}</span></div>
        </div>
      </article>`;
}

function summaryCards(summary: LibrarySummary, now: Date): string {
  const { latest } = summary;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const latestCard = latest ? `
    <div class="tile lime wide">
      <span class="tag mono">ÚLTIMO RENDER</span>
      <span class="latest">${escapeHtml(latest.title)}</span>
      <div class="row">
        <button type="button" class="ink" data-play="${videoAnchor(latest.relative)}">${ICON.play}Reproducir</button>
        <span class="mono">${formatDuration(latest.duration)} · ${formatWhen(latest.createdAt, now)}</span>
      </div>
    </div>` : '';
  return `
  <section class="tiles" aria-label="Resumen">
    <div class="tile">
      <span class="muted">Videos</span>
      <span class="big">${summary.videos}</span>
      <span class="mono muted">${plural(summary.tours, 'tour', 'tours')} · ${plural(summary.projects, 'proyecto', 'proyectos')}</span>
    </div>${latestCard}
    <div class="tile">
      <span class="muted">Minutos generados</span>
      <span class="big">${formatDuration(summary.seconds)}</span>
      <span class="mono muted">${formatBytes(summary.bytes)} en disco</span>
    </div>
  </section>`;
}

function sectionHead(id: string, title: string, note: string): string {
  return `<div class="head"><h2 id="${id}">${escapeHtml(title)}</h2><span class="mono muted">${escapeHtml(note)}</span></div>`;
}

export function galleryPage({ videos, previews = [], cacheBytes, videosRoot, fileManager = 'Finder', now = new Date() }: GalleryData): string {
  const summary = summarize(videos);
  const projects = new Map<string, Video[]>();
  for (const video of videos) projects.set(video.project, [...(projects.get(video.project) ?? []), video]);
  const count = (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`;

  const sections = [...projects].map(([project, list], i) => `
  <section aria-labelledby="project-${i}">
    ${sectionHead(`project-${i}`, project, count(list.length))}
    <div class="grid">${list.map(video => videoCard(video, video === summary.latest, now, fileManager)).join('')}
    </div>
  </section>`).join('');

  const empty = (text: string) => `<div class="empty"><span class="well">${ICON.film}</span><p>${text}</p></div>`;
  const previewBody = previews.length
    ? `<div class="grid">${previews.map(preview => previewCard(preview, now)).join('')}</div>`
    : empty('<strong>No hay vistas previas.</strong> Aparecen aquí al correr <code>render --preview</code>, antes del video final.');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${GALLERY_TITLE}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON)}">
<script>
  // Before the first paint, so the page never flashes the other theme.
  try { document.documentElement.dataset.theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { document.documentElement.dataset.theme = 'dark'; }
</script>
<style>${STYLES}</style>
</head>
<body>
<div class="canvas">
<main>
  <header>
    <div class="brand">
      <span class="logo"><svg width="30" height="30" viewBox="0 0 120 120" aria-hidden="true"><g transform="translate(8,14)">${LOGO_PATHS}</g></svg></span>
      <span class="name">Walkthrough<code class="mono muted">${escapeHtml(shortenHome(videosRoot))}</code></span>
    </div>
    <nav aria-label="Secciones"><a href="#videos" class="on">Videos</a><a href="#previews">Vistas previas</a></nav>
    <div class="actions">
      <button type="button" class="pill" data-action="clean">${ICON.trash}Limpiar caché <span class="mono muted">${formatBytes(cacheBytes)}</span></button>
      <button type="button" class="pill round" data-theme-toggle aria-label="Cambiar de tema">${ICON.sun}${ICON.moon}</button>
    </div>
  </header>
  <h1><span>Tus tours,</span><span class="chip">${ICON.spark}en video</span></h1>
  ${videos.length ? summaryCards(summary, now) : ''}
  <div id="videos" class="stack">
  ${sections || `<section>${empty('Todavía no hay videos. Genera uno con <code>walkthrough render tours/&lt;proyecto&gt;/&lt;tour&gt;.yaml</code>.')}</section>`}
  </div>
  <section id="previews" aria-labelledby="previews-title">
    ${sectionHead('previews-title', 'Vistas previas', 'media resolución · se borran al limpiar la caché')}
    ${previewBody}
  </section>
  <footer class="mono muted"><span>localhost:4717</span><span>walkthrough · axl13.dev</span></footer>
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

// Acid Grid, as in Reels Analytics: ink and near-white, lime as the only color and always
// a surface under ink, never text on white. Cards float on shadow alone, 22px corners.
const STYLES = `
  :root { color-scheme: dark; --bg: #111211; --card: #1e1f1d; --sunk: #33342f; --line: #3a3b38; --ink: #f4f4f1; --muted: #a8a99f;
    --lime: #d9f24a; --on-lime: #111211; --solid: #f4f4f1; --on-solid: #111211; --wash: rgba(217,242,74,0.09);
    --shadow: 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.4), 0 18px 34px -22px rgba(0,0,0,0.7);
    --lift: 0 0 0 1px rgba(255,255,255,0.09), 0 28px 54px -24px rgba(0,0,0,0.75), 0 0 32px -12px rgba(217,242,74,0.22); }
  :root[data-theme="light"] { color-scheme: light; --bg: #f1f1ee; --card: #ffffff; --sunk: #edede9; --line: #dfe0d9; --ink: #111211; --muted: #54564f;
    --solid: #111211; --on-solid: #f4f4f1; --wash: rgba(217,242,74,0.16);
    --shadow: 0 1px 2px rgba(17,18,17,0.06), 0 18px 34px -22px rgba(17,18,17,0.4);
    --lift: 0 2px 6px rgba(17,18,17,0.08), 0 28px 54px -24px rgba(17,18,17,0.55); }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 "Space Grotesk", "SF Pro Display", -apple-system, system-ui, sans-serif; }
  .mono, code { font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace; font-size: 12px; }
  .muted { color: var(--muted); }
  .canvas { min-height: 100vh; background: radial-gradient(60rem 40rem at 88% -8%, var(--wash), transparent 60%), var(--bg); }
  main { max-width: 1280px; margin: 0 auto; padding: 32px 40px 56px; display: flex; flex-direction: column; gap: 40px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .logo { width: 48px; height: 48px; flex: none; border-radius: 14px; background: var(--lime); display: grid; place-items: center; }
  .logo svg { fill: var(--on-lime); }
  :root[data-theme="light"] .logo { background: #111211; }
  :root[data-theme="light"] .logo svg { fill: var(--lime); }
  .name { display: flex; flex-direction: column; gap: 2px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; min-width: 0; }
  .name code { font-weight: 400; overflow-wrap: anywhere; }
  nav { display: flex; gap: 6px; padding: 5px; border-radius: 999px; background: var(--card); box-shadow: var(--shadow); }
  nav a { padding: 10px 18px; border-radius: 999px; color: var(--muted); font-size: 14px; font-weight: 500; text-decoration: none; }
  nav a.on { background: var(--solid); color: var(--on-solid); font-weight: 600; }
  .actions { display: flex; align-items: center; gap: 8px; }
  button { font: inherit; cursor: pointer; border: 0; color: inherit; }
  button:disabled { opacity: 0.5; cursor: progress; }
  .pill { height: 44px; padding: 0 18px; border-radius: 999px; background: var(--sunk); font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; }
  .pill:hover { background: var(--line); }
  .round { width: 44px; padding: 0; justify-content: center; }
  :root[data-theme="light"] .pill { background: var(--card); box-shadow: var(--shadow); }
  :root[data-theme="light"] .foot .pill { background: var(--solid); color: var(--on-solid); box-shadow: none; }
  .moon { display: none; } :root[data-theme="light"] .moon { display: block; } :root[data-theme="light"] .sun { display: none; }
  .ghost { width: 44px; height: 44px; border-radius: 999px; background: transparent; color: var(--muted); display: grid; place-items: center; box-shadow: inset 0 0 0 1px var(--line); }
  .ghost:hover { color: #e0603f; box-shadow: inset 0 0 0 1px #e0603f; }
  :root[data-theme="light"] .ghost:hover { color: #c0442c; box-shadow: inset 0 0 0 1px #c0442c; }
  h1 { margin: 0; font-size: clamp(36px, 6vw, 56px); line-height: 1.08; font-weight: 600; letter-spacing: -0.03em; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 10px; padding: 4px 22px 8px; border-radius: 999px; background: var(--lime); color: var(--on-lime); }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
  .tile { padding: 24px; border-radius: 22px; background: var(--card); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 18px; font-size: 14px; }
  .tile.lime { background: var(--lime); color: var(--on-lime); box-shadow: var(--lift); gap: 14px; justify-content: space-between; }
  .tile.wide { grid-column: span 2; }
  @media (max-width: 1000px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tile.wide { order: 3; } }
  @media (max-width: 560px) { .tiles { grid-template-columns: minmax(0, 1fr); } .tile.wide { grid-column: auto; } }
  .big { font-size: 52px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
  .tag { align-self: flex-start; padding: 4px 10px; border-radius: 999px; background: #111211; color: var(--lime); font-size: 11px; letter-spacing: 0.08em; }
  .latest { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
  .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .row .mono { font-size: 13px; }
  .ink { display: inline-flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 999px; background: #111211; color: #f4f4f1; font-size: 14px; font-weight: 600; }
  .ink svg { width: 14px; height: 14px; }
  .stack { display: flex; flex-direction: column; gap: 40px; }
  section { display: flex; flex-direction: column; gap: 20px; }
  .head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 20px; }
  .card { border-radius: 22px; background: var(--card); box-shadow: var(--shadow); padding: 10px 10px 18px; display: flex; flex-direction: column; gap: 16px; scroll-margin: 24px; }
  .card.focus { box-shadow: 0 0 0 3px var(--lime), var(--shadow); }
  .frame { position: relative; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; background: #0c0d0c; }
  .card.mobile .frame { aspect-ratio: 9 / 16; max-height: 560px; margin: 0 auto; width: 100%; }
  .frame video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .frame.playing video { object-fit: contain; }
  .play { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 999px; background: var(--lime); color: var(--on-lime); display: grid; place-items: center; transition: transform 120ms; }
  .play:hover { transform: scale(1.06); }
  .badge { position: absolute; right: 12px; bottom: 12px; padding: 4px 8px; border-radius: 8px; background: rgba(17,18,17,0.82); color: #f4f4f1; }
  .new { position: absolute; left: 12px; top: 12px; padding: 4px 10px; border-radius: 999px; background: var(--lime); color: var(--on-lime); font-size: 11px; letter-spacing: 0.08em; }
  .frame.playing .play, .frame.playing .badge, .frame.playing .new { display: none; }
  .info { padding: 0 8px; display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  .info p { margin: 0; }
  .foot { padding: 0 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .chips { display: flex; gap: 6px; }
  .chips span { padding: 5px 10px; border-radius: 999px; background: var(--sunk); }
  .foot .pill { font-size: 13px; padding: 0 16px; }
  .empty { padding: 32px; border-radius: 22px; box-shadow: inset 0 0 0 1px var(--line); display: flex; align-items: center; gap: 20px; }
  .empty p { margin: 0; color: var(--muted); }
  .empty strong { display: block; color: var(--ink); font-size: 16px; }
  .empty code { color: var(--ink); font-size: 13px; overflow-wrap: anywhere; }
  .well { width: 48px; height: 48px; flex: none; border-radius: 14px; background: var(--sunk); color: var(--muted); display: grid; place-items: center; }
  footer { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  @media (max-width: 640px) { main { padding: 24px 16px 48px; } }
`;

const SCRIPT = `
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) {
    target.classList.add('focus');
    target.scrollIntoView({ block: 'center' });
  }
  function play(frame) {
    const video = frame.querySelector('video');
    frame.classList.add('playing');
    video.controls = true;
    video.play();
  }
  document.addEventListener('click', async event => {
    const toggle = event.target.closest('[data-theme-toggle]');
    if (toggle) {
      const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('theme', theme); } catch {}
      return;
    }
    const start = event.target.closest('.play');
    if (start) return play(start.closest('.frame'));
    const jump = event.target.closest('[data-play]');
    if (jump) {
      const card = document.getElementById(jump.dataset.play);
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return play(card.querySelector('.frame'));
    }
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
`;

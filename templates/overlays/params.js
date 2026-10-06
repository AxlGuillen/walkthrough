// Fills [data-param] elements from the query string and exposes asset(), which resolves a
// path against the tour's folder (passed as ?base=) instead of this template's folder.
const params = new URLSearchParams(location.search);
for (const el of document.querySelectorAll('[data-param]')) el.textContent = params.get(el.dataset.param) ?? '';
const accent = params.get('accent');
if (accent) {
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', onAccent(accent));
}
// The accent as TEXT: a light accent (lime) cannot be read on a light theme, so text falls
// back to ink there; as a fill it stays the accent.
const lightAccent = accent && onAccent(accent) !== '#ffffff';
if (lightAccent && params.get('theme') === 'light') document.documentElement.style.setProperty('--accent-ink', '#111211');
window.param = (name, fallback = '') => params.get(name) ?? fallback;
window.asset = name => new URL(name, params.get('base') ?? location.href).href;
document.documentElement.dataset.theme = params.get('theme') ?? 'dark';
document.documentElement.dataset.texture = params.get('texture') ?? 'plain';
document.documentElement.dataset.typeface = params.get('typeface') ?? 'system';
const [brand1, brand2] = (params.get('colors') ?? '').split(',');
if (brand1) {
  document.documentElement.style.setProperty('--brand-1', brand1);
  document.documentElement.style.setProperty('--stage-tint', `color-mix(in srgb, ${brand1} 34%, #0b0a10)`);
}
if (brand2) document.documentElement.style.setProperty('--brand-2', brand2);

// What a template animates with. beats are seconds on the overlay's own clock, each on a word
// of the narration; data is the overlay's structured input. An animation is registered paused
// and the render places it at the exact second of every frame (__walkthroughSeek), so it
// never runs on wall time and two renders give the same frames.
const json = name => {
  try { return JSON.parse(params.get(name) ?? 'null'); } catch { return null; }
};
const seekers = [];
window.walkthrough = {
  beats: json('beats') ?? {},
  data: json('data'),
  theme: document.documentElement.dataset.theme,
  // Seconds the overlay stays on screen, so an exit can be timed from the end.
  duration: Number(params.get('duration') ?? 0),
  beat(name, fallback = 0) { return this.beats[name] ?? fallback; },
  // An emoji of the vendored Fluent set by name, in the tour's style (color or 3d).
  emoji(name) { return new URL(`vendor/fluent-emoji/${name}${params.get('emojiStyle') === '3d' ? '.3d.png' : '.svg'}`, location.href).href; },
  timeline(seek) { seekers.push(seek); },
  gsap(timeline) {
    timeline.pause(0);
    seekers.push(t => timeline.seek(t, false));
    return timeline;
  },
};
window.__walkthroughSeek = t => { for (const seek of seekers) seek(t); };

// Same rule as src/effects/color.ts: dark text only on a light accent.
function onAccent(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}

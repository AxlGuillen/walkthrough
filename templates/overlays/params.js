// Fills [data-param] elements from the query string and exposes asset(), which resolves a
// path against the tour's folder (passed as ?base=) instead of this template's folder.
const params = new URLSearchParams(location.search);
for (const el of document.querySelectorAll('[data-param]')) el.textContent = params.get(el.dataset.param) ?? '';
const accent = params.get('accent');
if (accent) {
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', onAccent(accent));
}
window.param = (name, fallback = '') => params.get(name) ?? fallback;
window.asset = name => new URL(name, params.get('base') ?? location.href).href;

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

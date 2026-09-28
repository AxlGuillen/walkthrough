// Fills [data-param] elements from the query string and exposes asset(), which resolves a
// path against the tour's folder (passed as ?base=) instead of this template's folder.
const params = new URLSearchParams(location.search);
for (const el of document.querySelectorAll('[data-param]')) el.textContent = params.get(el.dataset.param) ?? '';
if (params.get('accent')) document.documentElement.style.setProperty('--accent', params.get('accent'));
window.param = (name, fallback = '') => params.get(name) ?? fallback;
window.asset = name => new URL(name, params.get('base') ?? location.href).href;

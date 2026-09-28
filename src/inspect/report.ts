import { selectorFor } from './selectors.ts';
import type { ElementInfo, PageSnapshot } from './snapshot.ts';

export interface InspectedPage {
  route: string;
  snapshot: PageSnapshot;
  screenshot: string;
}

const MAX_ANCHORS = 40;

// Only navigation links are followed, one per path: content links (every ticket, every
// row) would turn a look around into a crawl, and ?range=… variants are the same screen.
export function routesToVisit(start: string, snapshot: PageSnapshot, limit: number): string[] {
  const byPath = new Map<string, string>();
  for (const route of [start, ...snapshot.links.filter(link => link.inNav).map(link => link.href)]) {
    const pathname = route.split('?')[0]!;
    if (!byPath.has(pathname)) byPath.set(pathname, route);
  }
  return [...byPath.values()].slice(0, limit);
}

const FAMILY_SIZE = 3;

// Per-row controls ("Edit <title>", "Delete <title>") carry data in their label. Listing
// each would bury the page's real anchors, so a family collapses to one prefix selector.
function familyOf(element: ElementInfo): string | null {
  const first = element.ariaLabel?.split(' ')[0];
  return first && element.ariaLabel!.length > first.length ? `${element.tag}[aria-label^="${first} "]` : null;
}

export function anchorsOf(elements: readonly ElementInfo[]): { selector: string; element: ElementInfo; count: number }[] {
  const families = new Map<string, number>();
  for (const element of elements) {
    const family = element.visible ? familyOf(element) : null;
    if (family) families.set(family, (families.get(family) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  const found: { selector: string; element: ElementInfo }[] = [];
  for (const element of elements) {
    if (!element.visible) continue;
    const family = familyOf(element);
    const selector = family && families.get(family)! >= FAMILY_SIZE ? family : selectorFor(element);
    if (!selector) continue;
    if (!counts.has(selector)) found.push({ selector, element });
    counts.set(selector, (counts.get(selector) ?? 0) + 1);
  }
  const rank = ({ element }: { element: ElementInfo }) => (element.dataTour ? 0 : element.testId ? 1 : element.ariaLabel ? 2 : 3);
  return found
    .map(entry => ({ ...entry, count: counts.get(entry.selector)! }))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_ANCHORS);
}

export function inspectReport(url: string, pages: readonly InspectedPage[], now = new Date()): string {
  const lines = [`# Inspección de ${url}`, '', `Generado el ${now.toISOString().slice(0, 10)}. Solo lectura: se navegó sin hacer clics.`, ''];
  const nav = pages[0]?.snapshot.links.filter(link => link.inNav) ?? [];
  if (nav.length) {
    lines.push('## Navegación', '', ...[...new Map(nav.map(l => [l.href, l])).values()].map(l => `- \`a[href="${l.href}"]\` — ${l.text || '(sin texto)'}`), '');
  }

  for (const { route, snapshot, screenshot } of pages) {
    lines.push(`## ${route} — ${snapshot.title || 'sin título'}`, '', `![${route}](${screenshot})`, '');
    if (snapshot.url !== new URL(route, snapshot.url).href) lines.push(`⚠ Terminó en \`${new URL(snapshot.url).pathname}\`.`, '');
    if (snapshot.headings.length) lines.push(`**Encabezados:** ${snapshot.headings.map(h => h.text).join(' · ')}`, '');
    for (const dialog of snapshot.dialogs) lines.push(`⚠ **Diálogo abierto** (¿onboarding?): «${dialog}»`, '');

    const anchors = anchorsOf(snapshot.elements);
    if (anchors.length) {
      lines.push('| Selector | Elemento | Texto |', '|---|---|---|');
      for (const { selector, element, count } of anchors) {
        lines.push(`| \`${selector.replace(/\|/g, '\\|')}\`${count > 1 ? ` ×${count}` : ''} | ${element.tag} | ${cell(element.text)} |`);
      }
      lines.push('');
    }

    const scrollers = snapshot.scrollers.filter(s => s.element.visible);
    if (scrollers.length) {
      lines.push('**Zonas con scroll:**', ...scrollers.map(s => `- ${s.axis === 'x' ? 'horizontal' : s.axis === 'y' ? 'vertical' : 'ambos ejes'}: \`${selectorFor(s.element) ?? `${s.element.tag}.${s.element.classes.join('.')}`}\``), '');
    }

    const hints = snapshot.storageKeys.filter(key => /tour|onboard|seen|dismiss|welcome|intro/i.test(key));
    if (hints.length) lines.push(`**localStorage que parece de onboarding:** ${hints.map(k => `\`${k}\``).join(', ')}`, '');
  }
  return lines.join('\n');
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').slice(0, 60) || '—';
}

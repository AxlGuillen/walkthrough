import type { Page } from 'playwright-core';

export interface ElementInfo {
  tag: string;
  role: string | null;
  text: string;
  dataTour: string | null;
  testId: string | null;
  ariaLabel: string | null;
  id: string | null;
  href: string | null;
  name: string | null;
  placeholder: string | null;
  classes: string[];
  visible: boolean;
}

export interface Scroller {
  element: ElementInfo;
  axis: 'x' | 'y' | 'both';
}

export interface PageSnapshot {
  url: string;
  title: string;
  headings: { level: number; text: string }[];
  elements: ElementInfo[];
  links: { href: string; text: string }[];
  dialogs: string[];
  scrollers: Scroller[];
  storageKeys: string[];
}

const MAX_ELEMENTS = 400;

// Read-only: looks at the page, never clicks or types.
export function snapshotPage(page: Page): Promise<PageSnapshot> {
  return page.evaluate(max => {
    const clean = (text: string | null | undefined, limit = 80) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const describe = (el: Element) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      text: clean((el as HTMLElement).innerText ?? el.textContent),
      dataTour: el.getAttribute('data-tour'),
      testId: el.getAttribute('data-testid'),
      ariaLabel: el.getAttribute('aria-label'),
      id: el.id || null,
      href: el.getAttribute('href'),
      name: el.getAttribute('name'),
      placeholder: el.getAttribute('placeholder'),
      classes: [...el.classList].slice(0, 3),
      visible: visible(el),
    });

    const interesting = '[data-tour],[data-testid],[aria-label],button,a[href],input,select,textarea,'
      + '[role=button],[role=tab],[role=link],[role=menuitem],[role=checkbox],[role=switch]';
    const elements = [...document.querySelectorAll(interesting)].slice(0, max).map(describe);

    const links = [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: new URL(a.getAttribute('href')!, location.href), text: clean(a.textContent) }))
      .filter(({ href }) => href.origin === location.origin)
      .map(({ href, text }) => ({ href: href.pathname + href.search, text }));

    const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open],:popover-open')]
      .filter(el => visible(el) && el.id !== '__walkthrough-effects')
      .map(el => clean(el.textContent, 120));

    const scrollers = [...document.querySelectorAll('body *')].slice(0, 3000).flatMap(el => {
      const style = getComputedStyle(el);
      const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';
      const x = scrolls(style.overflowX) && el.scrollWidth > el.clientWidth + 8;
      const y = scrolls(style.overflowY) && el.scrollHeight > el.clientHeight + 8;
      if (!x && !y) return [];
      return [{ element: describe(el), axis: (x && y ? 'both' : x ? 'x' : 'y') as 'x' | 'y' | 'both' }];
    });

    let storageKeys: string[] = [];
    try { storageKeys = Object.keys(localStorage); } catch { /* storage can be blocked */ }

    return {
      url: location.href,
      title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].map(h => ({ level: Number(h.tagName[1]), text: clean(h.textContent) })).filter(h => h.text),
      elements,
      links,
      dialogs,
      scrollers,
      storageKeys,
    };
  }, MAX_ELEMENTS);
}

// Choreography of openings, closings and chapter cards, one set per style, so the three
// pieces of a style move alike. Load after kit.js, then call titles.play(role).
//
// Beats (all optional): title, subtitle, url (closing), mark (brand), reveal (over-app
// opening) and out (the exit of an opening or a chapter card). Without them each piece
// falls back to a pace that reads well.
(() => {
  const { gsap, ease, time } = kit;
  const $ = selector => document.querySelector(selector);
  const has = el => el && el.textContent.trim() !== '';
  const params = new URLSearchParams(location.search);

  function stage(role) {
    const style = ['kinetic', 'over-app', 'brand'].includes(params.get('style')) ? params.get('style') : 'kinetic';
    document.body.classList.add(`role-${role}`, `style-${style}`);
    const index = $('.index');
    if (index && params.get('index')) {
      index.textContent = params.get('index').padStart(2, '0');
      if (params.get('total')) index.insertAdjacentHTML('beforeend', `<span class="of">/ ${params.get('total').padStart(2, '0')}</span>`);
    }
    // The brand style's centerpiece: the tour's own logo, else its brand's squarest image
    // (ringed when square, on a line of its own when wide), else a monogram.
    const mark = $('.mark');
    const ownLogo = params.get('logo');
    const brandMark = params.get('brandMark');
    if (mark) {
      const image = ownLogo ? asset(ownLogo) : brandMark;
      if (!ownLogo && brandMark && params.get('markShape') === 'wide') mark.classList.add('wide');
      mark.insertAdjacentHTML('afterbegin', image ? `<img alt="" src="${image}">` : `<span class="monogram">${($('.title')?.textContent.trim()[0] ?? '·').toUpperCase()}</span>`);
    }
    // In the other styles the brand's widest logo sits above the eyebrow.
    const brandLogo = params.get('brandLogo');
    if (brandLogo && style !== 'brand') $('.block')?.insertAdjacentHTML('afterbegin', `<img class="brandline" alt="${params.get('brand') ?? ''}" src="${brandLogo}">`);
    const title = $('.title');
    return {
      style, title,
      chars: has(title) ? kit.split(title, 'chars', { mask: true }) : [],
      eyebrow: has($('.eyebrow')) ? $('.eyebrow') : null,
      rule: $('.rule'),
      words: has($('.subtitle')) ? kit.split($('.subtitle'), 'words') : [],
      url: has($('.url')) ? $('.url') : null,
      indexChars: has(index) ? kit.split(index, 'chars', { mask: true }) : [],
      mark: $('.mark'), ring: $('.mark:not(.wide) circle'), brandline: $('.brandline'), veil: $('.veil'), scrim: $('.scrim'),
      block: [...document.querySelectorAll('.block > *')].filter(el => getComputedStyle(el).display !== 'none'),
    };
  }

  const beats = (role) => {
    const brand = document.body.classList.contains('style-brand');
    const mark = walkthrough.beat('mark', 0.3);
    const title = walkthrough.beat('title', brand && role !== 'chapter' ? mark + 0.7 : 0.35);
    return {
      mark, title,
      subtitle: walkthrough.beat('subtitle', title + 0.55),
      url: walkthrough.beat('url', title + 0.9),
      reveal: walkthrough.beat('reveal', title + 1.1),
      out: walkthrough.beat('out', Math.max(title + 1.5, walkthrough.duration - 0.8)),
    };
  };

  // The shared entrance: eyebrow, the title rising letter by letter out of its mask, the
  // accent rule, the subtitle word by word and a closing's url.
  function enter(tl, el, at) {
    if (el.brandline) tl.fromTo(el.brandline, { opacity: 0, y: '0.6vmin' }, { opacity: 1, y: 0, duration: 0.6 }, Math.max(0, at.title - 0.35));
    if (el.eyebrow) tl.fromTo(el.eyebrow, { opacity: 0, letterSpacing: '0.9em' }, { opacity: 1, letterSpacing: '0.35em', duration: 0.9 }, Math.max(0, at.title - 0.15));
    if (el.indexChars.length) tl.fromTo(el.indexChars, { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'power4.out', stagger: 0.06 }, at.title - 0.1);
    if (el.chars.length) tl.fromTo(el.chars, { yPercent: 115, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power4.out', stagger: time.stagger }, at.title);
    if (el.rule) tl.fromTo(el.rule, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: ease.inOut }, at.title + 0.35);
    if (el.words.length) tl.fromTo(el.words, { y: '0.6em', opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.05 }, at.subtitle);
    if (el.url) tl.fromTo(el.url, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: ease.pop }, at.url);
  }

  function leave(tl, el, at) {
    tl.to(el.block, { y: '-0.4em', opacity: 0, duration: time.exit, ease: ease.exit, stagger: 0.04 }, at.out);
  }

  function brandMark(tl, el, at) {
    tl.fromTo(el.mark, { scale: 0.5, rotation: -10, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.8, ease: ease.pop }, at.mark);
    if (el.ring) tl.add(kit.draw(el.ring, { duration: 1.1 }), at.mark + 0.1);
  }

  const styles = {
    kinetic: {
      opening(tl, el, at) {
        // A slow push on the ground, so the card never sits dead still.
        tl.fromTo(el.veil, { scale: 1.12 }, { scale: 1, duration: at.out + 0.25, ease: 'none' }, 0);
        enter(tl, el, at);
        leave(tl, el, at);
        tl.to(el.veil, { yPercent: -100, duration: 0.7, ease: 'power3.inOut' }, at.out + 0.25);
      },
      closing(tl, el, at) {
        tl.fromTo(el.veil, { yPercent: 100 }, { yPercent: 0, duration: 0.6, ease: 'power3.inOut' }, 0);
        enter(tl, el, at);
      },
      chapter(tl, el, at) {
        tl.fromTo(el.veil, { xPercent: -100 }, { xPercent: 0, duration: 0.5, ease: 'power3.inOut' }, 0);
        enter(tl, el, at);
        leave(tl, el, at);
        tl.to(el.veil, { xPercent: 100, duration: 0.5, ease: 'power3.inOut' }, at.out + 0.2);
      },
    },
    'over-app': {
      opening(tl, el, at) {
        enter(tl, el, at);
        tl.fromTo(el.veil, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 100% 0% 0%)', duration: 0.9, ease: 'power3.inOut' }, at.reveal);
        tl.fromTo(el.scrim, { opacity: 0 }, { opacity: 1, duration: 0.6 }, at.reveal);
        leave(tl, el, at);
        tl.to(el.scrim, { opacity: 0, duration: 0.6 }, at.out + 0.2);
      },
      closing(tl, el, at) {
        tl.fromTo(el.scrim, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0);
        enter(tl, el, at);
      },
      chapter(tl, el, at) {
        tl.fromTo(el.scrim, { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
        enter(tl, el, at);
        leave(tl, el, at);
        tl.to(el.scrim, { opacity: 0, duration: 0.5 }, at.out + 0.2);
      },
    },
    brand: {
      opening(tl, el, at) {
        brandMark(tl, el, at);
        enter(tl, el, at);
        tl.to([el.mark, ...el.block], { scale: 0.94, opacity: 0, duration: time.exit, ease: ease.exit }, at.out);
        tl.to(el.veil, { opacity: 0, duration: 0.6 }, at.out + 0.2);
      },
      closing(tl, el, at) {
        tl.fromTo(el.veil, { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
        brandMark(tl, el, at);
        enter(tl, el, at);
      },
      chapter(tl, el, at) {
        tl.fromTo(el.veil, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);
        brandMark(tl, el, { ...at, mark: Math.max(0, at.title - 0.3) });
        enter(tl, el, at);
        tl.to([el.mark, ...el.block], { opacity: 0, duration: time.exit, ease: ease.exit }, at.out);
        tl.to(el.veil, { opacity: 0, duration: 0.5 }, at.out + 0.2);
      },
    },
  };

  window.titles = {
    play(role) {
      const el = stage(role);
      const tl = kit.timeline();
      styles[el.style][role](tl, el, beats(role));
      return tl;
    },
  };
})();

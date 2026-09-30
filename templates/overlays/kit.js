// Shared motion for overlay templates, so every resource moves like the same family. Load it
// after params.js and vendor/gsap/*. Everything builds on walkthrough.gsap(): a paused
// timeline the render places at the exact second of each frame.
(() => {
  const { gsap } = window;
  gsap.registerPlugin(...[window.SplitText, window.DrawSVGPlugin, window.MorphSVGPlugin, window.CustomEase].filter(Boolean));

  const ease = { out: 'power3.out', inOut: 'power2.inOut', pop: 'back.out(1.6)', exit: 'power2.in' };
  const time = { enter: 0.6, exit: 0.4, stagger: 0.035, draw: 0.8, count: 1.2 };
  // `||`, not `??`: a page without lang= reports an empty string, which Intl rejects.
  const lang = new URLSearchParams(location.search).get('lang') || document.documentElement.lang || 'es';
  // Plain es writes 1500 without a separator; the Spanish narration is Mexican.
  const locale = { es: 'es-MX', en: 'en-US' }[lang] ?? lang;

  // The one timeline a template builds; tweens default to the family's entrance.
  const timeline = () => walkthrough.gsap(gsap.timeline({ defaults: { ease: ease.out, duration: time.enter } }));

  // Letters or words as elements to stagger. Splits by characters or words only, never by
  // lines, so it does not depend on fonts having loaded. `mask` clips each word, so letters
  // can rise into view from below their baseline.
  const split = (el, by = 'chars', { mask = false } = {}) => {
    const parts = new window.SplitText(el, { type: by === 'words' ? 'words' : 'words,chars', aria: 'auto', charsClass: 'char', wordsClass: 'word', ...(mask ? { mask: 'words' } : {}) });
    return by === 'words' ? parts.words : parts.chars;
  };

  // A number that counts up to `to`, formatted for the tour's language.
  const count = (el, { from = 0, to, decimals = 0, prefix = '', suffix = '', duration = time.count } = {}) => {
    const state = { value: from };
    const format = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const paint = () => { el.textContent = `${prefix}${format.format(state.value)}${suffix}`; };
    paint();
    return gsap.to(state, { value: to, duration, ease: 'power2.out', onUpdate: paint });
  };

  // An SVG stroke that draws itself.
  const draw = (target, vars = {}) => gsap.fromTo(target, { drawSVG: '0%' }, { drawSVG: '100%', duration: time.draw, ease: ease.inOut, ...vars });

  window.kit = { gsap, ease, time, lang, locale, timeline, split, count, draw, beat: (name, fallback) => walkthrough.beat(name, fallback) };
})();

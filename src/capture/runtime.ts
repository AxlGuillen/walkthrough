declare global {
  interface Window {
    __walkthrough?: { syncAnimations(): void };
  }
}

// Runs inside the page, so it must stay self-contained: Playwright serializes it as source.
// page.clock does not drive CSS animations or transitions; this pins each one to the fake
// performance.now() before a frame is taken.
export function animationSync(): void {
  const origins = new WeakMap<Animation, number>();
  window.__walkthrough = {
    syncAnimations() {
      const now = performance.now();
      for (const animation of document.getAnimations()) {
        if (!origins.has(animation)) {
          origins.set(animation, now - Number(animation.currentTime ?? 0));
          animation.pause();
        }
        const time = now - origins.get(animation)!;
        const end = animation.effect?.getComputedTiming().endTime;
        // finish() instead of seeking past the end, so transitionend and finish events fire.
        if (typeof end === 'number' && Number.isFinite(end) && time >= end) animation.finish();
        else animation.currentTime = time;
      }
    },
  };
}

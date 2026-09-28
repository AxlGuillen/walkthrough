declare global {
  interface Window {
    __walkthrough?: { syncAnimations?(): Promise<void>; draw?(markup: string): void };
  }
}

// Both functions run inside the page, so they must stay self-contained: Playwright
// serializes them as source.

// page.clock drives neither CSS animations nor <video>; this pins both to the fake
// performance.now() before a frame is taken.
export function animationSync(): void {
  const origins = new WeakMap<Animation, number>();
  const videoOrigins = new WeakMap<HTMLVideoElement, number>();
  let lastSync = performance.now();
  window.__walkthrough = {
    ...window.__walkthrough,
    async syncAnimations() {
      const now = performance.now();
      for (const animation of document.getAnimations()) {
        if (!origins.has(animation)) {
          // Until first seen, an animation runs on wall time. Credit it no more than the
          // video time since the last sync, so capture speed never leaks into the frame.
          const elapsed = Math.min(Number(animation.currentTime ?? 0), now - lastSync);
          origins.set(animation, now - elapsed);
          animation.pause();
        }
        const time = now - origins.get(animation)!;
        const end = animation.effect?.getComputedTiming().endTime;
        // finish() instead of seeking past the end, so transitionend and finish events fire.
        if (typeof end === 'number' && Number.isFinite(end) && time >= end) animation.finish();
        else animation.currentTime = time;
      }

      // Same idea for video: pause it and seek to the frame for this instant. Seeking is
      // async, so wait for every frame to decode before the screenshot.
      const seeks: Promise<unknown>[] = [];
      for (const video of document.querySelectorAll('video')) {
        if (video.readyState < 1) continue;
        if (!videoOrigins.has(video)) {
          videoOrigins.set(video, now - Math.min(video.currentTime * 1000, now - lastSync));
          video.pause();
        }
        let target = (now - videoOrigins.get(video)!) / 1000;
        if (Number.isFinite(video.duration)) {
          target = video.loop ? target % video.duration : Math.min(target, video.duration);
        }
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - target) > 0.001) {
          seeks.push(new Promise(resolve => video.addEventListener('seeked', resolve, { once: true })));
          video.currentTime = target;
        }
      }
      await Promise.all(seeks);
      lastSync = now;
    },
  };
}

// A stateless layer: Node computes each frame's SVG, so effects survive navigations.
// It lives in the top layer, above the app's own dialogs, and never takes pointer events.
export function effectsLayer(): void {
  const ID = '__walkthrough-effects';
  window.__walkthrough = {
    ...window.__walkthrough,
    draw(markup) {
      let host = document.getElementById(ID);
      if (!host) {
        host = document.createElement('div');
        host.id = ID;
        host.setAttribute('popover', 'manual');
        host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;'
          + 'background:transparent;overflow:visible;pointer-events:none;';
        host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" '
          + 'style="overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"></svg>';
        document.documentElement.append(host);
      }
      host.firstElementChild!.innerHTML = markup;
      // Re-showing moves the layer to the top of the top layer, above dialogs opened since.
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover();
    },
  };
}

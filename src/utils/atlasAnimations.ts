import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

export function ensureGsapRegistered(): void {
  if (!registered && typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function prepareSvgPathDraw(pathEl: SVGGeometryElement): number {
  const length = pathEl.getTotalLength();
  pathEl.style.strokeDasharray = `${length}`;
  pathEl.style.strokeDashoffset = `${length}`;
  return length;
}

export function createAtlasScrollContext(
  scope: HTMLElement | null,
  setup: () => void
): () => void {
  ensureGsapRegistered();
  if (!scope || prefersReducedMotion()) {
    return () => {};
  }
  const ctx = gsap.context(() => {
    setup();
  }, scope);

  return () => {
    ctx.revert();
  };
}

export function observeAmbientVisibility(el: HTMLElement | null): () => void {
  if (!el || typeof window === 'undefined') {
    return () => {};
  }
  if (prefersReducedMotion()) {
    el.dataset.ambientActive = 'false';
    return () => {};
  }

  el.dataset.ambientActive = 'true';

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries[0]?.isIntersecting ?? false;
      el.dataset.ambientActive = visible && !document.hidden ? 'true' : 'false';
    },
    { rootMargin: '120px 0px', threshold: 0.01 }
  );
  observer.observe(el);

  const onVis = () => {
    if (document.hidden) {
      el.dataset.ambientActive = 'false';
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVis);
  };
}

export { gsap, ScrollTrigger };

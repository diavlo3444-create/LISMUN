import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../utils/atlasAnimations';

export const CartographicCursor: React.FC = () => {
  const reticleRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (!isFinePointer || prefersReducedMotion()) return;

    setEnabled(true);

    let rafId = 0;
    let running = false;
    let targetX = -100;
    let targetY = -100;
    let currX = -100;
    let currY = -100;

    const tick = () => {
      const dx = targetX - currX;
      const dy = targetY - currY;
      currX += dx * 0.32;
      currY += dy * 0.32;
      if (reticleRef.current) {
        reticleRef.current.style.transform = `translate3d(${currX}px, ${currY}px, 0)`;
      }
      if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
        running = false;
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const onMove = (e: MouseEvent) => {
      if (document.hidden) return;
      targetX = e.clientX;
      targetY = e.clientY;
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    const onLeave = () => {
      stopLoop();
      if (reticleRef.current) {
        reticleRef.current.style.transform = 'translate3d(-100px, -100px, 0)';
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopLoop();
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      ref={reticleRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-50 hidden -translate-x-1/2 -translate-y-1/2 md:block"
      style={{ transform: 'translate3d(-100px, -100px, 0)' }}
    >
      <div className="relative h-7 w-7 rounded-full border border-[#B89A62]/45">
        <span className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D5BD8B]/80" />
      </div>
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import type { AtlasSectionId } from '../types/atlas';
import { prefersReducedMotion } from '../utils/atlasAnimations';
import { GoldParticlesCanvas, GoldenWorldMapBackdrop } from './LuxuryOrnaments';

interface ScrollAtlasBackdropProps {
  activeSection: AtlasSectionId;
  dimmed?: boolean;
}

interface SectionMoodProfile {
  brassX: number;
  brassY: number;
  brassOpacity: number;
  brassScale: number;
  lapisX: number;
  lapisY: number;
  lapisOpacity: number;
  lapisScale: number;
  ringOpacity: number;
  gridOpacity: number;
  tintColor: string;
}

const MOOD_PROFILES: Record<AtlasSectionId, SectionMoodProfile> = {
  hero: {
    brassX: 74,
    brassY: 46,
    brassOpacity: 0.2,
    brassScale: 1.05,
    lapisX: 22,
    lapisY: 30,
    lapisOpacity: 0.24,
    lapisScale: 1,
    ringOpacity: 0.19,
    gridOpacity: 0.34,
    tintColor: 'rgba(7, 20, 38, 0.14)',
  },
  about: {
    brassX: 78,
    brassY: 72,
    brassOpacity: 0.13,
    brassScale: 0.96,
    lapisX: 28,
    lapisY: 44,
    lapisOpacity: 0.3,
    lapisScale: 1.12,
    ringOpacity: 0.15,
    gridOpacity: 0.28,
    tintColor: 'rgba(10, 29, 54, 0.22)',
  },
  experience: {
    brassX: 50,
    brassY: 48,
    brassOpacity: 0.22,
    brassScale: 1.08,
    lapisX: 20,
    lapisY: 76,
    lapisOpacity: 0.18,
    lapisScale: 0.94,
    ringOpacity: 0.18,
    gridOpacity: 0.32,
    tintColor: 'rgba(22, 24, 34, 0.18)',
  },
  committees: {
    brassX: 26,
    brassY: 64,
    brassOpacity: 0.14,
    brassScale: 0.95,
    lapisX: 72,
    lapisY: 34,
    lapisOpacity: 0.28,
    lapisScale: 1.1,
    ringOpacity: 0.16,
    gridOpacity: 0.3,
    tintColor: 'rgba(12, 34, 62, 0.22)',
  },
  secretariat: {
    brassX: 34,
    brassY: 28,
    brassOpacity: 0.19,
    brassScale: 1.02,
    lapisX: 74,
    lapisY: 68,
    lapisOpacity: 0.2,
    lapisScale: 1,
    ringOpacity: 0.15,
    gridOpacity: 0.26,
    tintColor: 'rgba(16, 28, 46, 0.18)',
  },
  numbers: {
    brassX: 68,
    brassY: 54,
    brassOpacity: 0.12,
    brassScale: 0.92,
    lapisX: 28,
    lapisY: 56,
    lapisOpacity: 0.2,
    lapisScale: 0.98,
    ringOpacity: 0.12,
    gridOpacity: 0.22,
    tintColor: 'rgba(6, 17, 34, 0.2)',
  },
  registration: {
    brassX: 50,
    brassY: 40,
    brassOpacity: 0.24,
    brassScale: 1.14,
    lapisX: 50,
    lapisY: 78,
    lapisOpacity: 0.18,
    lapisScale: 1.02,
    ringOpacity: 0.21,
    gridOpacity: 0.35,
    tintColor: 'rgba(20, 26, 38, 0.16)',
  },
  apply: {
    brassX: 32,
    brassY: 46,
    brassOpacity: 0.18,
    brassScale: 1.04,
    lapisX: 74,
    lapisY: 32,
    lapisOpacity: 0.24,
    lapisScale: 1.08,
    ringOpacity: 0.16,
    gridOpacity: 0.28,
    tintColor: 'rgba(7, 18, 34, 0.22)',
  },
};

const OUTER_TICKS = Array.from({ length: 72 }, (_, idx) => {
  const deg = idx * 5;
  const rad = (deg * Math.PI) / 180;
  const isCardinal = idx % 18 === 0;
  const isMajor = idx % 6 === 0;
  const rOuter = 458;
  const rInner = isCardinal ? 434 : isMajor ? 444 : 451;
  return {
    key: deg,
    x1: 500 + rInner * Math.cos(rad),
    y1: 500 + rInner * Math.sin(rad),
    x2: 500 + rOuter * Math.cos(rad),
    y2: 500 + rOuter * Math.sin(rad),
    isCardinal,
    isMajor,
  };
});

const INNER_TICKS = Array.from({ length: 36 }, (_, idx) => {
  const deg = idx * 10;
  const rad = (deg * Math.PI) / 180;
  const isMajor = idx % 3 === 0;
  const rOuter = 248;
  const rInner = isMajor ? 234 : 241;
  return {
    key: deg,
    x1: 500 + rInner * Math.cos(rad),
    y1: 500 + rInner * Math.sin(rad),
    x2: 500 + rOuter * Math.cos(rad),
    y2: 500 + rOuter * Math.sin(rad),
    isMajor,
  };
});

const EDGE_TICKS = Array.from({ length: 18 }, (_, idx) => idx);

export const ScrollAtlasBackdrop: React.FC<ScrollAtlasBackdropProps> = ({
  activeSection,
  dimmed = false,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const gridFarRef = useRef<HTMLDivElement>(null);
  const gridNearRef = useRef<HTMLDivElement>(null);
  const compassStageRef = useRef<HTMLDivElement>(null);
  const compassOuterRef = useRef<SVGGElement>(null);
  const compassMidRef = useRef<SVGGElement>(null);
  const compassInnerRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();

    const readScrollTarget = () => {
      const y = window.scrollY || 0;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, y / maxScroll));
      return { y, progress };
    };

    const applyTransforms = (scrollPx: number, progress: number) => {
      const farOffset = -(scrollPx * 0.08) % 160;
      const nearOffset = -(scrollPx * 0.17) % 160;
      const compassShiftY = (0.5 - progress) * 34;

      if (gridFarRef.current) {
        gridFarRef.current.style.transform = `translate3d(0, ${farOffset.toFixed(2)}px, 0)`;
      }
      if (gridNearRef.current) {
        gridNearRef.current.style.transform = `translate3d(0, ${nearOffset.toFixed(2)}px, 0)`;
      }
      if (compassStageRef.current) {
        compassStageRef.current.style.transform = `translate3d(0, ${compassShiftY.toFixed(2)}px, 0)`;
      }

      const outerDeg = progress * 64;
      const midDeg = -progress * 92;
      const innerDeg = progress * 128;

      if (compassOuterRef.current) {
        compassOuterRef.current.style.transform = `rotate(${outerDeg.toFixed(2)}deg)`;
      }
      if (compassMidRef.current) {
        compassMidRef.current.style.transform = `rotate(${midDeg.toFixed(2)}deg)`;
      }
      if (compassInnerRef.current) {
        compassInnerRef.current.style.transform = `rotate(${innerDeg.toFixed(2)}deg)`;
      }

      if (rootRef.current) {
        rootRef.current.dataset.scrollProgress = progress.toFixed(4);
        rootRef.current.dataset.compassDeg = outerDeg.toFixed(2);
      }
    };

    const initial = readScrollTarget();
    if (reduceMotion) {
      applyTransforms(0, 0);
      return;
    }

    let currentY = initial.y;
    let targetY = initial.y;
    let currentProgress = initial.progress;
    let targetProgress = initial.progress;
    let rafId = 0;

    applyTransforms(currentY, currentProgress);

    const step = () => {
      rafId = 0;
      if (document.hidden) return;

      currentY += (targetY - currentY) * 0.12;
      currentProgress += (targetProgress - currentProgress) * 0.12;

      const settledY = Math.abs(targetY - currentY) < 0.15;
      const settledProgress = Math.abs(targetProgress - currentProgress) < 0.0002;

      if (settledY && settledProgress) {
        currentY = targetY;
        currentProgress = targetProgress;
        applyTransforms(currentY, currentProgress);
        return;
      }

      applyTransforms(currentY, currentProgress);
      rafId = window.requestAnimationFrame(step);
    };

    const scheduleFrame = () => {
      if (!rafId && !document.hidden) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    const handleScrollOrResize = () => {
      const next = readScrollTarget();
      targetY = next.y;
      targetProgress = next.progress;
      scheduleFrame();
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        handleScrollOrResize();
      } else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const mood = MOOD_PROFILES[activeSection] ?? MOOD_PROFILES.hero;

  return (
    <div
      ref={rootRef}
      data-testid="scroll-atlas-backdrop"
      data-active-section={activeSection}
      data-scroll-progress="0.0000"
      data-compass-deg="0.00"
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[1] overflow-hidden select-none transition-opacity duration-[1000ms] ease-out ${
        dimmed ? 'opacity-20' : 'opacity-100'
      }`}
    >
      {/* Subtle section-tinted atmospheric wash */}
      <div
        className="absolute inset-0 transition-colors duration-[1100ms] ease-out"
        style={{ backgroundColor: mood.tintColor }}
      />

      {/* Morphing Lapis & Baby-Blue Diplomatic Halo */}
      <div
        className="absolute top-0 left-0 h-[92vmax] w-[92vmax] -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform"
        style={{
          transform: `translate3d(calc(${mood.lapisX}vw - 50%), calc(${mood.lapisY}vh - 50%), 0) scale(${mood.lapisScale})`,
          opacity: mood.lapisOpacity,
          background:
            'radial-gradient(circle, rgba(131, 181, 237, 0.24) 0%, rgba(38, 69, 114, 0.62) 32%, rgba(20, 42, 74, 0.28) 54%, transparent 72%)',
          transition:
            'transform 1150ms cubic-bezier(0.22, 1, 0.36, 1), opacity 1150ms ease',
        }}
      />

      {/* Morphing Warm Satin Antique-Brass Spotlight */}
      <div
        className="absolute top-0 left-0 h-[76vmax] w-[76vmax] -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform"
        style={{
          transform: `translate3d(calc(${mood.brassX}vw - 50%), calc(${mood.brassY}vh - 50%), 0) scale(${mood.brassScale})`,
          opacity: mood.brassOpacity,
          background:
            'radial-gradient(circle, rgba(213, 189, 139, 0.56) 0%, rgba(184, 154, 98, 0.2) 40%, transparent 68%)',
          transition:
            'transform 1150ms cubic-bezier(0.22, 1, 0.36, 1), opacity 1150ms ease',
        }}
      />

      {/* Subtle Golden World Map Graticule Backdrop */}
      <GoldenWorldMapBackdrop
        className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ${
          activeSection === 'hero' || activeSection === 'registration'
            ? 'opacity-45'
            : activeSection === 'about' || activeSection === 'experience'
            ? 'opacity-20'
            : 'opacity-32'
        }`}
      />

      {/* Lightweight Floating Gold & Baby-Blue Particles */}
      {!dimmed && <GoldParticlesCanvas count={24} className="z-0 opacity-85" />}

      {/* Far Meridian & Parallel Grid Plane (Slow Parallax) */}
      <div
        ref={gridFarRef}
        className="absolute inset-x-0 -top-[200px] -bottom-[200px] will-change-transform"
        style={{
          opacity: mood.gridOpacity,
          transition: 'opacity 900ms ease',
          backgroundImage: `
            linear-gradient(to right, rgba(38, 61, 89, 0.34) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(38, 61, 89, 0.34) 1px, transparent 1px)
          `,
          backgroundSize: '160px 160px',
          backgroundPosition: 'center top',
        }}
      />

      {/* Near Precision Coordinate Grid + Edge Degree Ticks (Medium Parallax) */}
      <div
        ref={gridNearRef}
        className="absolute inset-x-0 -top-[200px] -bottom-[200px] will-change-transform"
        style={{
          opacity: mood.gridOpacity * 0.85,
          transition: 'opacity 900ms ease',
          backgroundImage: `
            linear-gradient(to right, rgba(184, 154, 98, 0.11) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(184, 154, 98, 0.11) 1px, transparent 1px),
            radial-gradient(circle, rgba(213, 189, 139, 0.32) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px, 80px 80px, 160px 160px',
          backgroundPosition: 'center top, center top, center top',
        }}
      >
        {/* Subtle left & right drafting meridian ticks */}
        <div className="absolute inset-y-0 left-3 hidden w-3 flex-col justify-between py-10 md:flex">
          {EDGE_TICKS.map((tick) => (
            <span
              key={`lt-${tick}`}
              className={`block h-px bg-[#B89A62]/35 ${
                tick % 3 === 0 ? 'w-3' : 'w-1.5 opacity-60'
              }`}
            />
          ))}
        </div>
        <div className="absolute inset-y-0 right-3 hidden w-3 flex-col items-end justify-between py-10 md:flex">
          {EDGE_TICKS.map((tick) => (
            <span
              key={`rt-${tick}`}
              className={`block h-px bg-[#B89A62]/35 ${
                tick % 3 === 0 ? 'w-3' : 'w-1.5 opacity-60'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Celestial Astrolabe & Compass Arcs (Scroll-Rotated) */}
      <div
        ref={compassStageRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
      >
        <svg
          viewBox="0 0 1000 1000"
          className="h-[min(126vmin,1120px)] w-[min(126vmin,1120px)] overflow-visible transition-opacity duration-[1000ms] ease-out"
          style={{ opacity: mood.ringOpacity }}
        >
          {/* Fixed equatorial & polar crosshairs */}
          <line
            x1="40"
            y1="500"
            x2="960"
            y2="500"
            stroke="#263D59"
            strokeWidth="0.75"
            strokeDasharray="4 10"
            strokeOpacity="0.65"
          />
          <line
            x1="500"
            y1="40"
            x2="500"
            y2="960"
            stroke="#263D59"
            strokeWidth="0.75"
            strokeDasharray="4 10"
            strokeOpacity="0.65"
          />

          {/* Outer Celestial Azimuth Ring (+Clockwise) */}
          <g
            ref={compassOuterRef}
            style={{ transformOrigin: '500px 500px' }}
          >
            <circle
              cx="500"
              cy="500"
              r="458"
              fill="none"
              stroke="#B89A62"
              strokeWidth="0.9"
              strokeOpacity="0.55"
            />
            <circle
              cx="500"
              cy="500"
              r="426"
              fill="none"
              stroke="#263D59"
              strokeWidth="0.85"
              strokeDasharray="3 9"
              strokeOpacity="0.8"
            />
            {OUTER_TICKS.map((t) => (
              <line
                key={t.key}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.isCardinal ? '#D5BD8B' : '#B89A62'}
                strokeWidth={t.isCardinal ? '1.35' : t.isMajor ? '1' : '0.65'}
                strokeOpacity={t.isCardinal ? '0.9' : t.isMajor ? '0.68' : '0.4'}
              />
            ))}
          </g>

          {/* Mid Ecliptic & Great-Circle Compass Arcs (-Counter-Clockwise) */}
          <g
            ref={compassMidRef}
            style={{ transformOrigin: '500px 500px' }}
          >
            <circle
              cx="500"
              cy="500"
              r="348"
              fill="none"
              stroke="#D5BD8B"
              strokeWidth="1.05"
              strokeDasharray="210 140 90 140"
              strokeOpacity="0.72"
            />
            <ellipse
              cx="500"
              cy="500"
              rx="388"
              ry="294"
              transform="rotate(-24 500 500)"
              fill="none"
              stroke="#263D59"
              strokeWidth="0.95"
              strokeOpacity="0.85"
            />
            <ellipse
              cx="500"
              cy="500"
              rx="388"
              ry="294"
              transform="rotate(36 500 500)"
              fill="none"
              stroke="#B89A62"
              strokeWidth="0.75"
              strokeDasharray="10 14"
              strokeOpacity="0.52"
            />
          </g>

          {/* Inner Meridian Astrolabe Ring (+Clockwise Faster) */}
          <g
            ref={compassInnerRef}
            style={{ transformOrigin: '500px 500px' }}
          >
            <circle
              cx="500"
              cy="500"
              r="248"
              fill="none"
              stroke="#B89A62"
              strokeWidth="0.85"
              strokeOpacity="0.62"
            />
            <circle
              cx="500"
              cy="500"
              r="182"
              fill="none"
              stroke="#263D59"
              strokeWidth="0.8"
              strokeDasharray="6 12"
              strokeOpacity="0.8"
            />
            {INNER_TICKS.map((t) => (
              <line
                key={t.key}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="#D5BD8B"
                strokeWidth={t.isMajor ? '1.1' : '0.65'}
                strokeOpacity={t.isMajor ? '0.78' : '0.42'}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};

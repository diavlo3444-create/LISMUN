import React, { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../utils/atlasAnimations';

interface GoldParticlesCanvasProps {
  className?: string;
  count?: number;
}

interface GoldParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  tone: 'gold' | 'champagne' | 'babyblue';
}

export const GoldParticlesCanvas: React.FC<GoldParticlesCanvasProps> = ({
  className = '',
  count = 26,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined' || prefersReducedMotion()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let lastTime = performance.now();

    const particles: GoldParticle[] = Array.from({ length: count }, (_, idx) => {
      const mod = idx % 7;
      return {
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.009,
        vy: -(0.005 + Math.random() * 0.011),
        r: mod === 0 ? 2.1 : 1.0 + Math.random() * 1.15,
        alpha: 0.18 + Math.random() * 0.34,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 0.9,
        tone: mod === 6 ? 'babyblue' : idx % 2 === 0 ? 'gold' : 'champagne',
      };
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const draw = (now: number) => {
      rafId = 0;
      if (document.hidden) return;

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.twinklePhase += p.twinkleSpeed * dt;

        if (p.y < -0.04) {
          p.y = 1.04;
          p.x = Math.random();
        }
        if (p.x < -0.04) p.x = 1.04;
        if (p.x > 1.04) p.x = -0.04;

        const px = p.x * width;
        const py = p.y * height;
        const pulse = 0.65 + 0.35 * Math.sin(p.twinklePhase);
        const a = p.alpha * pulse;

        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        if (p.tone === 'babyblue') {
          ctx.fillStyle = `rgba(131, 181, 237, ${(a * 0.8).toFixed(3)})`;
        } else if (p.tone === 'champagne') {
          ctx.fillStyle = `rgba(213, 189, 139, ${a.toFixed(3)})`;
        } else {
          ctx.fillStyle = `rgba(184, 154, 98, ${a.toFixed(3)})`;
        }
        ctx.fill();

        if (p.r >= 1.8) {
          ctx.beginPath();
          ctx.arc(px, py, p.r * 2.4, 0, Math.PI * 2);
          ctx.fillStyle =
            p.tone === 'babyblue'
              ? `rgba(131, 181, 237, ${(a * 0.14).toFixed(3)})`
              : `rgba(213, 189, 139, ${(a * 0.12).toFixed(3)})`;
          ctx.fill();
        }
      }

      rafId = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (!rafId && !document.hidden) {
        lastTime = performance.now();
        rafId = window.requestAnimationFrame(draw);
      }
    };

    const stop = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 h-full w-full ${className}`}
    />
  );
};

export const GoldenWorldMapBackdrop: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <svg
    viewBox="0 0 1200 580"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    className={`pointer-events-none select-none ${className}`}
  >
    <defs>
      <radialGradient id="atlasMapAura" cx="52%" cy="46%" r="58%">
        <stop offset="0%" stopColor="#83B5ED" stopOpacity="0.16" />
        <stop offset="48%" stopColor="#B89A62" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#030914" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="atlasGoldMapStroke" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#B89A62" stopOpacity="0.14" />
        <stop offset="50%" stopColor="#D5BD8B" stopOpacity="0.46" />
        <stop offset="100%" stopColor="#83B5ED" stopOpacity="0.22" />
      </linearGradient>
    </defs>

    {/* Subtle baby-blue & gold cartographic glow */}
    <rect width="1200" height="580" fill="url(#atlasMapAura)" />

    {/* Cartographic Latitude & Longitude Parallels */}
    <g stroke="#263D59" strokeWidth="0.6" strokeOpacity="0.42" fill="none">
      {[96, 192, 290, 388, 484].map((y) => (
        <line key={`lat-${y}`} x1="40" y1={y} x2="1160" y2={y} strokeDasharray="3 8" />
      ))}
      {[160, 320, 480, 600, 720, 880, 1040].map((x) => (
        <line key={`lon-${x}`} x1={x} y1="28" x2={x} y2="552" strokeDasharray="3 8" />
      ))}
      <ellipse cx="600" cy="290" rx="540" ry="255" stroke="#B89A62" strokeOpacity="0.22" />
      <ellipse cx="600" cy="290" rx="340" ry="255" strokeOpacity="0.3" />
    </g>

    {/* Stylized Golden Cartographic Continent Outlines */}
    <g
      fill="rgba(184, 154, 98, 0.045)"
      stroke="url(#atlasGoldMapStroke)"
      strokeWidth="1.05"
      strokeLinejoin="round"
    >
      {/* North & Central America */}
      <path d="M 118 148 L 166 116 L 246 112 L 306 138 L 328 172 L 296 208 L 284 242 L 246 254 L 222 276 L 238 302 L 214 316 L 194 282 L 154 244 L 122 198 Z" />
      <path d="M 294 84 L 356 76 L 378 104 L 336 124 L 302 108 Z" />
      {/* South America */}
      <path d="M 248 318 L 296 314 L 348 344 L 368 386 L 340 444 L 308 498 L 282 522 L 266 476 L 258 412 L 236 364 Z" />
      {/* Europe */}
      <path d="M 516 146 L 552 122 L 602 114 L 634 134 L 620 172 L 584 196 L 538 198 L 510 176 Z" />
      <path d="M 484 148 L 504 140 L 508 164 L 488 168 Z" />
      {/* Africa & Arabian Peninsula */}
      <path d="M 512 222 L 574 210 L 636 226 L 678 242 L 716 254 L 698 292 L 656 296 L 642 344 L 646 392 L 610 456 L 576 462 L 552 406 L 542 356 L 496 318 L 484 268 Z" />
      {/* Asia */}
      <path d="M 636 124 L 742 102 L 866 112 L 966 136 L 1018 174 L 972 214 L 924 244 L 900 286 L 854 304 L 826 274 L 788 312 L 748 286 L 722 252 L 674 232 L 642 192 Z" />
      {/* Maritime SE Asia & Oceania */}
      <path d="M 884 328 L 932 326 L 944 352 L 892 354 Z" />
      <path d="M 918 394 L 986 382 L 1034 408 L 1038 456 L 988 476 L 926 456 L 906 424 Z" />
    </g>

    {/* Diplomatic Great-Circle Routes converging on Session I */}
    <g fill="none">
      <path
        d="M 274 218 Q 470 128 696 266"
        stroke="#83B5ED"
        strokeWidth="0.95"
        strokeOpacity="0.38"
        strokeDasharray="4 6"
      />
      <path
        d="M 564 168 Q 630 202 696 266"
        stroke="#D5BD8B"
        strokeWidth="1"
        strokeOpacity="0.45"
        strokeDasharray="4 6"
      />
      <path
        d="M 962 424 Q 842 332 696 266"
        stroke="#83B5ED"
        strokeWidth="0.9"
        strokeOpacity="0.32"
        strokeDasharray="4 6"
      />
      {/* Origin Beacon with restrained Crimson Jewel Center */}
      <circle cx="696" cy="266" r="10" stroke="#83B5ED" strokeOpacity="0.32" strokeWidth="0.9" />
      <circle cx="696" cy="266" r="5" stroke="#D5BD8B" strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="696" cy="266" r="2.2" fill="#9E2530" />
    </g>
  </svg>
);

export const OrnamentalGoldDivider: React.FC<{
  label?: string;
  className?: string;
}> = ({ label, className = '' }) => (
  <div
    aria-hidden={!label}
    className={`mx-auto flex w-full max-w-[1440px] items-center gap-4 px-6 md:px-10 ${className}`}
  >
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#B89A62]/45 to-[#D5BD8B]/75" />
    <div className="flex items-center gap-3">
      <span className="h-1.5 w-1.5 rotate-45 border border-[#83B5ED]/65 bg-[#071426]" />
      {label ? (
        <span className="font-mono text-[10px] tracking-[0.26em] text-[#D5BD8B]/85 uppercase whitespace-nowrap">
          {label}
        </span>
      ) : (
        <svg viewBox="0 0 28 28" className="h-5 w-5" aria-hidden="true">
          <circle cx="14" cy="14" r="11" fill="none" stroke="#B89A62" strokeOpacity="0.55" strokeWidth="0.8" />
          <path
            d="M 14 4 L 16.4 11.6 L 24 14 L 16.4 16.4 L 14 24 L 11.6 16.4 L 4 14 L 11.6 11.6 Z"
            fill="#D5BD8B"
            fillOpacity="0.85"
          />
          <circle cx="14" cy="14" r="2.1" fill="#7F1D26" />
        </svg>
      )}
      <span className="h-1.5 w-1.5 rotate-45 border border-[#83B5ED]/65 bg-[#071426]" />
    </div>
    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#B89A62]/45 to-[#D5BD8B]/75" />
  </div>
);

export const LaurelWreathAccent: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = '', size = 56 }) => (
  <svg
    viewBox="0 0 80 40"
    width={size}
    height={size / 2}
    aria-hidden="true"
    className={`shrink-0 ${className}`}
  >
    <g fill="none" stroke="#D5BD8B" strokeWidth="1.2" strokeLinecap="round">
      <path d="M 32 34 C 19 30, 12 20, 14 8" strokeOpacity="0.8" />
      <path d="M 48 34 C 61 30, 68 20, 66 8" strokeOpacity="0.8" />
      {[
        [24, 30, -35],
        [18, 23, -55],
        [15, 15, -75],
      ].map(([cx, cy, rot], idx) => (
        <path
          key={`lw-${idx}`}
          d="M 0 0 C -3 -4, -2 -9, 0 -11 C 3 -8, 3 -4, 0 0 Z"
          transform={`translate(${cx}, ${cy}) rotate(${rot})`}
          fill="rgba(213, 189, 139, 0.2)"
        />
      ))}
      {[
        [56, 30, 35],
        [62, 23, 55],
        [65, 15, 75],
      ].map(([cx, cy, rot], idx) => (
        <path
          key={`rw-${idx}`}
          d="M 0 0 C -3 -4, -2 -9, 0 -11 C 3 -8, 3 -4, 0 0 Z"
          transform={`translate(${cx}, ${cy}) rotate(${rot})`}
          fill="rgba(213, 189, 139, 0.2)"
        />
      ))}
    </g>
    <circle cx="40" cy="22" r="4.5" fill="#7F1D26" stroke="#D5BD8B" strokeWidth="1" />
    <circle cx="40" cy="22" r="1.5" fill="#83B5ED" />
  </svg>
);

export const DiplomaticWaxSeal: React.FC<{
  size?: number;
  label?: string;
  className?: string;
}> = ({ size = 68, label = 'SESSION I', className = '' }) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    aria-hidden="true"
    className={`shrink-0 select-none ${className}`}
  >
    <defs>
      <radialGradient id="crimsonWaxGrad" cx="38%" cy="34%" r="68%">
        <stop offset="0%" stopColor="#A62B37" />
        <stop offset="65%" stopColor="#7F1D26" />
        <stop offset="100%" stopColor="#4A0E14" />
      </radialGradient>
    </defs>
    {/* Organic Scalloped Wax Perimeter */}
    <path
      d="M 50 4 C 58 4 64 9 72 9 C 79 9 87 16 89 24 C 92 31 96 39 95 48 C 94 57 93 66 88 74 C 83 82 77 89 68 91 C 60 93 52 97 44 95 C 35 93 26 90 19 83 C 12 76 7 68 6 58 C 5 49 4 39 9 30 C 13 22 19 13 28 10 C 36 7 42 4 50 4 Z"
      fill="url(#crimsonWaxGrad)"
      stroke="#D5BD8B"
      strokeWidth="1.2"
      strokeOpacity="0.72"
    />
    <circle cx="50" cy="50" r="34" fill="none" stroke="#D5BD8B" strokeWidth="1" strokeOpacity="0.65" />
    <circle cx="50" cy="50" r="29" fill="none" stroke="#D5BD8B" strokeWidth="0.6" strokeDasharray="2 3" strokeOpacity="0.6" />
    {/* Embossed Gold Diplomatic Compass Star */}
    <path
      d="M 50 26 L 54.5 45.5 L 74 50 L 54.5 54.5 L 50 74 L 45.5 54.5 L 26 50 L 45.5 45.5 Z"
      fill="#D5BD8B"
      fillOpacity="0.92"
    />
    <circle cx="50" cy="50" r="4.2" fill="#071426" stroke="#83B5ED" strokeWidth="1" />
    <text
      x="50"
      y="87"
      textAnchor="middle"
      fill="#F0DFB8"
      fontSize="6.5"
      fontFamily="IBM Plex Mono, monospace"
      letterSpacing="1.4"
    >
      {label}
    </text>
  </svg>
);

import React, { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../utils/atlasAnimations';

interface MeridianOceanCanvasProps {
  activeChapterIdx: number;
}

interface ChapterFlowPreset {
  rotationRad: number;
  focalX: number;
  focalY: number;
  freq: number;
  swellAmp: number;
}

const CHAPTER_FLOW_PRESETS: readonly ChapterFlowPreset[] = [
  // Folio I: North Atlantic Meridian — sweeping diagonal swell toward upper-right
  {
    rotationRad: -0.31,
    focalX: 0.66,
    focalY: 0.42,
    freq: 1.0,
    swellAmp: 1.0,
  },
  // Folio II: Continental Diplomatic Corridor — smooth clockwise pivot with tighter harmonic ripples
  {
    rotationRad: 0.24,
    focalX: 0.34,
    focalY: 0.48,
    freq: 1.26,
    swellAmp: 0.88,
  },
  // Folio III: Equatorial & Indo-Pacific Span — grand equatorial horizon sweep
  {
    rotationRad: 0.07,
    focalX: 0.56,
    focalY: 0.55,
    freq: 0.88,
    swellAmp: 1.15,
  },
];

interface CurrentParticle {
  u: number; // 0..1 normalized horizontal progress along wave
  bandIdx: number;
  speed: number;
  size: number;
  alpha: number;
  phaseOffset: number;
}

function createCurrentParticles(count: number): CurrentParticle[] {
  const list: CurrentParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    // Deterministic seeded spread across golden meridian bands
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const r1 = seed - Math.floor(seed);
    const seed2 = Math.sin(i * 41.123 + 19.71) * 24634.6345;
    const r2 = seed2 - Math.floor(seed2);
    list.push({
      u: r1,
      bandIdx: i % 8,
      speed: 0.028 + r2 * 0.036,
      size: 1.2 + (i % 3) * 0.65,
      alpha: 0.42 + r2 * 0.48,
      phaseOffset: r1 * Math.PI * 2,
    });
  }
  return list;
}

export const MeridianOceanCanvas: React.FC<MeridianOceanCanvasProps> = ({
  activeChapterIdx,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetChapterRef = useRef<number>(activeChapterIdx);

  targetChapterRef.current = activeChapterIdx;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = prefersReducedMotion();
    const particles = createCurrentParticles(36);

    const initialPreset =
      CHAPTER_FLOW_PRESETS[targetChapterRef.current] ?? CHAPTER_FLOW_PRESETS[0];

    const state = {
      rotation: initialPreset.rotationRad,
      focalX: initialPreset.focalX,
      focalY: initialPreset.focalY,
      freq: initialPreset.freq,
      swellAmp: initialPreset.swellAmp,
      time: 0,
      width: 1280,
      height: 760,
      dpr: 1,
    };

    const syncSize = () => {
      const rect = wrapper.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width || window.innerWidth));
      const h = Math.max(320, Math.round(rect.height || window.innerHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      state.width = w;
      state.height = h;
      state.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    syncSize();

    const evalWaveY = (
      xNorm: number,
      baseY: number,
      bandNorm: number,
      timeSec: number,
      freq: number,
      ampScale: number,
      focalX: number,
      focalY: number,
      height: number
    ) => {
      // Focal pinch pulls meridian streams gently toward the active chapter focal Y
      const distFromFocusX = xNorm - focalX;
      const convergence = Math.exp(-distFromFocusX * distFromFocusX * 3.4);
      const focalPull = (focalY * height - baseY) * 0.24 * convergence;

      const primary =
        Math.sin(xNorm * Math.PI * 2.4 * freq + timeSec * 0.72 + bandNorm * 4.2) *
        (26 * ampScale);
      const secondary =
        Math.cos(xNorm * Math.PI * 4.1 * freq - timeSec * 0.48 + bandNorm * 7.5) *
        (11 * ampScale);
      const swell =
        Math.sin(xNorm * Math.PI * 1.15 - timeSec * 0.34 + bandNorm * 2.1) *
        (18 * ampScale);

      return baseY + focalPull + primary + secondary + swell;
    };

    const drawFrame = (dt: number) => {
      const preset =
        CHAPTER_FLOW_PRESETS[targetChapterRef.current] ?? CHAPTER_FLOW_PRESETS[0];

      // Smooth exponential damping when shifting chapters
      const damp = reducedMotion ? 1 : 1 - Math.exp(-3.4 * dt);
      state.rotation += (preset.rotationRad - state.rotation) * damp;
      state.focalX += (preset.focalX - state.focalX) * damp;
      state.focalY += (preset.focalY - state.focalY) * damp;
      state.freq += (preset.freq - state.freq) * damp;
      state.swellAmp += (preset.swellAmp - state.swellAmp) * damp;

      if (!reducedMotion) {
        state.time += dt;
      }

      const { width, height, dpr, time, rotation, focalX, focalY, freq, swellAmp } =
        state;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // 1. Deep oceanic navy base + focal tidal luminescence
      ctx.fillStyle = 'rgba(4, 13, 27, 0.72)';
      ctx.fillRect(0, 0, width, height);

      const fxPx = focalX * width;
      const fyPx = focalY * height;
      const tideGlow = ctx.createRadialGradient(
        fxPx,
        fyPx,
        24,
        fxPx,
        fyPx,
        Math.max(width, height) * 0.62
      );
      tideGlow.addColorStop(0, 'rgba(213, 189, 139, 0.14)');
      tideGlow.addColorStop(0.32, 'rgba(24, 58, 102, 0.28)');
      tideGlow.addColorStop(0.7, 'rgba(8, 22, 44, 0.16)');
      tideGlow.addColorStop(1, 'rgba(3, 9, 20, 0)');
      ctx.fillStyle = tideGlow;
      ctx.fillRect(0, 0, width, height);

      // 2. Rotated flow-field canvas frame centered on viewport
      const diag = Math.hypot(width, height);
      const spanW = diag * 1.18;
      const spanH = diag * 1.05;
      const startX = -spanW * 0.5;
      const startY = -spanH * 0.5;

      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(rotation);

      // Subtle curved longitudinal meridian arcs behind the swells
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = 'rgba(38, 61, 89, 0.36)';
      const meridianCount = 9;
      for (let m = 0; m < meridianCount; m += 1) {
        const u = m / (meridianCount - 1);
        const mx = startX + u * spanW;
        const curvePull = (0.5 - u) * 140 * Math.sin(time * 0.18 + u * 2.2);
        ctx.beginPath();
        ctx.moveTo(mx, startY);
        ctx.quadraticCurveTo(mx + curvePull, 0, mx, -startY);
        ctx.stroke();
      }

      // 3. Bathymetric deep ocean swells (20 layered Prussian-blue wave ribbons)
      const swellCount = 20;
      const steps = width < 640 ? 44 : 68;
      for (let i = 0; i < swellCount; i += 1) {
        const bandNorm = i / (swellCount - 1);
        const baseY = startY + (0.08 + bandNorm * 0.84) * spanH;
        const crestProximity = 1 - Math.abs(bandNorm - 0.5) * 1.4;

        ctx.beginPath();
        for (let s = 0; s <= steps; s += 1) {
          const xNorm = s / steps;
          const px = startX + xNorm * spanW;
          const py = evalWaveY(
            xNorm,
            baseY,
            bandNorm,
            time,
            freq,
            swellAmp,
            focalX,
            focalY,
            spanH * 0.45
          );
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }

        ctx.strokeStyle = `rgba(38, 69, 110, ${(0.18 + Math.max(0, crestProximity) * 0.22).toFixed(3)})`;
        ctx.lineWidth = i % 3 === 0 ? 1.4 : 0.9;
        ctx.stroke();
      }

      // 4. Luminous Golden Meridian Currents (8 featured filament streams)
      const goldStreams = 8;
      const streamYs: number[][] = [];
      ctx.globalCompositeOperation = 'lighter';

      for (let g = 0; g < goldStreams; g += 1) {
        const bandNorm = (g + 0.5) / goldStreams;
        const baseY = startY + (0.18 + bandNorm * 0.64) * spanH;
        const ptsY: number[] = [];

        // Soft warm aura under the golden meridian current
        ctx.beginPath();
        for (let s = 0; s <= steps; s += 1) {
          const xNorm = s / steps;
          const px = startX + xNorm * spanW;
          const py = evalWaveY(
            xNorm,
            baseY,
            bandNorm + 0.12,
            time * 1.08 + g * 0.22,
            freq,
            swellAmp * 1.06,
            focalX,
            focalY,
            spanH * 0.42
          );
          ptsY.push(py);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        streamYs.push(ptsY);

        ctx.strokeStyle =
          g % 2 === 0
            ? 'rgba(184, 154, 98, 0.20)'
            : 'rgba(213, 189, 139, 0.14)';
        ctx.lineWidth = g % 2 === 0 ? 4.5 : 3.2;
        ctx.stroke();

        // Crisp illuminated antique-gold hairline current
        ctx.strokeStyle =
          g % 2 === 0
            ? 'rgba(213, 189, 139, 0.46)'
            : 'rgba(184, 154, 98, 0.34)';
        ctx.lineWidth = g % 2 === 0 ? 1.25 : 0.95;
        ctx.stroke();

        // Traveling luminous crest pulse gliding smoothly along the current
        const pulseCenter = ((time * (0.09 + (g % 3) * 0.02) + g * 0.31) % 1.2) - 0.1;
        const pulseSpan = 0.22;
        const sStart = Math.max(0, Math.floor((pulseCenter - pulseSpan) * steps));
        const sEnd = Math.min(steps, Math.ceil((pulseCenter + pulseSpan) * steps));

        if (sEnd > sStart) {
          ctx.beginPath();
          for (let s = sStart; s <= sEnd; s += 1) {
            const xNorm = s / steps;
            const px = startX + xNorm * spanW;
            const py = ptsY[s];
            if (s === sStart) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = 'rgba(232, 225, 210, 0.62)';
          ctx.lineWidth = 1.65;
          ctx.stroke();
        }
      }

      // 5. Drifting golden waypoint nodes riding along the current streams
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (!reducedMotion) {
          p.u = (p.u + p.speed * dt) % 1;
        }
        const bandNorm = (p.bandIdx + 0.5) / goldStreams;
        const baseY = startY + (0.18 + bandNorm * 0.64) * spanH;
        const px = startX + p.u * spanW;
        const py = evalWaveY(
          p.u,
          baseY,
          bandNorm + 0.12,
          time * 1.08 + p.bandIdx * 0.22,
          freq,
          swellAmp * 1.06,
          focalX,
          focalY,
          spanH * 0.42
        );

        const edgeFade = Math.sin(p.u * Math.PI);
        const alpha = p.alpha * edgeFade;
        if (alpha <= 0.03) continue;

        ctx.fillStyle = `rgba(232, 225, 210, ${(alpha * 0.85).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (i % 5 === 0) {
          ctx.strokeStyle = `rgba(213, 189, 139, ${(alpha * 0.45).toFixed(3)})`;
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 3.1, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // 6. Subtle focal meridian compass ring at the active chapter focal center
      const ringRadius = 46 + Math.sin(time * 1.4) * 4;
      ctx.strokeStyle = 'rgba(213, 189, 139, 0.22)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(fxPx, fyPx, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(184, 154, 98, 0.14)';
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(fxPx, fyPx, ringRadius + 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      const rotDeg = ((rotation * 180) / Math.PI).toFixed(1);
      if (wrapper.dataset.rotationDeg !== rotDeg) {
        wrapper.dataset.rotationDeg = rotDeg;
      }
    };

    // Draw initial crisp frame immediately
    drawFrame(0);
    if (reducedMotion) return;

    let rafId = 0;
    let isInView = true;
    let lastTs = performance.now();

    const tick = (now: number) => {
      rafId = 0;
      if (!isInView || document.hidden) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      drawFrame(dt);
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (!rafId && isInView && !document.hidden) {
        lastTs = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isInView = entry.isIntersecting;
        if (isInView) startLoop();
        else stopLoop();
      },
      { threshold: 0.02 }
    );
    observer.observe(wrapper);

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
      drawFrame(0);
    });
    resizeObserver.observe(wrapper);

    const onVisChange = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener('visibilitychange', onVisChange);

    startLoop();

    return () => {
      stopLoop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-testid="meridian-ocean-canvas"
      data-chapter-idx={activeChapterIdx}
      data-rotation-deg="0.0"
      className="relative h-full w-full overflow-hidden"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};

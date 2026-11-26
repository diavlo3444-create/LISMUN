import React, { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../utils/atlasAnimations';

interface MeridianOceanCanvasProps {
  activeChapterIdx: number;
  isSectionVisible?: boolean;
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

const SWELL_COUNT = 16;
const GOLD_STREAMS = 8;
const MERIDIAN_COUNT = 9;
const PARTICLE_COUNT = 36;

// Precomputed stroke styles for bathymetric deep ocean swells (zero per-frame string allocation)
const SWELL_STYLES: readonly string[] = Array.from(
  { length: SWELL_COUNT },
  (_, i) => {
    const bandNorm = i / (SWELL_COUNT - 1);
    const crestProximity = 1 - Math.abs(bandNorm - 0.5) * 1.4;
    const alpha = (0.18 + Math.max(0, crestProximity) * 0.22).toFixed(3);
    return `rgba(38, 69, 110, ${alpha})`;
  }
);

const GOLD_AURA_STYLES = [
  'rgba(184, 154, 98, 0.22)',
  'rgba(213, 189, 139, 0.16)',
] as const;

const GOLD_CORE_STYLES = [
  'rgba(213, 189, 139, 0.54)',
  'rgba(184, 154, 98, 0.42)',
] as const;

// Quantized alpha lookup tables for particles (0..20)
const ALPHA_STEPS = 20;
const PARTICLE_FILL_COLORS: readonly string[] = Array.from(
  { length: ALPHA_STEPS + 1 },
  (_, idx) => `rgba(238, 231, 216, ${((idx / ALPHA_STEPS) * 0.88).toFixed(3)})`
);
const PARTICLE_RING_COLORS: readonly string[] = Array.from(
  { length: ALPHA_STEPS + 1 },
  (_, idx) => `rgba(213, 189, 139, ${((idx / ALPHA_STEPS) * 0.48).toFixed(3)})`
);

interface CurrentParticle {
  u: number;
  bandIdx: number;
  speed: number;
  size: number;
  alpha: number;
  hasRing: boolean;
}

function createCurrentParticles(count: number): CurrentParticle[] {
  const list: CurrentParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const r1 = seed - Math.floor(seed);
    const seed2 = Math.sin(i * 41.123 + 19.71) * 24634.6345;
    const r2 = seed2 - Math.floor(seed2);
    list.push({
      u: r1,
      bandIdx: i % GOLD_STREAMS,
      speed: 0.028 + r2 * 0.036,
      size: 1.2 + (i % 3) * 0.65,
      alpha: 0.42 + r2 * 0.48,
      hasRing: i % 5 === 0,
    });
  }
  return list;
}

// Bake focal tidal glow once onto a compact 256x256 offscreen canvas sprite
function createGlowSprite(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const sprite = document.createElement('canvas');
  const size = 256;
  sprite.width = size;
  sprite.height = size;
  const sctx = sprite.getContext('2d');
  if (!sctx) return null;
  const half = size * 0.5;
  const grad = sctx.createRadialGradient(half, half, 4, half, half, half);
  grad.addColorStop(0, 'rgba(213, 189, 139, 0.15)');
  grad.addColorStop(0.32, 'rgba(24, 58, 102, 0.28)');
  grad.addColorStop(0.7, 'rgba(8, 22, 44, 0.16)');
  grad.addColorStop(1, 'rgba(3, 9, 20, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, size, size);
  return sprite;
}

export const MeridianOceanCanvas: React.FC<MeridianOceanCanvasProps> = ({
  activeChapterIdx,
  isSectionVisible = true,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetChapterRef = useRef<number>(activeChapterIdx);
  const sectionVisibleRef = useRef<boolean>(isSectionVisible);
  const wakeLoopRef = useRef<(() => void) | null>(null);

  targetChapterRef.current = activeChapterIdx;
  sectionVisibleRef.current = isSectionVisible;

  useEffect(() => {
    wakeLoopRef.current?.();
  }, [isSectionVisible]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = prefersReducedMotion();
    const particles = createCurrentParticles(PARTICLE_COUNT);
    const glowSprite = createGlowSprite();

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
      steps: 44,
      diag: 1488,
      spanW: 1756,
      spanH: 1562,
      startX: -878,
      startY: -781,
      glowRadius: 744,
      cachedFocalX: -1,
      lastReportedRot: '',
      lastRotReportMs: 0,
    };

    // Reusable typed buffers (resized only when step count changes)
    let xNorms = new Float32Array(state.steps + 1);
    let pxCoords = new Float32Array(state.steps + 1);
    let convergenceArr = new Float32Array(state.steps + 1);
    let streamYs: Float32Array[] = Array.from(
      { length: GOLD_STREAMS },
      () => new Float32Array(state.steps + 1)
    );

    const rebuildGeometryBuffers = () => {
      const { steps, spanW, startX } = state;
      if (xNorms.length !== steps + 1) {
        xNorms = new Float32Array(steps + 1);
        pxCoords = new Float32Array(steps + 1);
        convergenceArr = new Float32Array(steps + 1);
        streamYs = Array.from(
          { length: GOLD_STREAMS },
          () => new Float32Array(steps + 1)
        );
      }
      for (let s = 0; s <= steps; s += 1) {
        const u = s / steps;
        xNorms[s] = u;
        pxCoords[s] = startX + u * spanW;
      }
      state.cachedFocalX = -1;
    };

    const syncSize = () => {
      const rect = wrapper.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width || window.innerWidth));
      const h = Math.max(320, Math.round(rect.height || window.innerHeight));
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = w >= 1024 ? 1 : Math.min(rawDpr, 1.15);

      state.width = w;
      state.height = h;
      state.dpr = dpr;
      state.steps = w < 640 ? 32 : 44;
      state.diag = Math.hypot(w, h);
      state.spanW = state.diag * 1.18;
      state.spanH = state.diag * 1.05;
      state.startX = -state.spanW * 0.5;
      state.startY = -state.spanH * 0.5;
      state.glowRadius = Math.max(w, h) * 0.62;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      rebuildGeometryBuffers();
    };

    syncSize();

    const updateConvergenceIfNeeded = (focalX: number) => {
      if (Math.abs(focalX - state.cachedFocalX) < 0.0005) return;
      state.cachedFocalX = focalX;
      const count = state.steps;
      for (let s = 0; s <= count; s += 1) {
        const d = xNorms[s] - focalX;
        convergenceArr[s] = Math.exp(-d * d * 3.4);
      }
    };

    const drawFrame = (dt: number, nowMs: number) => {
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

      const {
        width,
        height,
        dpr,
        time,
        rotation,
        focalX,
        focalY,
        freq,
        swellAmp,
        steps,
        spanW,
        spanH,
        startX,
        startY,
        glowRadius,
      } = state;

      updateConvergenceIfNeeded(focalX);

      const fxPx = focalX * width;
      const fyPx = focalY * height;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Draw pre-baked focal tidal luminescence sprite (fast single blit, zero gradient alloc)
      if (glowSprite) {
        ctx.drawImage(
          glowSprite,
          fxPx - glowRadius,
          fyPx - glowRadius,
          glowRadius * 2,
          glowRadius * 2
        );
      }

      // Rotated flow-field canvas frame centered on viewport
      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(rotation);

      // 1. Batched longitudinal meridian arcs (1 stroke call)
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = 'rgba(38, 61, 89, 0.36)';
      ctx.beginPath();
      for (let m = 0; m < MERIDIAN_COUNT; m += 1) {
        const u = m / (MERIDIAN_COUNT - 1);
        const mx = startX + u * spanW;
        const curvePull = (0.5 - u) * 140 * Math.sin(time * 0.18 + u * 2.2);
        ctx.moveTo(mx, startY);
        ctx.quadraticCurveTo(mx + curvePull, 0, mx, -startY);
      }
      ctx.stroke();

      // 2. Bathymetric deep ocean swells
      const swellFocalH = spanH * 0.45;
      const freqPi24 = Math.PI * 2.4 * freq;
      const freqPi41 = Math.PI * 4.1 * freq;
      const pi115 = Math.PI * 1.15;
      const ampPrimary = 26 * swellAmp;
      const ampSecondary = 11 * swellAmp;
      const ampSwell = 18 * swellAmp;
      const t072 = time * 0.72;
      const t048 = time * 0.48;
      const t034 = time * 0.34;
      const focalYTargetSwell = focalY * swellFocalH;

      for (let i = 0; i < SWELL_COUNT; i += 1) {
        const bandNorm = i / (SWELL_COUNT - 1);
        const baseY = startY + (0.08 + bandNorm * 0.84) * spanH;
        const focalDelta = (focalYTargetSwell - baseY) * 0.24;
        const pPhase = t072 + bandNorm * 4.2;
        const sPhase = -t048 + bandNorm * 7.5;
        const wPhase = -t034 + bandNorm * 2.1;

        ctx.beginPath();
        for (let s = 0; s <= steps; s += 1) {
          const xNorm = xNorms[s];
          const py =
            baseY +
            focalDelta * convergenceArr[s] +
            Math.sin(xNorm * freqPi24 + pPhase) * ampPrimary +
            Math.cos(xNorm * freqPi41 + sPhase) * ampSecondary +
            Math.sin(xNorm * pi115 + wPhase) * ampSwell;

          if (s === 0) ctx.moveTo(pxCoords[s], py);
          else ctx.lineTo(pxCoords[s], py);
        }

        ctx.strokeStyle = SWELL_STYLES[i];
        ctx.lineWidth = i % 3 === 0 ? 1.4 : 0.9;
        ctx.stroke();
      }

      // 3. Luminous Golden Meridian Currents (8 featured streams, cached Y for pulses & particles)
      const goldFocalH = spanH * 0.42;
      const focalYTargetGold = focalY * goldFocalH;
      const goldAmpP = 26 * swellAmp * 1.06;
      const goldAmpS = 11 * swellAmp * 1.06;
      const goldAmpW = 18 * swellAmp * 1.06;
      const tGold = time * 1.08;

      for (let g = 0; g < GOLD_STREAMS; g += 1) {
        const bandNorm = (g + 0.5) / GOLD_STREAMS;
        const streamBand = bandNorm + 0.12;
        const baseY = startY + (0.18 + bandNorm * 0.64) * spanH;
        const focalDelta = (focalYTargetGold - baseY) * 0.24;
        const gt = tGold + g * 0.22;
        const pPhase = gt * 0.72 + streamBand * 4.2;
        const sPhase = -gt * 0.48 + streamBand * 7.5;
        const wPhase = -gt * 0.34 + streamBand * 2.1;
        const ptsY = streamYs[g];

        ctx.beginPath();
        for (let s = 0; s <= steps; s += 1) {
          const xNorm = xNorms[s];
          const py =
            baseY +
            focalDelta * convergenceArr[s] +
            Math.sin(xNorm * freqPi24 + pPhase) * goldAmpP +
            Math.cos(xNorm * freqPi41 + sPhase) * goldAmpS +
            Math.sin(xNorm * pi115 + wPhase) * goldAmpW;

          ptsY[s] = py;
          if (s === 0) ctx.moveTo(pxCoords[s], py);
          else ctx.lineTo(pxCoords[s], py);
        }

        const parity = g & 1;
        ctx.strokeStyle = GOLD_AURA_STYLES[parity];
        ctx.lineWidth = parity === 0 ? 4.2 : 3.0;
        ctx.stroke();

        ctx.strokeStyle = GOLD_CORE_STYLES[parity];
        ctx.lineWidth = parity === 0 ? 1.25 : 0.95;
        ctx.stroke();

        const pulseCenter =
          ((time * (0.09 + (g % 3) * 0.02) + g * 0.31) % 1.2) - 0.1;
        const pulseSpan = 0.22;
        const sStart = Math.max(0, Math.floor((pulseCenter - pulseSpan) * steps));
        const sEnd = Math.min(steps, Math.ceil((pulseCenter + pulseSpan) * steps));

        if (sEnd > sStart) {
          ctx.beginPath();
          for (let s = sStart; s <= sEnd; s += 1) {
            if (s === sStart) ctx.moveTo(pxCoords[s], ptsY[s]);
            else ctx.lineTo(pxCoords[s], ptsY[s]);
          }
          ctx.strokeStyle = 'rgba(242, 234, 218, 0.7)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }

      // 4. Drifting golden waypoint nodes interpolated directly from cached stream buffers
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (!reducedMotion) {
          p.u = (p.u + p.speed * dt) % 1;
        }

        const edgeFade = Math.sin(p.u * Math.PI);
        const alpha = p.alpha * edgeFade;
        if (alpha <= 0.03) continue;

        const ptsY = streamYs[p.bandIdx];
        const fIdx = p.u * steps;
        const idx0 = Math.min(steps - 1, Math.floor(fIdx));
        const frac = fIdx - idx0;
        const py = ptsY[idx0] + (ptsY[idx0 + 1] - ptsY[idx0]) * frac;
        const px = startX + p.u * spanW;

        const alphaBucket = Math.min(
          ALPHA_STEPS,
          Math.max(1, Math.round(alpha * ALPHA_STEPS))
        );

        ctx.fillStyle = PARTICLE_FILL_COLORS[alphaBucket];
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.hasRing) {
          ctx.strokeStyle = PARTICLE_RING_COLORS[alphaBucket];
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 3.1, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();

      // 5. Subtle focal meridian compass ring at the active chapter focal center
      const ringRadius = 46 + Math.sin(time * 1.4) * 4;
      ctx.strokeStyle = 'rgba(213, 189, 139, 0.24)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(fxPx, fyPx, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(184, 154, 98, 0.15)';
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(fxPx, fyPx, ringRadius + 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      if (nowMs - state.lastRotReportMs >= 160 || dt === 0) {
        const rotDeg = ((rotation * 180) / Math.PI).toFixed(1);
        if (state.lastReportedRot !== rotDeg) {
          state.lastReportedRot = rotDeg;
          wrapper.dataset.rotationDeg = rotDeg;
        }
        state.lastRotReportMs = nowMs;
      }
    };

    // Draw initial crisp frame immediately
    drawFrame(0, performance.now());
    if (reducedMotion) return;

    let rafId = 0;
    let isWrapperInView = true;
    let lastTs = performance.now();

    const shouldAnimate = () =>
      isWrapperInView && sectionVisibleRef.current && !document.hidden;

    const tick = (now: number) => {
      rafId = 0;
      if (!shouldAnimate()) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      drawFrame(dt, now);
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (!rafId && shouldAnimate()) {
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

    wakeLoopRef.current = () => {
      if (shouldAnimate()) startLoop();
      else stopLoop();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isWrapperInView = entry.isIntersecting;
        if (shouldAnimate()) startLoop();
        else stopLoop();
      },
      { threshold: 0.01 }
    );
    observer.observe(wrapper);

    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        syncSize();
        drawFrame(0, performance.now());
      }, 60);
    });
    resizeObserver.observe(wrapper);

    const onVisChange = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener('visibilitychange', onVisChange);

    startLoop();

    return () => {
      wakeLoopRef.current = null;
      stopLoop();
      if (resizeTimer) window.clearTimeout(resizeTimer);
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
      className="relative h-full w-full overflow-hidden bg-[#040D1B]/72"
      style={{ contain: 'layout paint' }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="relative block h-full w-full"
        style={{ transform: 'translateZ(0)' }}
      />
    </div>
  );
};

import type { MonumentPieceId } from './sculptureBuilder';

export const INTRO_ASSEMBLY_END_SEC = 2.48;
export const INTRO_SHOWCASE_HANDOFF_SEC = 2.62;
export const INTRO_HOLD_END_SEC = 2.68;
export const INTRO_TOTAL_DURATION_SEC = 3.18;

export interface IntroStageWindow {
  pieceId: MonumentPieceId;
  roman: string;
  label: string;
  startSec: number;
  endSec: number;
}

export const INTRO_STAGE_WINDOWS: IntroStageWindow[] = [
  {
    pieceId: 'plinth',
    roman: 'I',
    label: 'Stepped Navy & Brass Plinth',
    startSec: 0.0,
    endSec: 0.56,
  },
  {
    pieceId: 'book',
    roman: 'II',
    label: 'Open Gilded Tome',
    startSec: 0.38,
    endSec: 1.04,
  },
  {
    pieceId: 'laurels',
    roman: 'III',
    label: 'Sovereign Laurel Wreaths',
    startSec: 0.74,
    endSec: 1.42,
  },
  {
    pieceId: 'globe',
    roman: 'IV',
    label: 'Relief World Globe',
    startSec: 1.12,
    endSec: 1.88,
  },
  {
    pieceId: 'pillar',
    roman: 'V',
    label: 'Classical Brass Podium',
    startSec: 1.48,
    endSec: 2.12,
  },
  {
    pieceId: 'shield',
    roman: 'VI',
    label: 'Heraldic LISMUN Shield',
    startSec: 1.82,
    endSec: 2.48,
  },
];

export interface PiecePoseState {
  visible: boolean;
  scale: number;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export interface IntroFramePose {
  assemblyProgress: number;
  overlayOpacity: number;
  wordmarkOpacity: number;
  wordmarkOffsetY: number;
  activeStageRoman: string;
  activeStageLabel: string;
  isShowcaseReady: boolean;
  isComplete: boolean;
  cameraPos: [number, number, number];
  shadowOpacity: number;
  plinth: PiecePoseState;
  book: PiecePoseState;
  bookWingAngle: number;
  laurels: PiecePoseState;
  leftWreathOffsetX: number;
  leftWreathTiltZ: number;
  rightWreathOffsetX: number;
  rightWreathTiltZ: number;
  globe: PiecePoseState;
  globeSphereRotY: number;
  pillar: PiecePoseState;
  shield: PiecePoseState;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutQuint(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 5);
}

function stageProgress(elapsedSec: number, startSec: number, endSec: number): number {
  if (elapsedSec <= startSec) return 0;
  if (elapsedSec >= endSec) return 1;
  return (elapsedSec - startSec) / Math.max(endSec - startSec, 1e-4);
}

function quickRevealScale(t: number): number {
  if (t <= 0) return 0.001;
  return 0.18 + 0.82 * easeOutCubic(clamp01(t * 2.2));
}

export function evaluateIntroFramePose(elapsedSec: number): IntroFramePose {
  const t = Math.max(0, elapsedSec);

  const pPlinth = stageProgress(t, 0.0, 0.56);
  const pBook = stageProgress(t, 0.38, 1.04);
  const pLaurels = stageProgress(t, 0.74, 1.42);
  const pGlobe = stageProgress(t, 1.12, 1.88);
  const pPillar = stageProgress(t, 1.48, 2.12);
  const pShield = stageProgress(t, 1.82, 2.48);

  const ePlinth = easeOutQuint(pPlinth);
  const eBook = easeOutQuint(pBook);
  const eLaurels = easeOutQuint(pLaurels);
  const eGlobe = easeOutQuint(pGlobe);
  const ePillar = easeOutQuint(pPillar);
  const eShield = easeOutQuint(pShield);

  // Camera sweeps smoothly from a cinematic side angle into exact Hero framing
  const camT = easeOutCubic(clamp01(t / INTRO_ASSEMBLY_END_SEC));
  const cameraPos: [number, number, number] = [
    1.55 + (0.55 - 1.55) * camT,
    2.68 + (2.32 - 2.68) * camT,
    7.25 + (6.45 - 7.25) * camT,
  ];

  // Active stage caption
  let activeStageRoman = 'I';
  let activeStageLabel = 'Stepped Navy & Brass Plinth';
  for (const stage of INTRO_STAGE_WINDOWS) {
    if (t >= stage.startSec) {
      activeStageRoman = stage.roman;
      activeStageLabel = stage.label;
    }
  }
  if (t >= INTRO_ASSEMBLY_END_SEC) {
    activeStageRoman = 'I–VI';
    activeStageLabel = 'Emblem Assembled · Session I';
  }

  // Wordmark enters gently mid-build and holds crisp through completion
  const wordmarkT = easeOutCubic(stageProgress(t, 0.55, 1.35));
  const fadeOutT = stageProgress(
    t,
    INTRO_HOLD_END_SEC,
    INTRO_TOTAL_DURATION_SEC
  );
  const overlayOpacity = 1 - easeOutCubic(fadeOutT);

  return {
    assemblyProgress: clamp01(t / INTRO_ASSEMBLY_END_SEC),
    overlayOpacity,
    wordmarkOpacity: wordmarkT,
    wordmarkOffsetY: (1 - wordmarkT) * 14,
    activeStageRoman,
    activeStageLabel,
    isShowcaseReady: t >= INTRO_SHOWCASE_HANDOFF_SEC,
    isComplete: t >= INTRO_TOTAL_DURATION_SEC,
    cameraPos,
    shadowOpacity: 0.74 * ePlinth,
    plinth: {
      visible: pPlinth > 0,
      scale: quickRevealScale(pPlinth),
      x: 0,
      y: -1.35 * (1 - ePlinth) || 0,
      z: 0,
      rotX: 0,
      rotY: -0.35 * (1 - ePlinth) || 0,
      rotZ: 0,
    },
    book: {
      visible: pBook > 0,
      scale: quickRevealScale(pBook),
      x: 0,
      y: 0.84 + 1.38 * (1 - eBook),
      z: 0.24 + 0.55 * (1 - eBook),
      rotX: -0.28 * (1 - eBook) || 0,
      rotY: 0,
      rotZ: 0,
    },
    bookWingAngle: 0.22 + (1.18 - 0.22) * (1 - easeOutCubic(pBook)),
    laurels: {
      visible: pLaurels > 0,
      scale: quickRevealScale(pLaurels),
      x: 0,
      y: 0.92 + 0.36 * (1 - eLaurels),
      z: 0.05 - 0.55 * (1 - eLaurels),
      rotX: 0,
      rotY: 0,
      rotZ: 0,
    },
    leftWreathOffsetX: -1.72 * (1 - eLaurels) || 0,
    leftWreathTiltZ: 0.38 * (1 - eLaurels),
    rightWreathOffsetX: 1.72 * (1 - eLaurels),
    rightWreathTiltZ: -0.38 * (1 - eLaurels) || 0,
    globe: {
      visible: pGlobe > 0,
      scale: quickRevealScale(pGlobe),
      x: 0,
      y: 2.08 + 1.75 * (1 - eGlobe),
      z: -0.22 - 0.85 * (1 - eGlobe),
      rotX: 0,
      rotY: 0,
      rotZ: 0,
    },
    globeSphereRotY: -Math.PI * 0.56 + Math.PI * 1.15 * (1 - eGlobe),
    pillar: {
      visible: pPillar > 0,
      scale: quickRevealScale(pPillar),
      x: 0,
      y: 0.89 - 1.15 * (1 - ePillar),
      z: 0.74 + 0.78 * (1 - ePillar),
      rotX: 0.16 * (1 - ePillar),
      rotY: 0,
      rotZ: 0,
    },
    shield: {
      visible: pShield > 0,
      scale: quickRevealScale(pShield),
      x: 0,
      y: 2.38 + 1.05 * (1 - eShield),
      z: 0.77 + 1.55 * (1 - eShield),
      rotX: -0.32 * (1 - eShield) || 0,
      rotY: 0.22 * (1 - eShield),
      rotZ: 0,
    },
  };
}

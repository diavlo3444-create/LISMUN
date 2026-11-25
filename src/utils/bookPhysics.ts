import { clamp } from './cartography';

export type BookPhaseLabel =
  | 'COVER'
  | 'CHAPTER I · RESEARCH'
  | 'CHAPTER II · DEBATE'
  | 'CHAPTER III · DIPLOMACY'
  | 'CHAPTER IV · RESOLUTION'
  | 'CLOSING FOLIO';

/**
 * Discrete book states:
 *   0 = Closed Front Cover
 *   1 = Chapter I (Research)
 *   2 = Chapter II (Debate)
 *   3 = Chapter III (Diplomacy)
 *   4 = Chapter IV (Resolution)
 *   5 = Closed Back-Out Folio + Golden Exit Route
 */
export type BookStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface DiscreteBookState {
  step: BookStep;
  leafFlipped: [boolean, boolean, boolean, boolean];
  leafAngles: [number, number, number, number];
  leafZIndices: [number, number, number, number];
  bookTranslateXPercent: number;
  bookScale: number;
  bookOpacity: number;
  exitRouteComplete: boolean;
  activeChapterIndex: 0 | 1 | 2 | 3;
  isBookOpen: boolean;
  phaseLabel: BookPhaseLabel;
  leftStackWeight: number;
  rightStackWeight: number;
}

/**
 * Canonical normalized scroll snap stops (0..1) aligned with ScrollTrigger.snap
 */
export const BOOK_SNAP_POINTS: readonly number[] = [
  0.0,
  0.18,
  0.36,
  0.54,
  0.72,
  0.94,
];

const PHASE_LABELS: readonly BookPhaseLabel[] = [
  'COVER',
  'CHAPTER I · RESEARCH',
  'CHAPTER II · DEBATE',
  'CHAPTER III · DIPLOMACY',
  'CHAPTER IV · RESOLUTION',
  'CLOSING FOLIO',
];

/**
 * Stack order for leaf index 0..3 (0 = Front Cover, 3 = Final Sheet).
 * Unflipped leaves on right stack descending [40, 30, 20, 10];
 * Flipped leaves on left stack ascending [10, 20, 30, 40].
 */
export function computeLeafZIndex(leafIndex: number, isFlipped: boolean): number {
  return isFlipped ? 10 + leafIndex * 10 : 40 - leafIndex * 10;
}

/**
 * Maps continuous scroll progress (0..1) cleanly into a discrete book step (0..5)
 * without triggering continuous per-pixel re-renders.
 */
export function getStepFromScrollProgress(rawProgress: number): BookStep {
  const p = clamp(rawProgress, 0, 1);
  if (p < 0.09) return 0;
  if (p < 0.27) return 1;
  if (p < 0.45) return 2;
  if (p < 0.63) return 3;
  if (p < 0.83) return 4;
  return 5;
}

/**
 * Returns the canonical scroll progress (0..1) for a discrete book step (0..5).
 */
export function getProgressForBookStep(step: BookStep): number {
  return BOOK_SNAP_POINTS[step] ?? 0;
}

/**
 * Convenience helper converting chapter index (0..3) to discrete step (1..4).
 */
export function getChapterStep(chapterIndex: number): BookStep {
  return (clamp(Math.round(chapterIndex), 0, 3) + 1) as BookStep;
}

/**
 * Computes pure discrete GPU-composited state for any step (0..5).
 */
export function computeDiscreteBookState(step: BookStep): DiscreteBookState {
  const isOpen = step >= 1 && step <= 4;
  const flippedCount = isOpen ? step : 0;

  const leafFlipped: [boolean, boolean, boolean, boolean] = [
    flippedCount >= 1,
    flippedCount >= 2,
    flippedCount >= 3,
    flippedCount >= 4,
  ];

  const leafAngles: [number, number, number, number] = [
    leafFlipped[0] ? -180 : 0,
    leafFlipped[1] ? -180 : 0,
    leafFlipped[2] ? -180 : 0,
    leafFlipped[3] ? -180 : 0,
  ];

  const leafZIndices: [number, number, number, number] = [
    computeLeafZIndex(0, leafFlipped[0]),
    computeLeafZIndex(1, leafFlipped[1]),
    computeLeafZIndex(2, leafFlipped[2]),
    computeLeafZIndex(3, leafFlipped[3]),
  ];

  const activeChapterIndex: 0 | 1 | 2 | 3 =
    step === 0 ? 0 : step === 5 ? 3 : ((step - 1) as 0 | 1 | 2 | 3);

  return {
    step,
    leafFlipped,
    leafAngles,
    leafZIndices,
    bookTranslateXPercent: isOpen ? 0 : -25,
    bookScale: step === 0 ? 0.94 : step === 5 ? 0.88 : 1,
    bookOpacity: step === 5 ? 0.55 : 1,
    exitRouteComplete: step === 5,
    activeChapterIndex,
    isBookOpen: isOpen,
    phaseLabel: PHASE_LABELS[step],
    leftStackWeight: flippedCount / 4,
    rightStackWeight: (4 - flippedCount) / 4,
  };
}

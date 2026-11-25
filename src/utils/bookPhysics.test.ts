import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOK_SNAP_POINTS,
  computeDiscreteBookState,
  computeLeafZIndex,
  getChapterStep,
  getProgressForBookStep,
  getStepFromScrollProgress,
} from './bookPhysics';

test('computeLeafZIndex reverses stack order between unflipped right and flipped left stacks', () => {
  assert.equal(computeLeafZIndex(0, false), 40);
  assert.equal(computeLeafZIndex(1, false), 30);
  assert.equal(computeLeafZIndex(2, false), 20);
  assert.equal(computeLeafZIndex(3, false), 10);

  assert.equal(computeLeafZIndex(0, true), 10);
  assert.equal(computeLeafZIndex(1, true), 20);
  assert.equal(computeLeafZIndex(2, true), 30);
  assert.equal(computeLeafZIndex(3, true), 40);
});

test('getStepFromScrollProgress maps scroll bands cleanly to discrete snap stops', () => {
  assert.equal(getStepFromScrollProgress(0), 0);
  assert.equal(getStepFromScrollProgress(0.18), 1);
  assert.equal(getStepFromScrollProgress(0.36), 2);
  assert.equal(getStepFromScrollProgress(0.54), 3);
  assert.equal(getStepFromScrollProgress(0.72), 4);
  assert.equal(getStepFromScrollProgress(0.94), 5);

  // Every canonical snap stop round-trips to its exact step
  BOOK_SNAP_POINTS.forEach((progress, idx) => {
    assert.equal(getStepFromScrollProgress(progress), idx);
    assert.equal(getProgressForBookStep(idx as 0 | 1 | 2 | 3 | 4 | 5), progress);
  });
});

test('computeDiscreteBookState steps cleanly from Cover through Chapter I-IV to Closing Folio', () => {
  const cover = computeDiscreteBookState(0);
  assert.deepEqual(cover.leafAngles, [0, 0, 0, 0]);
  assert.equal(cover.bookTranslateXPercent, -25);
  assert.equal(cover.isBookOpen, false);
  assert.equal(cover.phaseLabel, 'COVER');
  assert.equal(cover.exitRouteComplete, false);

  const ch1 = computeDiscreteBookState(getChapterStep(0));
  assert.deepEqual(ch1.leafAngles, [-180, 0, 0, 0]);
  assert.equal(ch1.bookTranslateXPercent, 0);
  assert.equal(ch1.isBookOpen, true);
  assert.equal(ch1.activeChapterIndex, 0);
  assert.equal(ch1.phaseLabel, 'CHAPTER I · RESEARCH');

  const ch2 = computeDiscreteBookState(getChapterStep(1));
  assert.deepEqual(ch2.leafAngles, [-180, -180, 0, 0]);
  assert.equal(ch2.activeChapterIndex, 1);
  assert.equal(ch2.phaseLabel, 'CHAPTER II · DEBATE');

  const ch3 = computeDiscreteBookState(getChapterStep(2));
  assert.deepEqual(ch3.leafAngles, [-180, -180, -180, 0]);
  assert.equal(ch3.activeChapterIndex, 2);
  assert.equal(ch3.phaseLabel, 'CHAPTER III · DIPLOMACY');

  const ch4 = computeDiscreteBookState(getChapterStep(3));
  assert.deepEqual(ch4.leafAngles, [-180, -180, -180, -180]);
  assert.equal(ch4.activeChapterIndex, 3);
  assert.equal(ch4.phaseLabel, 'CHAPTER IV · RESOLUTION');

  const closing = computeDiscreteBookState(5);
  assert.deepEqual(closing.leafAngles, [0, 0, 0, 0]);
  assert.equal(closing.bookTranslateXPercent, -25);
  assert.equal(closing.isBookOpen, false);
  assert.equal(closing.exitRouteComplete, true);
  assert.equal(closing.phaseLabel, 'CLOSING FOLIO');
});
